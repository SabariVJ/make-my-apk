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

/**
 * Admin dashboard entry: appended ONLY when the caller resolved an admin role
 * row for the current user. For everyone else this list is byte-identical to
 * before — no trace of the admin surface exists in their UI.
 */
const ADMIN_NAV_ITEM: UtilityNavItem = { id: "admin", label: "Admin" };

/** Android Play hides the unfinished Leaderboard claim, exactly as before. */
export function visibleUtilityItems(isAndroid: boolean, isAdmin = false): UtilityNavItem[] {
  const items = UTILITY_NAV_ITEMS.filter((item) => !(isAndroid && item.id === "leaderboard"));
  return isAdmin ? [...items, ADMIN_NAV_ITEM] : items;
}
