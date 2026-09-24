import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * SVJ ListRow — the standard horizontal row inside surfaces.
 *
 * Replaces the dozens of hand-built "icon + title + trailing value" rows.
 * 48px minimum height keeps Android touch targets comfortable. Renders a
 * <button> when onSelect is given, otherwise a plain row.
 */
export const SVJListRow: React.FC<{
  /** Leading slot: icon, SVJAvatar, or attribute dot. */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Right-aligned value slot (mono numbers, status pill, switch). */
  trailing?: React.ReactNode;
  /** Show the affordance chevron (auto-true when onSelect is provided). */
  chevron?: boolean;
  /** Hairline divider under the row (skip on last row). */
  divider?: boolean;
  onSelect?: () => void;
  className?: string;
}> = ({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  divider = false,
  onSelect,
  className = "",
}) => {
  const showChevron = chevron ?? Boolean(onSelect);
  const inner = (
    <>
      {leading && <div className="shrink-0 flex items-center">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="font-inter text-sm text-svj-text leading-tight truncate">{title}</p>
        {subtitle && <p className="text-xs text-svj-secondary mt-0.5 truncate">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0 flex items-center">{trailing}</div>}
      {showChevron && (
        <ChevronRight className="w-4 h-4 shrink-0 text-svj-muted" aria-hidden="true" />
      )}
    </>
  );

  const rowClasses = `w-full flex items-center gap-3 min-h-12 py-2.5 text-left ${
    divider ? "border-b border-white/[0.04]" : ""
  } ${onSelect ? "transition-colors hover:bg-white/[0.03] svj-press cursor-pointer" : ""} ${className}`;

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={rowClasses}>
        {inner}
      </button>
    );
  }
  return <div className={rowClasses}>{inner}</div>;
};
