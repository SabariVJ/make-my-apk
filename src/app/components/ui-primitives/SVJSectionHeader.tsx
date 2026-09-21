import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Section header — used above every major content block.
 *
 * Uses Inter for body and Anton for the title, with consistent spacing.
 * Icon is optional; when provided, it renders in crimson.
 */
export const SVJSectionHeader: React.FC<{
  title: string;
  icon?: LucideIcon;
  /** Optional trailing element on the right side (e.g. "See all" link). */
  trailing?: React.ReactNode;
  className?: string;
}> = ({ title, icon: Icon, trailing, className = "" }) => (
  <div className={`flex items-center justify-between gap-3 ${className}`}>
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-[#C81E3A] shrink-0" />}
      <h3 className="font-anton text-sm uppercase tracking-wider text-[#F4F2ED]">{title}</h3>
    </div>
    {trailing && <div className="shrink-0">{trailing}</div>}
  </div>
);
