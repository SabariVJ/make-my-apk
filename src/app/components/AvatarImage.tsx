import React, { useEffect, useState } from "react";
import { useAvatarUrl } from "../hooks/useAvatarUrl";
import { avatarInitials } from "@/lib/avatar";

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

  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-[#17171A] border border-white/10 font-anton text-white uppercase ${className}`}
    >
      {avatarInitials(name)}
    </div>
  );
};
