import React from "react";

/**
 * SVJ Skeleton — loading placeholders with the svj-shimmer surface.
 *
 * Shimmer is a CSS animation and is disabled automatically under
 * prefers-reduced-motion (see src/styles.css).
 */
export const SVJSkeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`svj-skeleton ${className}`} aria-hidden="true" />
);

/** Text block placeholder: 2 full lines + one short line. */
export const SVJSkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = "",
}) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className={`svj-skeleton h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
    ))}
  </div>
);

/** Card placeholder matching the SVJMetricCard silhouette. */
export const SVJSkeletonCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div
    className={`rounded-2xl border border-white/[0.06] bg-svj-surface p-4 ${className}`}
    aria-hidden="true"
  >
    <div className="svj-skeleton h-2.5 w-16 mb-3" />
    <div className="svj-skeleton h-6 w-24 mb-3" />
    <div className="svj-skeleton h-2 w-full" />
  </div>
);

/** Metric-grid placeholder: a row of SVJSkeletonCard. */
export const SVJSkeletonGrid: React.FC<{ count?: number; className?: string }> = ({
  count = 2,
  className = "",
}) => (
  <div className={`grid grid-cols-2 gap-3 ${className}`} aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <SVJSkeletonCard key={i} />
    ))}
  </div>
);
