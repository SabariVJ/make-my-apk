// Update 05 — Recovery / Readiness client.
//
// Thin typed wrappers over the self-service recovery RPCs. Identity and all
// score math live in the database (deterministic, database clock); the client
// sends only explicit check-in values.
import { rewardsRpcClient, type RpcClient } from "./rewards";

export interface ReadinessData {
  score: number;
  trainingLoad: "low" | "moderate" | "high" | "very_high";
  recovery: "poor" | "fair" | "good" | "excellent" | "unknown";
  todayAdvice: string;
  components: {
    loadPoints7d?: number;
    loadBand?: string;
    restDaysLast3?: number;
    loadPenalty?: number;
    sleepHours?: number | null;
    soreness?: number | null;
    energy?: number | null;
    perceivedRecovery?: number | null;
    dataSources?: string[];
  };
}

export interface RecoveryHistoryPoint {
  date: string;
  score: number;
  trainingLoad: string;
  recovery: string;
  /** True when a check-in row exists for that day on the server. */
  hasCheckin: boolean;
  /** The athlete's own check-in — the durable copy, not a local cache. */
  sleepHours: number | null;
  soreness: number | null;
  energy: number | null;
  perceivedRecovery: number | null;
  /** Real recorded-activity load behind that day's score. */
  activityLoadPoints: number;
  restDaysLast3: number | null;
}

export interface CheckinInput {
  sleepHours: number | null;
  soreness: number | null;
  energy: number | null;
  perceivedRecovery: number | null;
}

/** Finite number, or null — never a fabricated zero for a missing input. */
function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReadiness(raw: unknown): ReadinessData | null {
  if (!raw || typeof raw !== "object") return null;
  const env = raw as Record<string, unknown>;
  if (typeof env.score !== "number") return null;
  const components =
    env.components && typeof env.components === "object"
      ? (env.components as ReadinessData["components"])
      : {};
  return {
    score: env.score,
    trainingLoad: (env.trainingLoad as ReadinessData["trainingLoad"]) ?? "moderate",
    recovery: (env.recovery as ReadinessData["recovery"]) ?? "unknown",
    todayAdvice: typeof env.todayAdvice === "string" ? env.todayAdvice : "Train normally.",
    components,
  };
}

export async function getMyReadiness(): Promise<{
  ok: boolean;
  readiness?: ReadinessData;
  error?: string;
}> {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  try {
    const { data, error } = await client.rpc("svj_get_my_readiness");
    if (error) return { ok: false, error: error.message || "Readiness failed." };
    const readiness = normalizeReadiness(data);
    if (!readiness) return { ok: false, error: "Unreadable readiness response." };
    return { ok: true, readiness };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function saveMyRecoveryCheckin(
  input: CheckinInput,
): Promise<{ ok: boolean; readiness?: ReadinessData; error?: string }> {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  if (
    input.sleepHours === null &&
    input.soreness === null &&
    input.energy === null &&
    input.perceivedRecovery === null
  ) {
    return { ok: false, error: "Fill at least one field." };
  }
  try {
    const { data, error } = await client.rpc("svj_save_my_recovery_checkin", {
      p_sleep_hours: input.sleepHours,
      p_soreness: input.soreness,
      p_energy: input.energy,
      p_perceived_recovery: input.perceivedRecovery,
    });
    if (error) return { ok: false, error: error.message || "Check-in failed." };
    const readiness = normalizeReadiness(data);
    if (!readiness) return { ok: false, error: "Unreadable readiness response." };
    return { ok: true, readiness };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function listMyRecoveryHistory(
  limit = 30,
): Promise<{ ok: boolean; history?: RecoveryHistoryPoint[]; error?: string }> {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  try {
    const { data, error } = await client.rpc("svj_list_my_recovery_history", {
      p_limit: limit,
    });
    if (error) return { ok: false, error: error.message || "History failed." };
    const history = Array.isArray(data)
      ? data
          .map((row) => {
            const r = row as Record<string, unknown>;
            return {
              date: String(r.date ?? ""),
              score: typeof r.score === "number" ? r.score : 0,
              trainingLoad: String(r.trainingLoad ?? "moderate"),
              recovery: String(r.recovery ?? "unknown"),
              hasCheckin: r.hasCheckin === true,
              sleepHours: numericOrNull(r.sleepHours),
              soreness: numericOrNull(r.soreness),
              energy: numericOrNull(r.energy),
              perceivedRecovery: numericOrNull(r.perceivedRecovery),
              activityLoadPoints: numericOrNull(r.loadPoints7d) ?? 0,
              restDaysLast3: numericOrNull(r.restDaysLast3),
            };
          })
          .filter((p) => p.date !== "")
      : [];
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export type { RpcClient };
