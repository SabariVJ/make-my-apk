import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import { listExercises, type StrengthExerciseOption } from "../lib/strength";
import { strengthRpcClient } from "../lib/strengthClient";
import {
  buildImportPayload,
  pendingLegacyTemplates,
  planLegacyImport,
  validateImportPayload,
  type CatalogExerciseRef,
} from "../lib/legacyTemplateImport";
import { importLegacyTemplate, listMyOwnedTemplates, trainingRpcClient } from "../lib/trainingClient";

export interface LegacyTemplateImportCardProps {
  /** The on-device templates the user already has. */
  deviceTemplates: { id: string; name: string; exercises: { id: string; name: string; sets: { reps: number; weight: number }[] }[] }[];
}

/**
 * Explicit, one-time migration of on-device templates into the signed-in
 * account. Nothing uploads without a confirmation, unknown exercises must be
 * resolved by the user, and the local originals are left untouched.
 */
export const LegacyTemplateImportCard: React.FC<LegacyTemplateImportCardProps> = ({
  deviceTemplates,
}) => {
  const [catalog, setCatalog] = useState<StrengthExerciseOption[]>([]);
  const [importedKeys, setImportedKeys] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const client = strengthRpcClient();
    if (client) {
      void listExercises((fn, args) => client.rpc(fn, args)).then((result) => {
        if (active && result.ok) {
          setCatalog(result.exercises);
          setChoices({});
        }
      });
    }
    const training = trainingRpcClient();
    if (training) {
      void listMyOwnedTemplates(training).then((result) => {
        if (active && result.ok) {
          setImportedKeys(
            result.templates.map((t) => t.sourceKey).filter((key): key is string => Boolean(key)),
          );
        }
      });
    }
    return () => {
      active = false;
    };
  }, []);

  const catalogRefs: CatalogExerciseRef[] = useMemo(
    () =>
      catalog.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        slug: exercise.slug,
        primaryMuscle: exercise.primaryMuscle,
      })),
    [catalog],
  );

  const plans = useMemo(
    () => pendingLegacyTemplates(planLegacyImport(deviceTemplates, catalogRefs), importedKeys),
    [deviceTemplates, catalogRefs, importedKeys],
  );

  if (deviceTemplates.length === 0 || plans.length === 0) return null;

  const totalExercises = plans.reduce((total, plan) => total + plan.matchedCount, 0);
  const unresolved = plans.reduce((total, plan) => total + plan.unresolvedCount, 0);

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const client = trainingRpcClient();
    if (!client) {
      setBusy(false);
      setError("Backend is not configured.");
      return;
    }
    let imported = 0;
    let duplicates = 0;
    for (const plan of plans) {
      const payload = buildImportPayload(plan, catalogRefs, choices);
      const invalid = validateImportPayload(payload);
      if (invalid) {
        if (payload.exercises.length === 0) continue; // nothing resolved — skip silently
        setBusy(false);
        setError(invalid);
        return;
      }
      const result = await importLegacyTemplate(client, payload);
      if (!result.ok) {
        setBusy(false);
        setError(result.error ?? "Couldn't import your template.");
        return;
      }
      if (result.duplicate) duplicates += 1;
      else imported += 1;
    }
    setBusy(false);
    setDone(
      imported > 0
        ? `Imported ${imported} template${imported === 1 ? "" : "s"}${duplicates > 0 ? ` · ${duplicates} already imported` : ""}. Your device templates are untouched.`
        : "Nothing new to import — everything here is already in your account.",
    );
    setImportedKeys([...importedKeys, ...plans.map((p) => p.sourceKey)]);
  };

  return (
    <section
      className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 p-4"
      data-testid="legacy-template-import"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#D4AF37]">
            <Upload className="h-3.5 w-3.5" /> Templates on this device
          </p>
          <p className="mt-1 text-xs font-inter text-[#B8B8C0]">
            {plans.length} template{plans.length === 1 ? "" : "s"} can move into your account.{" "}
            {unresolved > 0
              ? `${unresolved} exercise${unresolved === 1 ? "" : "s"} need your choice — SVJ never guesses.`
              : `${totalExercises} exercise${totalExercises === 1 ? "" : "s"} matched the catalog.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white"
        >
          {open ? "Hide" : "Review"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {plans.map((plan) => (
            <div key={plan.legacyId} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="font-anton text-sm uppercase text-[#F4F2ED]">{plan.name}</p>
              <ul className="mt-2 space-y-2">
                {plan.resolutions.map((resolution) => (
                  <li key={resolution.legacy.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-inter text-[#B8B8C0]">
                      {resolution.legacy.name}
                    </span>
                    {resolution.kind === "matched" ? (
                      <span className="shrink-0 text-[10px] font-mono text-[#8C8C90]">
                        → {resolution.exerciseName}
                      </span>
                    ) : (
                      <select
                        aria-label={`Map ${resolution.legacy.name} to a catalog exercise`}
                        value={choices[resolution.legacy.id] ?? ""}
                        onChange={(e) =>
                          setChoices((prev) => ({ ...prev, [resolution.legacy.id]: e.target.value }))
                        }
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0B0B0C] px-2 py-1 text-[10px] font-inter text-white"
                      >
                        <option value="">
                          {resolution.kind === "ambiguous" ? "Choose a match…" : "Not in the catalog"}
                        </option>
                        {(resolution.kind === "ambiguous"
                          ? resolution.candidates
                          : catalogRefs
                        ).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                        <option value="skip">Skip this exercise</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] font-inter text-[#E62846]">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
            </p>
          )}
          {done && (
            <p role="status" className="flex items-start gap-1.5 text-[11px] font-inter text-[#D4AF37]">
              <Check className="mt-0.5 h-3 w-3 shrink-0" /> {done}
            </p>
          )}

          <button
            type="button"
            onClick={() => void runImport()}
            disabled={busy}
            data-testid="legacy-template-import-confirm"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-[11px] font-inter font-semibold uppercase tracking-wider text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Import these templates
          </button>
          <p className="text-[10px] font-inter text-[#8C8C90]">
            Imports only your own templates into your account. No XP is awarded and nothing is marked
            as performed. Your device copies stay until the server confirms.
          </p>
        </div>
      )}
    </section>
  );
};
