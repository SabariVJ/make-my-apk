import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bookmark, BookmarkCheck, Play, Search } from "lucide-react";
import {
  MUSCLE_BROWSE_GROUPS,
  SESSION_FAMILIES,
  SESSION_FAMILY_LABELS,
  filterTemplates,
  templateWorkSetCount,
  WORKOUT_TEMPLATE_CATALOG,
  type WorkoutTemplate,
} from "../lib/trainingTemplates";
import { MUSCLE_LABELS, type MuscleGroup } from "../lib/strength";
import { effectiveWeeklySessions, type TrainingProfile } from "../lib/trainingProfile";
import { svjWhileTap } from "../lib/motion";
import type { OwnedTemplate, TemplateLibraryEntry } from "../lib/trainingClient";
import { LegacyTemplateImportCard } from "./LegacyTemplateImportCard";
import { SVJSectionHeader } from "./ui-primitives/SVJSectionHeader";
import { SVJEmptyState } from "./ui-primitives/SVJEmptyState";

export interface TemplateBrowserProps {
  profile: TrainingProfile;
  library: TemplateLibraryEntry[];
  savedTemplateIds: Set<string>;
  onToggleSave: (templateId: string) => Promise<{ ok: boolean; error?: string }>;
  onStartTemplate: (template: WorkoutTemplate) => void;
  /** On-device (pre-account) templates offered for an explicit import. */
  deviceTemplates?: {
    id: string;
    name: string;
    exercises: { id: string; name: string; sets: { reps: number; weight: number }[] }[];
  }[];
  /** Templates already imported into the account (owned, private). */
  ownedTemplates?: OwnedTemplate[];
  /** Start an imported template through the canonical logger. */
  onStartOwned?: (template: OwnedTemplate) => void;
  /** Called after an import completes, so the owned list refreshes. */
  onImported?: () => void;
}

const BROWSE_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "core"] as const;

export const TemplateBrowser: React.FC<TemplateBrowserProps> = ({
  profile,
  library,
  savedTemplateIds,
  onToggleSave,
  onStartTemplate,
  deviceTemplates = [],
  ownedTemplates = [],
  onStartOwned,
  onImported,
}) => {
  const [family, setFamily] = useState<string>("all");
  const [muscle, setMuscle] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const templates = useMemo(() => {
    const base = filterTemplates(WORKOUT_TEMPLATE_CATALOG, {
      experience: profile.setupComplete ? profile.experience : undefined,
      equipment: profile.equipment.length > 0 ? profile.equipment : undefined,
      families: family === "all" ? undefined : [family as never],
      muscles:
        muscle === "all" ? undefined : (MUSCLE_BROWSE_GROUPS[muscle] as MuscleGroup[] | undefined),
    });
    const savedFiltered = onlySaved ? base.filter((t) => savedTemplateIds.has(t.id)) : base;
    const q = query.trim().toLowerCase();
    return q
      ? savedFiltered.filter((t) =>
          `${t.name} ${t.exercises.map((e) => e.name).join(" ")}`.toLowerCase().includes(q),
        )
      : savedFiltered;
  }, [profile, family, muscle, query, onlySaved, savedTemplateIds]);

  const recentlyUsed = useMemo(
    () =>
      library
        .filter((entry) => entry.lastCompletedAt && !entry.archived)
        .sort((a, b) => (b.lastCompletedAt ?? "").localeCompare(a.lastCompletedAt ?? ""))
        .slice(0, 4)
        .map((entry) => ({
          entry,
          template: WORKOUT_TEMPLATE_CATALOG.find((t) => t.id === entry.templateId) ?? null,
        }))
        .filter((x) => x.template),
    [library],
  );

  return (
    <div className="space-y-4" data-testid="template-browser">
      <LegacyTemplateImportCard deviceTemplates={deviceTemplates} onImported={onImported} />

      {/* Imported (owned) templates — start them through the same canonical
          logger as everything else. No save/bookmark: they already belong to
          this account and must never enter the published catalog. */}
      {ownedTemplates.length > 0 && (
        <section data-testid="imported-templates">
          <SVJSectionHeader title="Imported from this device" />
          <div className="mt-2 grid items-start gap-2 lg:grid-cols-2">
            {ownedTemplates.map((template) => (
              <article
                key={template.id}
                data-testid="imported-template-card"
                className="svj-radius-card svj-lit-top border border-[#C9A227]/25 bg-[#17171A] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-inter text-[15px] font-semibold leading-tight text-[#F4F2ED]">
                      {template.name}
                    </h3>
                    <p className="mt-1 font-inter text-[11px] text-[#8C8C90]">
                      {template.exercises.length} exercise
                      {template.exercises.length === 1 ? "" : "s"}, your original sets
                    </p>
                  </div>
                </div>
                {template.exercises.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {template.exercises.slice(0, 6).map((exercise) => (
                      <li
                        key={`${template.id}-${exercise.exerciseId}`}
                        className="flex items-center justify-between text-[11px] font-inter"
                      >
                        <span className="text-[#F4F2ED]">{exercise.name}</span>
                        <span className="font-mono text-[#8C8C90]">
                          {exercise.sets.length > 0
                            ? exercise.sets
                                .map((set) => `${set.reps} × ${set.weightKg} kg`)
                                .join(", ")
                            : "no stored sets"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => onStartOwned?.(template)}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 svj-radius-row border border-[#C81E3A]/40 bg-[#C81E3A]/12 py-2 font-inter text-[11px] font-semibold text-[#F4F2ED] transition-colors hover:bg-[#C81E3A]/20"
                >
                  <Play className="h-3.5 w-3.5" /> Start this workout
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {recentlyUsed.length > 0 && (
        <section>
          <SVJSectionHeader title="Recently used" />
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {recentlyUsed.map(({ entry, template }) => (
              <button
                key={entry.templateId}
                type="button"
                onClick={() => template && onStartTemplate(template)}
                className="shrink-0 svj-radius-row border border-white/10 bg-[#17171A] px-3 py-2 text-left"
              >
                <span className="block font-inter text-[11px] text-[#F4F2ED]">
                  {entry.customName ?? template?.name}
                </span>
                <span className="block font-mono text-[10px] text-[#8C8C90]">
                  {entry.useCount}× completed
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-2.5">
        {/* Search and the saved-only switch share a row as soon as there is
            width, so the filter stack stays two compact rows on desktop. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 svj-radius-row border border-white/10 bg-[#08080A] px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8C8C90]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search sessions or exercises"
              placeholder="Search sessions or exercises"
              className="w-full bg-transparent py-2 text-xs font-inter text-white placeholder:text-[#8C8C90]/60 focus:outline-none"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[11px] font-inter text-[#8C8C90]">
            <input
              type="checkbox"
              checked={onlySaved}
              onChange={(e) => setOnlySaved(e.target.checked)}
              className="h-3.5 w-3.5 rounded-md accent-[#C81E3A]"
            />
            Saved only
          </label>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFamily("all")}
            className={`rounded-full border px-2.5 py-1 font-inter text-[11px] font-medium ${
              family === "all"
                ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                : "border-white/10 bg-black/30 text-[#8C8C90]"
            }`}
          >
            All sessions
          </button>
          {SESSION_FAMILIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFamily(f)}
              className={`rounded-full border px-2.5 py-1 font-inter text-[11px] font-medium ${
                family === f
                  ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                  : "border-white/10 bg-black/30 text-[#8C8C90]"
              }`}
            >
              {SESSION_FAMILY_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMuscle("all")}
            className={`rounded-full border px-2.5 py-1 font-inter text-[11px] font-medium ${
              muscle === "all"
                ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F4F2ED]"
                : "border-white/10 bg-black/30 text-[#8C8C90]"
            }`}
          >
            All muscles
          </button>
          {BROWSE_MUSCLES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMuscle(m)}
              className={`rounded-full border px-2.5 py-1 font-inter text-[11px] font-medium ${
                muscle === m
                  ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F4F2ED]"
                  : "border-white/10 bg-black/30 text-[#8C8C90]"
              }`}
            >
              {m === "legs" ? "Legs" : (MUSCLE_LABELS[m as MuscleGroup] ?? m)}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog — a responsive grid so several readable templates are visible
          per viewport instead of roughly one card per screenful. */}
      <div
        data-testid="template-grid"
        className="grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3"
      >
        {templates.map((template) => {
          const saved = savedTemplateIds.has(template.id);
          const muscles = [...new Set(template.exercises.map((e) => e.muscle))]
            .slice(0, 4)
            .map((m) => MUSCLE_LABELS[m as MuscleGroup] ?? m)
            .join(" · ");
          return (
            <motion.article
              key={template.id}
              whileTap={svjWhileTap}
              data-testid="template-card"
              className="svj-radius-card svj-lit-top svj-elev-1 border border-white/[0.06] bg-[#17171A] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-inter text-[15px] font-semibold leading-tight text-[#F4F2ED]">
                    {template.name}
                  </h3>
                  <p className="mt-1 font-inter text-[11px] text-[#8C8C90]">{muscles}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#8C8C90]">
                    ~{template.estimatedMinutes} min, {templateWorkSetCount(template)} work sets
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={
                    saved ? `Remove ${template.name} from library` : `Save ${template.name}`
                  }
                  disabled={busyId === template.id}
                  onClick={() => {
                    setBusyId(template.id);
                    void onToggleSave(template.id).finally(() => setBusyId(null));
                  }}
                  className={`svj-radius-row border p-2 ${
                    saved
                      ? "border-[#C9A227]/50 bg-[#C9A227]/10 text-[#C9A227]"
                      : "border-white/10 bg-[#08080A] text-[#8C8C90]"
                  }`}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
              </div>

              <ul className="mt-2.5 space-y-1">
                {template.exercises.slice(0, 6).map((e) => (
                  <li
                    key={e.slug}
                    className="flex items-center justify-between text-[11px] font-inter"
                  >
                    <span className="text-[#F4F2ED]">{e.name}</span>
                    <span className="font-mono text-[11px] text-[#8C8C90]">
                      {e.durationSeconds !== null
                        ? `${e.workSets} × ${e.durationSeconds}s`
                        : `${e.workSets} × ${e.repMin}–${e.repMax}`}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => onStartTemplate(template)}
                className="mt-2.5 flex w-full items-center justify-center gap-2 svj-radius-row border border-[#C81E3A]/40 bg-[#C81E3A]/12 py-2 font-inter text-[11px] font-semibold text-[#F4F2ED] transition-colors hover:bg-[#C81E3A]/20"
              >
                <Play className="h-3.5 w-3.5" /> Start this workout
              </button>
            </motion.article>
          );
        })}

        {templates.length === 0 && (
          <SVJEmptyState
            title="No sessions match these filters"
            description="Try clearing the muscle or equipment filter to see the full catalog."
          />
        )}
      </div>
    </div>
  );
};
