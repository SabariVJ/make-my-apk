import React, { useEffect, useState } from "react";
import { useAvatarUrl } from "../hooks/useAvatarUrl";
import { avatarMonogram, avatarPalette } from "@/lib/avatar";

interface AvatarImageProps {
  src?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
}

/**
 * Avatar that resolves private-bucket storage references into signed URLs at
 * render time. Falls back to an initials tile instead of a broken image when
 * there is no avatar, the ref is unreadable, or signing fails.
 */
export const AvatarImage: React.FC<AvatarImageProps> = ({ src, name, alt, className = "" }) => {
  const url = useAvatarUrl(src);
  const [failed, setFailed] = useState(false);

  // A changed reference (e.g. after replacing the avatar) must retry rendering.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt ?? name ?? "Avatar"}
        loading="lazy"
        onError={() => setFailed(true)}
        className={className}
      />
    );
  }

  // Designed fallback: a deterministic two-tone monogram tile. Never a bare
  // letter on a flat grey circle.
  const palette = avatarPalette(name);
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden border border-white/10 svj-lit-top ${className}`}
      style={{ background: palette.bg }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 120% at 28% 0%, ${palette.fg}33 0%, transparent 62%)`,
        }}
      />
      <span
        className="relative font-anton text-[0.9em] uppercase tracking-wide"
        style={{ color: palette.fg }}
      >
        {avatarMonogram(name)}
      </span>
    </div>
  );
};
