// ============================================================================
// Signed-avatar URL hook.
//
// Resolves a stored avatar reference into a displayable URL at render time:
//   * storage-backed references → Supabase createSignedUrl() (private bucket)
//   * external / data URLs      → passed through unchanged
//   * missing / unreadable      → null, so surfaces render initials
//
// Signed URLs are cached per object path with a safety margin and refreshed
// before they expire. When the user replaces their avatar, bumpAvatarRevision()
// clears the cache and re-resolves every mounted surface immediately.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET, AVATAR_SIGNED_URL_TTL_SECONDS, classifyAvatarRef } from "@/lib/avatar";

interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const listeners = new Set<() => void>();

/** Refresh every signed avatar URL (call after the user replaces an avatar). */
export function bumpAvatarRevision(): void {
  signedUrlCache.clear();
  for (const listener of listeners) listener();
}

export function useAvatarUrl(ref?: string | null): string | null {
  const classified = useMemo(() => classifyAvatarRef(ref ?? null), [ref]);
  const [url, setUrl] = useState<string | null>(
    classified.kind === "direct" ? classified.direct : null,
  );
  const [revision, setRevision] = useState(0);

  // Re-resolve after bumpAvatarRevision() so a replaced avatar (even at the
  // same object path) appears immediately on every surface.
  useEffect(() => {
    const onChange = () => setRevision((r) => r + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (classified.kind === "direct") {
      setUrl(classified.direct);
      return;
    }
    if (classified.kind === "none") {
      setUrl(null);
      return;
    }

    const path = classified.path as string;
    let cancelled = false;

    const resolve = async () => {
      const cached = signedUrlCache.get(path);
      // Keep a 60s safety margin so a URL is never used past its expiry.
      if (cached && cached.expiresAt > Date.now() + 60_000) {
        if (!cancelled) setUrl(cached.url);
        return;
      }
      try {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
        if (error || !data?.signedUrl) throw error ?? new Error("No signed URL returned");
        signedUrlCache.set(path, {
          url: data.signedUrl,
          expiresAt: Date.now() + AVATAR_SIGNED_URL_TTL_SECONDS * 1000,
        });
        if (!cancelled) setUrl(data.signedUrl);
      } catch {
        // Fall back to initials rather than showing a broken image.
        if (!cancelled) setUrl(null);
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [classified, revision]);

  return url;
}
