// ============================================================================
// SVJ runtime feature flags.
//
// There is no remote-config service in this app, so the flag source is:
//   1. an explicit local override (persisted per device), which wins;
//   2. a `?svj_training_v1=0|1` URL override for an instant rollback without a
//      rebuild or a deploy;
//   3. the compile-time default.
//
// Flags gate PRESENTATION and entry points only. Turning one off never deletes
// or hides stored data: training profiles, templates, plans, decisions and
// completed workouts stay intact and remain readable through the previous flow.
// ============================================================================

export const FEATURE_FLAGS_STORAGE_KEY = "svj_app_state_v5_feature_flags";

export const FEATURE_FLAGS = {
  /** The guided Today / Templates / Progress training experience. */
  automatedTrainingV1: "automated_training_v1",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Rollout defaults. A flag is ON when this map says so and nothing overrides. */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  [FEATURE_FLAGS.automatedTrainingV1]: true,
};

export type FeatureFlagOverrides = Partial<Record<FeatureFlag, boolean>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readFeatureFlagOverrides(store?: Pick<Storage, "getItem">): FeatureFlagOverrides {
  const storage = store ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!storage) return {};
  try {
    const raw = storage.getItem(FEATURE_FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const overrides: FeatureFlagOverrides = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      if (typeof parsed[flag] === "boolean") overrides[flag] = parsed[flag];
    }
    return overrides;
  } catch {
    return {};
  }
}

export function writeFeatureFlagOverride(
  flag: FeatureFlag,
  enabled: boolean,
  store?: Pick<Storage, "setItem" | "getItem">,
): void {
  const storage = store ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!storage) return;
  try {
    const next = { ...readFeatureFlagOverrides(storage), [flag]: enabled };
    storage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A failed write only means the flag falls back to its default.
  }
}

/** `?svj_training_v1=0` (or `=1`) overrides everything until the page reloads. */
export function readUrlFlagOverride(flag: FeatureFlag, search?: string): boolean | null {
  const query = search ?? (typeof window === "undefined" ? "" : window.location.search);
  if (!query) return null;
  try {
    const value = new URLSearchParams(query).get(flag);
    if (value === "0" || value === "false" || value === "off") return false;
    if (value === "1" || value === "true" || value === "on") return true;
    return null;
  } catch {
    return null;
  }
}

export function resolveFeatureFlag(
  flag: FeatureFlag,
  options: { overrides?: FeatureFlagOverrides; search?: string } = {},
): boolean {
  const url = readUrlFlagOverride(flag, options.search);
  if (url !== null) return url;
  const overrides = options.overrides ?? readFeatureFlagOverrides();
  if (typeof overrides[flag] === "boolean") return overrides[flag] as boolean;
  return FEATURE_FLAG_DEFAULTS[flag];
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return resolveFeatureFlag(flag);
}

export function isAutomatedTrainingEnabled(): boolean {
  return isFeatureEnabled(FEATURE_FLAGS.automatedTrainingV1);
}
