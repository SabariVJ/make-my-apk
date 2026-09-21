import React from "react";

type BadgeVariant = "crimson" | "amber" | "emerald" | "purple" | "gold" | "subtle";

/**
 * Compact inline badge. Used for difficulty, status labels, and small metadata.
 */
export const SVJBadge: React.FC<{
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}> = ({ variant = "subtle", children, className = "" }) => {
  const styles: Record<BadgeVariant, string> = {
    crimson: "bg-[#C81E3A]/10 text-[#C81E3A] border border-[#C81E3A]/25",
    amber: "bg-gold/10 text-gold border border-gold/25",
    emerald: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
    purple: "bg-purple-500/10 text-purple-400 border border-purple-500/25",
    gold: "bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/25",
    subtle: "bg-white/[0.04] text-[#8C8C90] border border-white/[0.06]",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-2xl text-[10px] font-inter font-semibold tracking-wide uppercase ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
