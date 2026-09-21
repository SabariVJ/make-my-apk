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
import type { TemplateLibraryEntry } from "../lib/trainingClient";

export interface TemplateBrowserProps {
  profile: TrainingProfile;
  library: TemplateLibraryEntry[];
  savedTemplateIds: Set<string>;
  onToggleSave: (templateId: string) => Promise<{ ok: boolean; error?: string }>;
  onStartTemplate: (template: WorkoutTemplate) => void;
}

const BROWSE_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "core"] as const;

export const TemplateBrowser: React.FC<TemplateBrowserProps> = ({
  profile,
  library,
  savedTemplateIds,
  onToggleSave,
  onStartTemplate,
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
      {recentlyUsed.length > 0 && (
        <section>
          <p className="font-anton text-sm uppercase tracking-wide text-white">Recently used</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {recentlyUsed.map(({ entry, template }) => (
              <button
                key={entry.templateId}
                type="button"
                onClick={() => template && onStartTemplate(template)}
                className="shrink-0 rounded-xl border border-white/10 bg-[#17171A] px-3 py-2 text-left"
              >
                <span className="block text-[11px] font-inter text-[#F4F2ED]">
                  {entry.customName ?? template?.name}
                </span>
                <span className="block text-[9px] font-mono text-[#8C8C90]">
                  {entry.useCount}× completed
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-white/5 bg-[#17171A] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-2">
          <Search className="h-3.5 w-3.5 text-[#8C8C90]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions or exercises"
            className="w-full bg-transparent py-2 text-xs font-inter text-white placeholder:text-[#8C8C90]/60 focus:outline-none"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFamily("all")}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-inter uppercase tracking-wider ${
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
              className={`rounded-full border px-2.5 py-1 text-[10px] font-inter uppercase tracking-wider ${
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
            className={`rounded-full border px-2.5 py-1 text-[10px] font-inter uppercase tracking-wider ${
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
              className={`rounded-full border px-2.5 py-1 text-[10px] font-inter uppercase tracking-wider ${
                muscle === m
                  ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F4F2ED]"
                  : "border-white/10 bg-black/30 text-[#8C8C90]"
              }`}
            >
              {m === "legs" ? "Legs" : (MUSCLE_LABELS[m as MuscleGroup] ?? m)}
            </button>
          ))}
        </div>

        <label className="mt-2 flex items-center gap-2 text-[11px] font-inter text-[#8C8C90]">
          <input
            type="checkbox"
            checked={onlySaved}
            onChange={(e) => setOnlySaved(e.target.checked)}
            className="h-3.5 w-3.5 rounded-md accent-[#C81E3A]"
          />
          Saved only
        </label>
      </div>

      {/* Catalog */}
      <div className="space-y-3">
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
              className="rounded-2xl border border-white/5 bg-[#17171A] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-anton text-lg uppercase leading-none text-[#F4F2ED]">
                    {template.name}
                  </h3>
                  <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">{muscles}</p>
                  <p className="mt-0.5 text-[10px] font-mono text-[#8C8C90]">
                    ~{template.estimatedMinutes} min · {templateWorkSetCount(template)} work sets
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
                  className={`rounded-lg border p-2 ${
                    saved
                      ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]"
                      : "border-white/10 bg-black/30 text-[#8C8C90]"
                  }`}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
              </div>

              <ul className="mt-3 space-y-1">
                {template.exercises.slice(0, 6).map((e) => (
                  <li
                    key={e.slug}
                    className="flex items-center justify-between text-[11px] font-inter"
                  >
                    <span className="text-[#F4F2ED]">{e.name}</span>
                    <span className="font-mono text-[#8C8C90]">
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/12 py-2.5 text-[11px] font-inter font-semibold uppercase tracking-wider text-[#F4F2ED] hover:bg-[#C81E3A]/20"
              >
                <Play className="h-3.5 w-3.5" /> Start this workout
              </button>
            </motion.article>
          );
        })}

        {templates.length === 0 && (
          <p className="py-8 text-center text-xs font-inter text-[#8C8C90]">
            No sessions match these filters. Try clearing the muscle or equipment filter.
          </p>
        )}
      </div>
    </div>
  );
};
