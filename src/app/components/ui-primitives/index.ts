/**
 * SVJ PERFORMANCE OS — shared design foundation.
 *
 * The single import surface for UI primitives. New screens should import
 * from this barrel; existing screens migrate incrementally (see
 * docs/SVJ_PERFORMANCE_OS_DESIGN_SYSTEM.md).
 */

// ── Surfaces & structure ──────────────────────────────────────────────
export { SVJSurface, type SurfaceLevel } from "./SVJSurface";
export { SVJCard } from "./SVJCard";
export { SVJHeroCard } from "./SVJHeroCard";
export { SVJMetricCard } from "./SVJMetricCard";
export { SVJInsightCard } from "./SVJInsightCard";
export { SVJActionCard } from "./SVJActionCard";
export { SVJListRow } from "./SVJListRow";
export { SVJSectionHeader } from "./SVJSectionHeader";

// ── Data visualization ────────────────────────────────────────────────
export { SVJScoreRing } from "./SVJScoreRing";
export { SVJProgressMeter } from "./SVJProgressMeter";
export { SVJProgress } from "./SVJProgress";
export { SVJStatDelta } from "./SVJStatDelta";

// ── Signals ───────────────────────────────────────────────────────────
export { SVJStatusPill, type StatusToneName } from "./SVJStatusPill";
export { SVJBadge } from "./SVJBadge";
export { SVJAvatar } from "./SVJAvatar";

// ── States ────────────────────────────────────────────────────────────
export { SVJEmptyState } from "./SVJEmptyState";
export { SVJErrorState } from "./SVJErrorState";
export { SVJSkeleton, SVJSkeletonText, SVJSkeletonCard, SVJSkeletonGrid } from "./SVJSkeleton";

// ── Overlays ──────────────────────────────────────────────────────────
export { SVJResponsiveDialog } from "./SVJResponsiveDialog";
export { SVJBottomSheet } from "./SVJBottomSheet";

// ── Journeys ──────────────────────────────────────────────────────────
export { SVJTimelineStep } from "./SVJTimelineStep";

// ── Pickers ───────────────────────────────────────────────────────────
export { SVJDatePicker } from "./SVJDatePicker";
export { SVJTimePicker } from "./SVJTimePicker";
export { SVJSelect } from "./SVJSelect";
