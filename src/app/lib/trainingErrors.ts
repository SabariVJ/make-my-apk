/** Sanitize raw PostgREST/Supabase RPC failures into user-safe SVJ messages. */

export interface TrainingRpcFailureMeta {
  /** Stable code for telemetry/diagnostics — never shown raw to the user. */
  code: string;
  /** True when the server deployment is missing the RPC (retry won't help). */
  deploymentProblem: boolean;
}

const DEPLOYMENT_CODES = new Set(["PGRST202", "42883", "42P01"]);

/**
 * Convert a raw RPC error message into a user-safe one. The user never sees
 * PostgREST jargon ("Could not find the function public.svj_… in the schema
 * cache"); a missing deployment is named as such and logged for diagnosis.
 */
export function sanitizeTrainingRpcError(message: string | null | undefined): {
  userMessage: string;
  meta: TrainingRpcFailureMeta;
} {
  const raw = (message ?? "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("could not find the function") ||
    lower.includes("pgrst202") ||
    lower.includes("42883") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache")
  ) {
    return {
      userMessage:
        "Automated training is still rolling out to your account. Please update the app and try again later.",
      meta: { code: "TRAINING_RPC_NOT_DEPLOYED", deploymentProblem: true },
    };
  }
  if (
    lower.includes("authentication required") ||
    lower.includes("jwt") ||
    lower.includes("session")
  ) {
    return {
      userMessage: "Your session has expired. Please sign in again.",
      meta: { code: "TRAINING_RPC_AUTH_REQUIRED", deploymentProblem: false },
    };
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("offline") ||
    lower.includes("connection")
  ) {
    return {
      userMessage: "Couldn't reach the SVJ servers. Check your connection and try again.",
      meta: { code: "TRAINING_RPC_NETWORK", deploymentProblem: false },
    };
  }
  if (raw.length === 0) {
    return {
      userMessage: "Couldn't load your training profile. Please try again.",
      meta: { code: "TRAINING_RPC_UNKNOWN", deploymentProblem: false },
    };
  }
  // Unknown server messages are never shown raw — they can contain SQL,
  // table names, or deployment details.
  return {
    userMessage: "Couldn't load your training profile. Please try again.",
    meta: { code: "TRAINING_RPC_UNKNOWN", deploymentProblem: false },
  };
}
