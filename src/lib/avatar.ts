// ============================================================================
// Avatar reference helpers.
//
// The canonical server-backed avatar reference is the Storage object path
// (`avatars/<user-id>/<file>`). Records may store it in several shapes:
//   * a bare path:            avatars/<uid>/<file>
//   * a public-style URL:     https://<project>.supabase.co/storage/v1/object/public/avatars/<uid>/<file>
//   * an already-signed URL:  https://<project>.supabase.co/storage/v1/object/sign/avatars/<uid>/<file>?token=...
//
// The `avatars` bucket is PRIVATE, so public-style URLs 404. These helpers
// normalize any stored reference back to the object path so it can be
// re-signed with createSignedUrl() at render time. External URLs (Google
// avatars, preset images) and inline data URLs pass through untouched.
// ============================================================================

export const AVATAR_BUCKET = "avatars";
export const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

export type AvatarRefKind = "none" | "direct" | "storage";

export interface AvatarRefClassification {
  kind: AvatarRefKind;
  /** Storage object path (`avatars/<uid>/<file>`) when kind === "storage". */
  path: string | null;
  /** Pass-through URL when kind === "direct" (data:, external http(s)). */
  direct: string | null;
}

const PUBLIC_MARKER = "/storage/v1/object/public/avatars/";
const SIGN_MARKER = "/storage/v1/object/sign/avatars/";

/** Strip a signed-URL query string (`?token=...`) and stray slashes. */
function cleanObjectPath(value: string): string {
  const withoutQuery = value.includes("?") ? value.slice(0, value.indexOf("?")) : value;
  return withoutQuery.replace(/^\/+/, "");
}

/**
 * Classify a stored avatar reference. Storage-backed references are reduced to
 * their object path; everything else is either passed through or ignored.
 */
export function classifyAvatarRef(ref: string | null | undefined): AvatarRefClassification {
  const trimmed = (ref ?? "").trim();
  if (!trimmed) return { kind: "none", path: null, direct: null };

  // Inline images render as-is.
  if (trimmed.startsWith("data:")) return { kind: "direct", path: null, direct: trimmed };

  // Already-signed storage URL → re-sign the underlying object path.
  // Both markers end in "avatars/", so the extracted segment must be
  // re-prefixed to form the full object path createSignedUrl expects.
  const signIdx = trimmed.indexOf(SIGN_MARKER);
  if (signIdx !== -1) {
    const remainder = cleanObjectPath(trimmed.slice(signIdx + SIGN_MARKER.length));
    return remainder
      ? { kind: "storage", path: `avatars/${remainder}`, direct: null }
      : { kind: "none", path: null, direct: null };
  }

  // Public-style storage URL (broken while the bucket is private) → object path.
  const publicIdx = trimmed.indexOf(PUBLIC_MARKER);
  if (publicIdx !== -1) {
    const remainder = cleanObjectPath(trimmed.slice(publicIdx + PUBLIC_MARKER.length));
    return remainder
      ? { kind: "storage", path: `avatars/${remainder}`, direct: null }
      : { kind: "none", path: null, direct: null };
  }

  // Bare storage path forms: avatars/…, /avatars/…, public/avatars/…
  const bare = trimmed.replace(/^\/+/, "");
  if (bare.startsWith("avatars/")) {
    const path = cleanObjectPath(bare);
    return path
      ? { kind: "storage", path, direct: null }
      : { kind: "none", path: null, direct: null };
  }
  if (bare.startsWith("public/avatars/")) {
    const path = cleanObjectPath(bare.slice("public/".length));
    return path
      ? { kind: "storage", path, direct: null }
      : { kind: "none", path: null, direct: null };
  }

  // Any other absolute URL (Google avatar, preset image, CDN) is direct.
  if (/^https?:\/\//i.test(trimmed)) return { kind: "direct", path: null, direct: trimmed };

  // Unknown shapes are ignored so surfaces can render initials instead of a
  // broken image.
  return { kind: "none", path: null, direct: null };
}

/** Single-letter fallback for the initials avatar (matches existing SVJ UI). */
export function avatarInitials(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "V";
  return clean.slice(0, 1).toUpperCase();
}
