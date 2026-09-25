import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ SectionHeader — sits above every major content block.
 *
 * Sentence case by default. All-caps was previously applied to every section
 * regardless of content, which made caps meaningless; caps is now reserved for
 * genuine badges/tags (pass `variant="badge"` only for a real tag or tier).
 *
 * The leading crimson tick is the shared visual signature so sections read as
 * one system instead of "bold word + grey word" repeated down the page.
 */
export const SVJSectionHeader: React.FC<{
  title: string;
  icon?: LucideIcon;
  /** Optional small uppercase eyebrow above the title (use sparingly). */
  eyebrow?: string;
  /** Optional trailing element on the right side (e.g. a "See all" link). */
  trailing?: React.ReactNode;
  /** "badge" renders caps + Anton; use only for real tags/tiers. */
  variant?: "default" | "badge";
  className?: string;
}> = ({ title, icon: Icon, eyebrow, trailing, variant = "default", className = "" }) => (
  <div className={`flex items-end justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      {eyebrow && (
        <p className="mb-0.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]">
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-2">
        {variant === "default" ? (
          <span aria-hidden className="h-3.5 w-1 shrink-0 rounded-full bg-[#C81E3A]" />
        ) : (
          Icon && <Icon aria-hidden className="h-4 w-4 shrink-0 text-[#C9A227]" />
        )}
        <h3
          className={
            variant === "badge"
              ? "font-anton text-sm uppercase tracking-wider text-[#F4F2ED]"
              : "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]"
          }
        >
          {title}
        </h3>
        {variant === "default" && Icon && (
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-[#8C8C90]" />
        )}
      </div>
    </div>
    {trailing && <div className="shrink-0">{trailing}</div>}
  </div>
);
