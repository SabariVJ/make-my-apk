/**
 * Training profile RPC contract + Build My Program select regressions.
 *
 * Locks the svj_get_my_training_profile() client/SQL contract (no arguments,
 * { ok, profile } envelope) so it cannot silently drift, and verifies the
 * sanitized failure surface: raw PostgREST messages never reach the UI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTrainingProfile, saveTrainingProfile } from "../src/app/lib/trainingClient";
import { sanitizeTrainingRpcError } from "../src/app/lib/trainingErrors";
import { emptyTrainingProfile, normalizeTrainingProfile } from "../src/app/lib/trainingProfile";

const read = (p: string) => readFileSync(p, "utf8");

describe("svj_get_my_training_profile client contract", () => {
  it("calls the RPC with NO arguments (matches the zero-arg SQL signature)", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    const caller = async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: { ok: true, profile: null }, error: null };
    };
    const result = await getTrainingProfile(caller);
    assert.equal(result.ok, true);
    assert.equal(calls[0].fn, "svj_get_my_training_profile");
    // The SQL function takes no parameters; passing any argument breaks the
    // PostgREST schema-cache lookup ("Could not find the function … without
    // parameters"). This guard keeps the contract exact.
    assert.equal(calls[0].args, undefined);
  });

  it("normalizes the { ok, profile } envelope", async () => {
    const profile = normalizeTrainingProfile({
      ...emptyTrainingProfile(),
      setupComplete: true,
      experience: "intermediate",
    });
    const caller = async () => ({ data: { ok: true, profile }, error: null });
    const result = await getTrainingProfile(caller);
    assert.equal(result.ok, true);
    assert.deepEqual(result.profile, profile);
  });

  it("surfaces the RPC error message (sanitized downstream, never raw in UI)", async () => {
    const caller = async () => ({
      data: null,
      error: {
        message:
          "Could not find the function public.svj_get_my_training_profile without parameters in the schema cache",
      },
    });
    const result = await getTrainingProfile(caller);
    assert.equal(result.ok, false);
    assert.match(result.error!, /schema cache/);
  });

  it("save sends the full profile payload under p_profile", async () => {
    const seen: { fn: string; args: Record<string, unknown> }[] = [];
    const caller = async (fn: string, args?: Record<string, unknown>) => {
      seen.push({ fn, args: args ?? {} });
      return { data: { ok: true }, error: null };
    };
    const profile = normalizeTrainingProfile({
      ...emptyTrainingProfile(),
      setupComplete: true,
      sessionsPerWeek: 4,
      sessionMinutes: 60,
    });
    const result = await saveTrainingProfile(caller, profile);
    assert.equal(result.ok, true);
    assert.equal(seen[0].fn, "svj_save_training_profile");
    const payload = seen[0].args.p_profile as Record<string, unknown>;
    assert.equal(payload.sessionsPerWeek, 4);
    assert.equal(payload.sessionMinutes, 60);
  });
});

describe("training RPC failure sanitization", () => {
  it("maps the schema-cache failure to a deployment problem with a safe message", () => {
    const { userMessage, meta } = sanitizeTrainingRpcError(
      "Could not find the function public.svj_get_my_training_profile without parameters in the schema cache",
    );
    assert.equal(meta.code, "TRAINING_RPC_NOT_DEPLOYED");
    assert.equal(meta.deploymentProblem, true);
    assert.doesNotMatch(userMessage, /svj_|PostgREST|schema cache|function/i);
  });

  it("maps auth failures to a sign-in message", () => {
    const { userMessage, meta } = sanitizeTrainingRpcError("Authentication required");
    assert.equal(meta.code, "TRAINING_RPC_AUTH_REQUIRED");
    assert.match(userMessage, /sign in/i);
  });

  it("never leaks unknown server internals", () => {
    const { userMessage, meta } = sanitizeTrainingRpcError(
      "unexpected snapshot identity mismatch in svj_plan_state LINE 1: ...",
    );
    assert.equal(meta.code, "TRAINING_RPC_UNKNOWN");
    assert.doesNotMatch(userMessage, /snapshot|LINE|svj_plan_state/);
  });

  it("handles empty messages", () => {
    const { userMessage } = sanitizeTrainingRpcError("");
    assert.ok(userMessage.length > 0);
  });
});

describe("Build My Program uses the custom SVJ select (no native dropdown)", () => {
  const source = read("src/app/components/TrainingToday.tsx");
  const selectSource = read("src/app/components/ui-primitives/SVJSelect.tsx");

  it("the setup flow renders no native <select> elements", () => {
    assert.doesNotMatch(source, /<select/);
    assert.doesNotMatch(source, /<option/);
  });

  it("both fields use SVJSelect with stable test ids", () => {
    assert.match(source, /<SVJSelect/);
    assert.match(source, /testId="sessions-per-week"/);
    assert.match(source, /testId="session-minutes"/);
  });

  it("retains the valid choice sets: 1–6 sessions and 30/45/60/75/90 minutes", () => {
    assert.match(source, /\[1, 2, 3, 4, 5, 6\]\.map/);
    assert.match(source, /\[30, 45, 60, 75, 90\]\.map/);
  });

  it("the primitive is an accessible dark listbox, not a native popup", () => {
    assert.match(selectSource, /aria-haspopup="listbox"/);
    assert.match(selectSource, /aria-expanded=\{open\}/);
    assert.match(selectSource, /role="listbox"/);
    assert.match(selectSource, /role="option"/);
    assert.match(selectSource, /aria-selected=\{selected\}/);
    // Android WebView safety: no portal, no white native overlay. The popup
    // renders inside the component tree with dark tokens.
    assert.doesNotMatch(selectSource, /createPortal/);
    assert.match(selectSource, /bg-\[#17171A\]/);
    // Selected state is communicated by an explicit icon, not color alone.
    assert.match(selectSource, /aria-label="Selected"/);
    // Minimum touch target.
    assert.match(selectSource, /min-h-\[44px\]/);
  });

  it("the load-failure state never renders raw Supabase errors", () => {
    assert.match(source, /training-load-error/);
    assert.match(source, /could not find the function\|schema cache\|PGRST/i);
    assert.match(source, /Try again/);
  });

  it("the plan hook sanitizes errors before they reach the UI", () => {
    const hook = read("src/app/hooks/useTrainingPlan.ts");
    assert.match(hook, /sanitizeTrainingRpcError/);
  });
});
