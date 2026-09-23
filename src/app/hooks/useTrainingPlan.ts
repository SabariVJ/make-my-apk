import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTrainingPlan,
  buildPlanPayload,
  getMyTrainingPlan,
  getTrainingProfile,
  listMyOwnedTemplates,
  listMyTemplateLibrary,
  listTrainingDecisions,
  listWorkoutTemplates,
  recentMuscleHistory,
  removeMyTemplate,
  reschedulePlanSession,
  saveMyTemplate,
  saveTrainingProfile,
  skipPlanSession,
  trainingRpcClient,
  type MuscleHistoryRow,
  type OwnedTemplate,
  type ServerPlan,
  type ServerTemplateIdentity,
  type TemplateLibraryEntry,
} from "../lib/trainingClient";
import type { TrainingDecisionRecord } from "../lib/trainingProgress";
import { strengthRpcClient } from "../lib/strengthClient";
import {
  getExerciseHistory,
  listStrengthRecords,
  type ExerciseHistory,
  type StrengthRecordDto,
} from "../lib/strength";
import {
  currentSession,
  mergeServerPlan,
  reconcileMissedSessions,
  selectSplit,
  buildWeeklyPlan,
  type PlanSession,
  type SplitDecision,
  type WeeklyPlan,
} from "../lib/trainingPlan";
import {
  emptyTrainingProfile,
  isProfileReady,
  normalizeTrainingProfile,
  type TrainingProfile,
} from "../lib/trainingProfile";
import { TRAINING_POLICY_VERSION } from "../lib/trainingPolicy";
import { sanitizeTrainingRpcError } from "../lib/trainingErrors";

export interface TrainingPlanState {
  loading: boolean;
  error: string | null;
  profile: TrainingProfile;
  serverPlan: ServerPlan | null;
  catalog: ServerTemplateIdentity[];
  library: TemplateLibraryEntry[];
  /** Templates imported from this device (owned by the caller, private). */
  ownedTemplates: OwnedTemplate[];
  muscleRows: MuscleHistoryRow[];
  /** Real progression-decision audit trail (server-owned). */
  decisions: TrainingDecisionRecord[];
  /** Personal records derived from stored sets (server-owned). */
  strengthRecords: StrengthRecordDto[];
  /** Deterministic split decision derived from the current profile. */
  decision: SplitDecision | null;
  /** Weekly plan with missed sessions reconciled (client-side view). */
  weekly: WeeklyPlan | null;
  /** Today's / next scheduled session. */
  todaySession: PlanSession | null;
  savedTemplateIds: Set<string>;
  profileReady: boolean;
  savingProfile: boolean;
  creatingPlan: boolean;
}

export interface TrainingPlanActions {
  refresh: () => Promise<void>;
  /** Reload only the imported (owned) templates — after an import succeeds. */
  reloadOwnedTemplates: () => Promise<void>;
  saveProfile: (profile: TrainingProfile) => Promise<{ ok: boolean; error?: string }>;
  generatePlan: () => Promise<{ ok: boolean; error?: string }>;
  toggleSaveTemplate: (templateId: string) => Promise<{ ok: boolean; error?: string }>;
  reloadMuscleHistory: () => Promise<void>;
  /** Completed set history for one exercise (Progress view). */
  loadExerciseHistory: (exerciseId: string) => Promise<ExerciseHistory | null>;
  /** Move a planned session to another day (server-validated). */
  moveSession: (sessionId: string, newDate: string) => Promise<{ ok: boolean; error?: string }>;
  /** Skip a planned session — a rest day is a valid state. */
  skipSession: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Server id of the planned session for a slot, when it exists. */
  serverSessionIdForSlot: (slotIndex: number) => string | null;
}

/**
 * Loads the persisted training profile, active plan, template library and the
 * server's real muscle history, and derives the deterministic split + weekly
 * plan locally. The server stays the source of truth for persisted data; the
 * engine here is pure and reproducible from the profile.
 */
export function useTrainingPlan(): TrainingPlanState & TrainingPlanActions {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<TrainingProfile>(() => emptyTrainingProfile());
  const [serverPlan, setServerPlan] = useState<ServerPlan | null>(null);
  const [catalog, setCatalog] = useState<ServerTemplateIdentity[]>([]);
  const [library, setLibrary] = useState<TemplateLibraryEntry[]>([]);
  const [ownedTemplates, setOwnedTemplates] = useState<OwnedTemplate[]>([]);
  const [muscleRows, setMuscleRows] = useState<MuscleHistoryRow[]>([]);
  const [decisions, setDecisions] = useState<TrainingDecisionRecord[]>([]);
  const [strengthRecords, setStrengthRecords] = useState<StrengthRecordDto[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const mounted = useRef(true);
  // The spinner is for the FIRST load only: a refresh keeps the last known
  // plan on screen instead of blanking it behind a loading state.
  const loadedOnce = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const rpc = trainingRpcClient();
    if (!rpc) {
      setLoading(false);
      setError("Backend is not configured.");
      return;
    }
    // Only the first load shows the spinner; later refreshes keep the last
    // plan visible while they run.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    const [
      profileResult,
      planResult,
      libraryResult,
      ownedResult,
      catalogResult,
      muscleResult,
      decisionResult,
    ] = await Promise.all([
      getTrainingProfile(rpc),
      getMyTrainingPlan(rpc),
      listMyTemplateLibrary(rpc),
      listMyOwnedTemplates(rpc),
      listWorkoutTemplates(rpc),
      recentMuscleHistory(rpc, 7),
      listTrainingDecisions(rpc, 50),
    ]);
    if (!mounted.current) return;
    if (profileResult.ok && profileResult.profile) {
      setProfile(normalizeTrainingProfile(profileResult.profile));
    }
    if (planResult.ok) setServerPlan(planResult.plan);
    if (libraryResult.ok) setLibrary(libraryResult.library);
    if (ownedResult.ok) setOwnedTemplates(ownedResult.templates);
    if (catalogResult.ok) setCatalog(catalogResult.templates);
    if (muscleResult.ok) setMuscleRows(muscleResult.rows);
    if (decisionResult.ok) setDecisions(decisionResult.decisions);
    const strengthClient = strengthRpcClient();
    if (strengthClient) {
      const records = await listStrengthRecords((fn, args) => strengthClient.rpc(fn, args));
      if (mounted.current && records.ok) setStrengthRecords(records.records);
    }
    const firstError =
      profileResult.error ?? planResult.error ?? libraryResult.error ?? ownedResult.error;
    loadedOnce.current = true;
    // Raw PostgREST/Supabase messages (e.g. "Could not find the function
    // public.svj_get_my_training_profile … schema cache") must never reach
    // the UI. Deployment problems are named as such and logged for diagnosis.
    if (firstError) {
      const { userMessage, meta } = sanitizeTrainingRpcError(firstError);
      if (meta.deploymentProblem) {
        console.error("[SVJ training] Automated training RPCs are not deployed", {
          code: meta.code,
        });
      }
      setError(userMessage);
    } else {
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh when connectivity returns — the queue drains in parallel, but the
  // plan/history shown must not stay stale after an offline period.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  const reloadOwnedTemplates = useCallback(async () => {
    const rpc = trainingRpcClient();
    if (!rpc) return;
    const result = await listMyOwnedTemplates(rpc);
    if (result.ok && mounted.current) setOwnedTemplates(result.templates);
  }, []);

  const profileReady = isProfileReady(profile);

  const decision = useMemo(
    () => (profileReady ? selectSplit({ profile }) : null),
    [profile, profileReady],
  );

  const weekly = useMemo(() => {
    if (!decision) return null;
    const built = buildWeeklyPlan(profile, decision, new Date());
    const { plan } = reconcileMissedSessions(profile, built, new Date());
    // The server is authoritative for persisted scheduling; see mergeServerPlan.
    return mergeServerPlan(
      plan,
      serverPlan
        ? serverPlan.sessions.map((session) => ({
            slotIndex: session.slotIndex,
            scheduledDate: session.scheduledDate,
            status: session.status,
            completedActivityId: session.completedActivityId,
          }))
        : null,
    );
  }, [decision, profile, serverPlan]);

  const todaySession = useMemo(
    () => (weekly ? currentSession(weekly, new Date()) : null),
    [weekly],
  );

  const savedTemplateIds = useMemo(
    () => new Set(library.filter((entry) => !entry.archived).map((entry) => entry.templateId)),
    [library],
  );

  const saveProfile = useCallback(
    async (next: TrainingProfile, options: { generate?: boolean } = {}) => {
      const rpc = trainingRpcClient();
      if (!rpc) return { ok: false, error: "Backend is not configured." };
      setSavingProfile(true);
      const result = await saveTrainingProfile(rpc, next);
      setSavingProfile(false);
      if (!result.ok) return result;
      setProfile(next);
      if (options.generate) {
        const decisionNext = selectSplit({ profile: next });
        const weeklyNext = buildWeeklyPlan(next, decisionNext, new Date());
        setCreatingPlan(true);
        const created = await createTrainingPlan(
          rpc,
          buildPlanPayload(decisionNext, weeklyNext, { policyVersion: TRAINING_POLICY_VERSION }),
        );
        setCreatingPlan(false);
        if (!created.ok) return created;
        await refresh();
      }
      return { ok: true };
    },
    [refresh],
  );

  const generatePlan = useCallback(async () => {
    const rpc = trainingRpcClient();
    if (!rpc) return { ok: false, error: "Backend is not configured." };
    if (!isProfileReady(profile)) return { ok: false, error: "Finish your training setup first." };
    const decisionNext = selectSplit({ profile });
    const weeklyNext = buildWeeklyPlan(profile, decisionNext, new Date());
    setCreatingPlan(true);
    const created = await createTrainingPlan(
      rpc,
      buildPlanPayload(decisionNext, weeklyNext, { policyVersion: TRAINING_POLICY_VERSION }),
    );
    setCreatingPlan(false);
    if (!created.ok) return created;
    await refresh();
    return { ok: true };
  }, [profile, refresh]);

  const toggleSaveTemplate = useCallback(
    async (templateId: string) => {
      const rpc = trainingRpcClient();
      if (!rpc) return { ok: false, error: "Backend is not configured." };
      const saved = savedTemplateIds.has(templateId);
      const result = saved
        ? await removeMyTemplate(rpc, templateId)
        : await saveMyTemplate(rpc, { templateId });
      if (!result.ok) return result;
      const libraryResult = await listMyTemplateLibrary(rpc);
      if (libraryResult.ok) setLibrary(libraryResult.library);
      return { ok: true };
    },
    [savedTemplateIds],
  );

  const reloadMuscleHistory = useCallback(async () => {
    const rpc = trainingRpcClient();
    if (!rpc) return;
    const result = await recentMuscleHistory(rpc, 7);
    if (result.ok && mounted.current) setMuscleRows(result.rows);
    const decisionResult = await listTrainingDecisions(rpc, 50);
    if (decisionResult.ok && mounted.current) setDecisions(decisionResult.decisions);
  }, []);

  const serverSessionIdForSlot = useCallback(
    (slotIndex: number) =>
      serverPlan?.sessions.find((session) => session.slotIndex === slotIndex)?.id ?? null,
    [serverPlan],
  );

  const moveSession = useCallback(
    async (sessionId: string, newDate: string) => {
      const rpc = trainingRpcClient();
      if (!rpc) return { ok: false, error: "Backend is not configured." };
      const result = await reschedulePlanSession(rpc, sessionId, newDate);
      if (!result.ok) return result;
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const skipSession = useCallback(
    async (sessionId: string) => {
      const rpc = trainingRpcClient();
      if (!rpc) return { ok: false, error: "Backend is not configured." };
      const result = await skipPlanSession(rpc, sessionId);
      if (!result.ok) return result;
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const loadExerciseHistory = useCallback(async (exerciseId: string) => {
    const client = strengthRpcClient();
    if (!client || !exerciseId) return null;
    const result = await getExerciseHistory((fn, args) => client.rpc(fn, args), exerciseId, 30);
    return result.ok ? (result.history ?? null) : null;
  }, []);

  return {
    loading,
    error,
    profile,
    serverPlan,
    catalog,
    library,
    ownedTemplates,
    muscleRows,
    decisions,
    strengthRecords,
    decision,
    weekly,
    todaySession,
    savedTemplateIds,
    profileReady,
    savingProfile,
    creatingPlan,
    refresh,
    reloadOwnedTemplates,
    saveProfile: (p) => saveProfile(p, { generate: true }),
    generatePlan,
    toggleSaveTemplate,
    reloadMuscleHistory,
    loadExerciseHistory,
    moveSession,
    skipSession,
    serverSessionIdForSlot,
  };
}
