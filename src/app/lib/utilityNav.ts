// SVJ utility destinations.
//
// These used to occupy bottom-navigation slots. They are secondary surfaces, so
// they live in a right-side rail on desktop/tablet and a compact drawer on
// phones. Kept out of the component file so it only exports components (the
// project's react-refresh convention).
import type { ActiveTab } from "../components/Navigation";

export interface UtilityNavItem {
  id: ActiveTab;
  label: string;
}

/** Rail/drawer order: Community, Leaderboard, Profile. */
export const UTILITY_NAV_ITEMS: UtilityNavItem[] = [
  { id: "community", label: "Community" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "profile", label: "Profile" },
];

/** All utility destinations ship on Android and web. */
export function visibleUtilityItems(_isAndroid: boolean): UtilityNavItem[] {
  return UTILITY_NAV_ITEMS;
}
