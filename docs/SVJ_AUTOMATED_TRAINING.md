# SVJ Automated Training System

Deterministic, explainable training programming layered around SVJ's existing
canonical strength pipeline. No LLM authors workouts; every decision comes from
versioned rules and real completed-set history.

> Developer documentation. None of this terminology appears in the product UI.

## Architecture

| Layer | Module | Responsibility |
|---|---|---|
| Policy | `src/app/lib/trainingPolicy.ts` | Every tunable number, versioned (`svj-training-2026-09-1`). |
| Profile | `src/app/lib/trainingProfile.ts` | Persistent, resumable training profile + validation. |
| Catalog | `src/app/lib/trainingTemplates.ts` | Reviewed session templates referencing stable exercise slugs. |
| Planner | `src/app/lib/trainingPlan.ts` | Split selection, scheduling, athlete rules, missed-session reconciliation. |
| Progression | `src/app/lib/trainingProgression.ts` | Conservative double-progression outcomes. |
| Muscle history | `src/app/lib/trainingMuscleHistory.ts` | Real muscle work from completed sets. |
| Adapters | `src/app/lib/trainingClient.ts` | Network-free payloads + injected-caller RPC wrappers. |
| Hook/UI | `useTrainingPlan.ts`, `TrainingToday.tsx`, `TemplateBrowser.tsx`, `TrainStrength.tsx` | Train → Today / Templates / History. |

## Split selection (no BMI)

BMI is **never** an input. Precedence: safety/limitation → available days →
session duration → equipment → movement familiarity → purpose → sport schedule →
experience → performance → recovery → preference → muscle coverage.

| Experience | Days | Split |
|---|---|---|
| any | 1 | Full Body |
| Beginner | 2 | Full Body A/B |
| Beginner | 3+ | Alternating Full Body (capped at 3 to start) |
| Intermediate/Veteran | 2 | Full Body A/B |
| Intermediate/Veteran | 3 | Full Body or Upper/Lower/Full |
| Intermediate/Veteran | 4 | Upper / Lower |
| Intermediate/Veteran | 5 | Upper/Lower + Push/Pull/Legs |
| Intermediate/Veteran | 6 (explicit) | Push / Pull / Legs ×2 |
| Athlete | 2–4 | Full Body or Upper/Lower, coordinated with practice/competition |

A beginner who selects 4+ days is capped at 3 (`BEGINNER_START_DAYS`) unless the
caller opts into a 4-day beginner program. A veteran who picks two days always
receives a legitimate two-day program.

## Blocks, scheduling, missed sessions

- A plan block is **4 weeks** (`PLAN_BLOCK_WEEKS`); split stays stable, targets
  adapt between sessions. Revisions happen on goal/equipment/day changes, block
  review, or explicit user action — completed history is preserved.
- Sessions are assigned to real weekdays, spread evenly, preferring non-practice
  days for athletes.
- Missed sessions **roll forward** to the next free available day and are never
  stacked to repair the calendar (`reconcileMissedSessions`).

## Progression engine

Evidence window 28 days, re-entry after 14+ days, two qualifying comparable
sessions required (three for power work), max increase 5%.

Outcomes: `hold`, `increase`, `reduce`, `reentry`, `stop_pain`, `new_baseline`.
One variable changes at a time. Attendance and streaks never progress anyone.

Load modes: `weighted` (load), `bodyweight` (reps → variation), `assisted`
(less assistance), `duration` (time), `power` (quality first, never failure).

## Muscle history

Derived **only** from completed working sets. Ignored: skipped sets, abandoned
drafts, template definitions, scheduled-but-unperformed exercises. Warm-ups are
classified separately. Direct = exercise primary muscle; supporting = secondary.
Primary/secondary weighting is a display summary — never fatigue, hypertrophy,
damage or recovery data. Unknown history says so ("No logged training" /
"Older sets unclassified"); no date is ever invented.

## Data model (additive)

`svj_training_profiles`, `svj_workout_templates`,
`svj_workout_template_versions`, `svj_user_template_library`,
`svj_training_plans`, `svj_training_plan_sessions`,
`svj_activity_training_context`, `svj_training_decisions`, plus
`svj_strength_sets.is_warmup` and movement metadata on `svj_exercises`.

Invariants: one owned profile per user, immutable published template versions,
per-user library metadata separate from the global catalog, **one active plan
per user**, ordered slots, one finalized activity per slot.

## Canonical save path

Workouts still save through `svj_save_strength_activity` (idempotent by
`(user_id, client_session_id)`). `svj_record_training_context` then links the
activity to its plan slot and marks the slot completed **exactly once**. A
failed context write never loses the workout; the workout saves first.

## Security

All user tables are RLS-protected and read-only from the client. Every write goes
through SECURITY DEFINER RPCs that derive identity from `auth.uid()`. No client
payload carries a user id, XP, or personal-record value.

## Effort and warm-ups

- The logger collects a **session RPE (1–10)**. It is stored on the activity,
  read back through `svj_get_exercise_history` and forwarded verbatim into the
  progression evidence; it is never invented when the user skips it.
- Warm-up sets are **persisted per set** (`svj_strength_sets.is_warmup`, toggled
  per set in the logger) and excluded from working volume, personal records,
  muscle history and progression evidence.
- After a canonical save, `syncTrainingDecisions`
  (`src/app/lib/trainingDecisionSync.ts`) judges that real history and writes one
  audit row per exercised prescription to `svj_training_decisions`. A failed
  history read skips, a failed write is counted — neither can touch the saved
  workout.

## Known limitations

- The logger collects session RPE only. Per-set RIR and the technique/pain flag
  are modelled by the engine but not collected yet, so those evidence fields
  stay `null` instead of being guessed; the pain branch and the RIR-failure
  branch can therefore only fire on a logged RPE ≥ 9.
- The reviewed catalog is authored in TypeScript (single source of truth) and
  snapshotted immutably into `svj_workout_template_versions` on plan creation.
- Estimated 1RM is intentionally not implemented.
