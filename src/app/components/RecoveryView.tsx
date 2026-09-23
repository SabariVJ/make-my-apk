// SVJ Recovery V2 — top-level Recovery destination (founder-only rollout).
//
// Phase 1 promotes the existing Recovery surface into its own destination with
// a section shell. Overview renders the CURRENT TrainRecovery experience
// unchanged — there is exactly one Recovery engine (../lib/recovery +
// ../lib/recoveryInsights) and one presentation component, so the founder and
// the ordinary Train › Recovery path can never disagree.
//
// The remaining sections show honest, restrained placeholders. No demo
// statistics, no invented readiness, no fake sleep nights and no wearable is
// ever claimed as connected before its implementation phase ships.
import React, { useCallback, useRef, useState } from "react";
import { HeartPulse } from "lucide-react";
import { TrainRecovery } from "../views/TrainRecovery";
import { RECOVERY_SECTIONS, type RecoverySection } from "../lib/recoveryNav";

/**
 * Honest placeholder for a section whose phase has not shipped yet. It states
 * what will arrive and why there is nothing here — it never fabricates data.
 */
const UpcomingSection: React.FC<{
  section: RecoverySection;
  title: string;
  summary: string;
  points: string[];
}> = ({ section, title, summary, points }) => (
  <div
    role="tabpanel"
    id={`recovery-panel-${section}`}
    aria-labelledby={`recovery-tab-${section}`}
    data-testid={`recovery-section-${section}`}
    className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-5"
  >
    <p className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">Coming next</p>
    <h2 className="mt-1 font-anton text-lg uppercase tracking-wide text-[#F4F2ED]">{title}</h2>
    <p className="mt-2 text-xs font-inter leading-relaxed text-[#8C8C90]">{summary}</p>
    <ul className="mt-3 space-y-1.5">
      {points.map((point) => (
        <li key={point} className="flex gap-2 text-[11px] font-mono text-[#8C8C90]">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#C81E3A]" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
    <p className="mt-4 rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
      Nothing is shown here yet because SVJ only displays recovery data it can actually derive from
      your recorded activity, check-ins and completed tasks.
    </p>
  </div>
);

export const RecoveryView: React.FC = () => {
  const [section, setSection] = useState<RecoverySection>("overview");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /** Roving keyboard navigation across the recovery sections (WAI tabs). */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const ids = RECOVERY_SECTIONS.map((s) => s.id);
      const current = ids.indexOf(section);
      let next = -1;

      if (event.key === "ArrowRight") next = (current + 1) % ids.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + ids.length) % ids.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = ids.length - 1;
      else return;

      event.preventDefault();
      const target = ids[next];
      setSection(target);
      tabRefs.current[target]?.focus();
    },
    [section],
  );

  return (
    <div className="pb-28 space-y-4" data-testid="recovery-view">
      <div className="rounded-2xl border border-white/5 bg-[#17171A] p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[#C81E3A]/40 bg-[#C81E3A]/15">
            <HeartPulse aria-hidden className="h-4 w-4 text-[#E62846]" />
          </div>
          <div>
            <h1 className="font-anton text-2xl uppercase tracking-wider text-[#F4F2ED]">
              Recovery
            </h1>
            <p className="text-[11px] font-inter text-[#8C8C90]">
              Readiness, sleep and training load — derived from your own data.
            </p>
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Recovery sections"
        onKeyDown={handleKeyDown}
        data-testid="recovery-sections"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {RECOVERY_SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[item.id] = node;
              }}
              type="button"
              role="tab"
              id={`recovery-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`recovery-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              data-testid={`recovery-section-tab-${item.id}`}
              onClick={() => setSection(item.id)}
              className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-inter font-semibold transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A] ${
                active
                  ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]"
                  : "border-white/8 bg-[#17171A] text-[#8C8C90] hover:text-[#F4F2ED]"
              }`}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {item.label}
              {active && <span className="sr-only">(selected)</span>}
            </button>
          );
        })}
      </div>

      {/* Overview is the live surface: the one existing Recovery engine. */}
      {section === "overview" && (
        <div
          role="tabpanel"
          id="recovery-panel-overview"
          aria-labelledby="recovery-tab-overview"
          data-testid="recovery-section-overview"
        >
          <TrainRecovery />
        </div>
      )}

      {section === "history" && (
        <UpcomingSection
          section="history"
          title="History"
          summary="A calendar heatmap of your real readiness scores and a sleep-vs-performance view built from your own logged nights."
          points={[
            "Every day shows an actual derived score — days with no data stay visually empty",
            "Sleep vs. training load, using wording you already understand",
            "Personal records and trends computed from real history only",
          ]}
        />
      )}

      {section === "goals" && (
        <UpcomingSection
          section="goals"
          title="Goals"
          summary="Recovery goals that plug into the SVJ goal framework you already use, with server-derived progress."
          points={[
            "Sleep, check-in consistency, rest days and average readiness targets",
            "Progress calculated on the server from canonical data — never client-authored",
            "Completed goals feed Discipline through the existing stat event system",
          ]}
        />
      )}

      {section === "records" && (
        <UpcomingSection
          section="records"
          title="Records"
          summary="Derived personal bests from your own recovery history."
          points={[
            "Highest legitimate readiness score",
            "Longest check-in streak",
            "Most consistent sleep duration (duration, not sleep window)",
          ]}
        />
      )}

      {section === "progress" && (
        <UpcomingSection
          section="progress"
          title="Progress"
          summary="A weekly recovery digest drawn from your real readiness, sleep, consistency and load."
          points={[
            "Average readiness and its trend across the week",
            "Average sleep, check-in consistency and rest-day count",
            "Also surfaced inside My SVJ Plan once it ships",
          ]}
        />
      )}

      {section === "devices" && (
        <div className="space-y-3">
          <UpcomingSection
            section="devices"
            title="Devices"
            summary="Future recovery and sleep data sources. Nothing is connected yet, and SVJ will only report a device once it can genuinely read from it."
            points={[
              "Android Health Connect — steps, sleep and heart rate",
              "Wear OS health data and companion apps",
              "Dedicated sleep trackers",
              "Heart rate / HRV sources for recovery signals",
            ]}
          />
          <p
            role="status"
            data-testid="recovery-devices-status"
            className="rounded-2xl border border-white/5 bg-[#0B0B0C] px-4 py-3 text-[11px] font-mono text-[#8C8C90]"
          >
            No device is connected.
          </p>
        </div>
      )}
    </div>
  );
};
