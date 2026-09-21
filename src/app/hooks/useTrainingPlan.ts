import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTrainingPlan,
  buildPlanPayload,
  getMyTrainingPlan,
  getTrainingProfile,
  listMyTemplateLibrary,
  listWorkoutTemplates,
  recentMuscleHistory,
  removeMyTemplate,
  saveMyTemplate,
  saveTrainingProfile,
  trainingRpcClient,
  type MuscleHistoryRow,
  type ServerPlan,
  type ServerTemplateIdentity,
  type TemplateLibraryEntry,
} from "../lib/trainingClient";
import {
  currentSession,
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

export interface TrainingPlanState {
  loading: boolean;
  error: string | null;
  profile: TrainingProfile;
  serverPlan: ServerPlan | null;
  catalog: ServerTemplateIdentity[];
  library: TemplateLibraryEntry[];
  muscleRows: MuscleHistoryRow[];
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
  saveProfile: (profile: TrainingProfile) => Promise<{ ok: boolean; error?: string }>;
  generatePlan: () => Promise<{ ok: boolean; error?: string }>;
  toggleSaveTemplate: (templateId: string) => Promise<{ ok: boolean; error?: string }>;
  reloadMuscleHistory: () => Promise<void>;
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
  const [muscleRows, setMuscleRows] = useState<MuscleHistoryRow[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const mounted = useRef(true);

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
    setLoading(true);
    setError(null);
    const [profileResult, planResult, libraryResult, catalogResult, muscleResult] =
      await Promise.all([
        getTrainingProfile(rpc),
        getMyTrainingPlan(rpc),
        listMyTemplateLibrary(rpc),
        listWorkoutTemplates(rpc),
        recentMuscleHistory(rpc, 7),
      ]);
    if (!mounted.current) return;
    if (profileResult.ok && profileResult.profile) {
      setProfile(normalizeTrainingProfile(profileResult.profile));
    }
    if (planResult.ok) setServerPlan(planResult.plan);
    if (libraryResult.ok) setLibrary(libraryResult.library);
    if (catalogResult.ok) setCatalog(catalogResult.templates);
    if (muscleResult.ok) setMuscleRows(muscleResult.rows);
    const firstError = profileResult.error ?? planResult.error ?? libraryResult.error;
    setError(firstError ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const profileReady = isProfileReady(profile);

  const decision = useMemo(
    () => (profileReady ? selectSplit({ profile }) : null),
    [profile, profileReady],
  );

  const weekly = useMemo(() => {
    if (!decision) return null;
    const built = buildWeeklyPlan(profile, decision, new Date());
    const { plan } = reconcileMissedSessions(profile, built, new Date());
    // A server-completed slot stays completed regardless of local reconciliation.
    if (serverPlan) {
      const bySlot = new Map(serverPlan.sessions.map((s) => [s.slotIndex, s]));
      plan.sessions = plan.sessions.map((session) => {
        const server = bySlot.get(session.slotIndex);
        if (server && server.status === "completed") {
          return {
            ...session,
            status: "completed" as const,
            completedActivityId: server.completedActivityId,
          };
        }
        return session;
      });
    }
    return plan;
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
  }, []);

  return {
    loading,
    error,
    profile,
    serverPlan,
    catalog,
    library,
    muscleRows,
    decision,
    weekly,
    todaySession,
    savedTemplateIds,
    profileReady,
    savingProfile,
    creatingPlan,
    refresh,
    saveProfile: (p) => saveProfile(p, { generate: true }),
    generatePlan,
    toggleSaveTemplate,
    reloadMuscleHistory,
  };
}
