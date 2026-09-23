# SVJ Recovery V2 — staged rollout

Recovery is promoted from a Train sub-section into a complete top-level
destination with readiness, history, goals, records, progress insights and
future wearable support. It is delivered in **staged phases**, and the whole
rollout is initially **founder-only**: ordinary users keep the current
application exactly as it ships today.

No fake data policy: SVJ only ever displays recovery numbers it can actually
derive from recorded activity, real check-ins and completed tasks. Empty states
are preferred over fabricated analytics.

## Founder gating

- `src/app/lib/founderGate.ts` → `isFounderAccount(user, profileLoaded)`.
- Identity source: the **server-backed** profile SVJContext resolves from
  Supabase (`isFounder` / `isOwner`). No new founder column, table or role
  system is introduced, and the gate holds **no email allow-list of its own**
  (the owner-email fallback, if needed, already lives inside `SVJContext`).
- The gate returns `false` until `profileLoaded` is true, so the `INITIAL_USER`
  placeholder or a stale localStorage cache can never flash a founder-only
  destination.
- Every founder-only surface is un-gated by flipping/expanding this one
  decision — not by scattering role checks.

## Phases

| Phase | Scope                                                                                | Status                                                                    |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1     | Recovery destination + navigation shell                                              | **shipped (founder-only)**                                                |
| 2     | Automation audit + missing gaps (partial readiness, task counts, history automation) | **shipped (audit + load/readiness verified, history made server-backed)** |
| 3     | Overview intelligence (Today's Focus, Recovery Streak, Muscle Recovery Map)          | **shipped (founder-only)**                                                |
| 4     | History (readiness heatmap, sleep vs. performance)                                   | **shipped (server-backed, no fabricated days)**                           |
| 5     | Recovery goals + Discipline progression                                              | **shipped (server-derived progress)**                                     |
| 6     | Derived recovery records                                                             | **shipped (derived on read, read-only)**                                  |
| 7     | Weekly digest, My SVJ Plan integration, rest-day alert card                          | **shipped (digest + alert founder-only; plan note Plus-only)**            |

The next phase starts only when the user explicitly says "continue to phase N".

## Phase 1 — Recovery destination + navigation shell

Commit scope: promote Recovery to its own destination for the founder, with an
Overview that reuses the current Recovery experience unchanged.

### Reused (one source of truth — no second Recovery engine)

- `src/app/views/TrainRecovery.tsx` → rendered verbatim as the Recovery
  **Overview** section (readiness ring and score, Training Load, recorded
  activity vs. completed-task breakdown, recovery state, advice, low-readiness
  flag, daily check-in for sleep/soreness/energy/perceived recovery, sleep
  window, best-sleep insight, 7-day readiness + sleep trend, refresh/retry).
- `src/app/lib/recovery.ts` and `src/app/lib/recoveryInsights.ts` — untouched.
  The self-service RPCs (`svj_get_my_readiness`,
  `svj_save_my_recovery_checkin`, `svj_list_my_recovery_history`) and the
  deterministic scoring weights remain the authority.
- Server data from `supabase/migrations/20260919120000_recovery_readiness.sql`
  (`svj_recovery_checkins`, `svj_readiness_daily`, readiness RPCs) — reused.

### Added

- `src/app/lib/founderGate.ts` — the rollout gate described above.
- `src/app/lib/recoveryNav.ts` — the Recovery section model (kept out of the
  component file per the project's react-refresh convention).
- `src/app/components/RecoveryView.tsx` — the Recovery shell:
  - six sections: **Overview, History, Goals, Records, Progress, Devices**
    (**no Routes**); Devices means future wearables/sleep connectors only, never
    the existing GPS route/record device list;
  - real WAI-ARIA tabs (`role="tablist"` / `role="tab"` / `role="tabpanel"`,
    `aria-selected`, `aria-controls`, `aria-labelledby`), roving tabindex and
    Arrow/Home/End keyboard navigation, visible focus rings, ≥44 px touch
    targets, and a selected state that is announced via `sr-only` text rather
    than colour alone;
  - unshipped sections show restrained "Coming next" copy and an explicit note
    that nothing is displayed until it can be derived from real data;
  - Devices states plainly: "No device is connected."
- `src/app/components/Navigation.tsx` — `recovery` added to `ActiveTab`; the
  founder dock becomes Challenges · Activity · Train · **Recovery** · Fuel ·
  Plus with six mobile columns, while the non-founder list is unchanged and
  still renders `grid-cols-5`. The restricted post-trial shell is untouched.
- `src/app/App.tsx` — routes the `recovery` destination to `<RecoveryView />`
  and computes the rollout flag once from the loaded profile.
- `src/app/views/ActivityView.tsx` — new `hideRecoverySection` prop (default
  `false`) removes the duplicate Recovery entry **only** for the founder, so the
  existing Train › Recovery placement for ordinary users is byte-identical.

### Migrations

Created: none. Applied: none. Phase 1 is navigation/presentation only; the
required tables and RPCs already exist.

### Tests

- `tests/recovery-destination.test.ts` (21) — gate semantics (including
  "never answers before the profile loads" and "no email allow-list"), primary
  navigation information architecture, dock column switch, App routing, the
  hidden-only-for-founder Train section, the six sections in order, the
  no-fake-data policy, and tab accessibility.
- `tests/recovery-destination-ui.test.mjs` (9) — real jsdom rendering of
  `Navigation` and `RecoveryView`: exactly five destinations (no Recovery) for
  ordinary users, six with Recovery directly after Train for the founder,
  hidden while `profileLoaded` is false, `isOwner` respected, and
  panel switching plus Arrow/Home/End behaviour.
- `tests/activity-feature.test.mjs` updated for the new `ActivityView` prop; it
  still pins that the Activity tab routes to `ActivityView`.

Validation for the Phase 1 checkpoint: full suite **1027 tests — 1025 pass /
0 fail / 2 skipped** (both skips are pre-existing native-PostgreSQL-only
cases), `bunx tsc --noEmit` clean, `bunx eslint src/` 0 errors, Prettier clean,
`bun run build` PASS, Android phone/wear builds via CI.

### Manual verification

Founder acceptance is verified by the jsdom rendering suite above; the signed-in
founder account (Play/testing build) is the remaining end-to-end check:
sign in as the founder → six destinations with Recovery after Train → open
Recovery → Overview shows the live readiness surface → confirm the Activity
screen no longer shows a Recovery section. A non-founder account must still show
five destinations and the existing Train › Recovery section.

## Phase 2 — automated readiness data pipeline (audit + missing gaps only)

Audit first, then only the gaps that were actually broken or missing. No
Recovery screen was redesigned and no train/plan algorithm was touched.

### Audited and deliberately left unchanged

- **Training load** — `svj_activity_load_points` (real `duration_seconds`,
  transparent type weights, 3h cap) and `svj_training_load_points` (canonical
  `svj_activities`, trailing 7 days, `ended_at < now()`) are correct; no
  hardcoded or demo load exists anywhere. Pinned by tests so it cannot drift.
- **Partial readiness** — the base score `70 − load penalty` is computed
  _before_ the check-in branch, so a day with no check-in still yields a real
  score (70 / 58 / 50 / 42 by band and rest days). The manual inputs refine that
  number rather than unlocking it. Verified in SQL, in the client mirror, and
  end-to-end in PGlite; no formula changed.
- **Best sleep** — already an honest insufficient-data state driven by the
  athlete's own paired nights (never a generic range). Kept, now also fed by
  server history.

### Real gaps found and fixed

1. **The shipped history RPC was broken at runtime.**
   `20260919120000_recovery_readiness.sql` ended its
   `svj_list_my_recovery_history` body with
   `jsonb_agg(row ORDER BY row.readiness_date DESC)`. `row` is a jsonb _column_
   alias, not a table alias, so every call raised
   `missing FROM-clause entry for table "row"`. plpgsql does not validate the
   statement at creation time, so the function existed and failed only when
   used — and the client treated a failed history read as an empty history.
   Server-backed history was therefore silently invisible and the trend/sleep
   correlation fell back to whatever the device had cached.
   _Fix:_ `20261003000000_recovery_history_checkin_values.sql` replaces the RPC
   (same name, same signature, `SECURITY DEFINER` + `auth.uid()` preserved) and
   orders by a real subquery column (`jsonb_agg(s.row ORDER BY
s.readiness_date DESC)`).
2. **History did not carry the athlete's own inputs.** The RPC returned only
   date/score/band/recovery, so sleep evidence existed solely in local storage
   and was lost on reinstall or a new device. The replacement also returns
   `hasCheckin`, `sleepHours`, `soreness`, `energy`, `perceivedRecovery` and the
   day's `loadPoints7d`. Existing keys are unchanged, so older clients keep
   working (additive, idempotent, no table/index/policy change).
3. **Server history was merged silently and lossily.** The component ignored
   `h.ok` and only backfilled days it had no score for. The merge rules now live
   in one tested pure function, `mergeServerHistory()`: real server days are
   adopted, the athlete's check-in values are taken from the durable server copy,
   a day this device already scored keeps its richer score (it included the local
   completion ledger) while a server-only day uses the server's snapshot, and no
   day, check-in or trend point is ever invented.
4. **"Completed tasks" mislabelled load as a count.** The card titled
   "Completed tasks" displayed task _load points_. It now shows the real
   completed-task count (`tasks / 7d`) with **Task load** (`pts / 7d`) as a
   separate card, alongside recorded activity.
5. **Two different readiness numbers on one screen.** The readiness ring showed
   the server score (which cannot see the local completion ledger) while the
   advice, the low-readiness flag and the recorded history all used the combined
   client reading — so real completed tasks visibly moved everything except the
   headline number. The ring now shows that same single combined reading.
6. **A failed history read was invisible.** When the server history is
   unreachable the Overview now says so in plain words ("Server history is
   unavailable right now — showing only the days this device recorded. Nothing
   is invented.") instead of silently pretending the athlete has no history. Raw
   RPC text is never surfaced.

### Database

- Created: `supabase/migrations/20261003000000_recovery_history_checkin_values.sql`
  (additive; replaces one read-only RPC). **Not applied to production**: this
  environment has no Supabase credentials/CLI and no `.env` keys, exactly as
  recorded in `docs/SVJ_MIGRATION_RECONCILIATION.md` §5. The migration is
  recorded there in §6 for the next authorized `supabase db push`.
- Reused: `svj_recovery_checkins`, `svj_readiness_daily`,
  `svj_activities`, `svj_activity_load_points`, `svj_training_load_points`,
  `svj_load_band`, `svj_compute_readiness`, `svj_get_my_readiness`,
  `svj_save_my_recovery_checkin`. No new table, column, index or policy.

### Tests

- `tests/recovery-history-db.test.mjs` (13) — real PostgreSQL (PGlite, and
  native PG 17 in CI when a local DB is provided) replaying the full migration
  chain: real duration/type load, the 3h cap, a very-high week with no rest day,
  partial readiness with no check-in, check-in refinement + per-day idempotency,
  the history payload carrying the athlete's own values, the
  with/without-limit PostgREST contract, unauthenticated rejection, cross-user
  isolation and the signature/`SECURITY DEFINER`/`search_path` shape.
- `tests/recovery-automation.test.ts` (21) — SQL audit pins (load, partial
  readiness ordering, additive-only migration, grants, the corrected aggregate)
  plus every `mergeServerHistory` rule and the honest best-sleep/trend states.
- `tests/recovery-automation-ui.test.mjs` (9) — the real Overview component in
  jsdom: partial score with no check-in, completed tasks moving the headline
  score, real task COUNT vs task LOAD, unchecked/out-of-window completions
  ignored, server history restoring real sleep, the honest unreachable-server
  note (and no raw error text), and no fabricated trend bars.

Validation for the Phase 2 checkpoint: **1079 tests — 1077 pass / 0 fail / 2
skipped** (both skips pre-existing native-PostgreSQL-only cases),
`bunx tsc --noEmit` clean, `bunx eslint src/` 0 errors, Prettier clean,
`bun run build` PASS, Android phone/wear builds via CI.

### Manual verification

Signed-in founder check: open Recovery → Overview shows a score even before the
daily check-in (never 0), "Completed tasks" shows a count with Task load shown
separately, saving a check-in refines the score, the 7-day chart shows only the
days actually recorded, and "your best sleep" stays in its honest
insufficient-data state until enough nights are logged. After the migration is
applied in production, reinstalling (or signing in on a new device) must
reproduce the same trend and sleep evidence from the server.

## Phase 3 — Overview intelligence (founder-only)

Three widgets added **around** the existing TrainRecovery panel in the founder
Overview — the panel stays the single readiness engine, unchanged.

### Today's Focus (`todaysFocus` in recoveryInsights.ts)

Deterministic, explainable recommendation derived from the **same combined
`ReadinessResult` the panel renders** (published via the shared channel below —
never recomputed, so it cannot disagree with the ring):

- `rest` — score < 40, or very-high load with no rest day in the last 3.
- `lighter` — score < 60, or high load with no rest day in the last 3.
- `stronger` — score ≥ 78 AND (low load or a rest day in the last 3).
- `normal` — everything else.

The Training Profile goal (primary signal) is reflected in the wording; an
applicable `svj_goals` row (secondary) appends a progress sentence. A goal is
ignored unless `status === 'active'` AND `period_start ≤ today ≤ period_end`
(`applicableActivityGoals`); `personalization.goals` is not used. No medical
advice, no AI generation.

### Recovery Streak (`recoveryCheckinStreak`)

Consecutive calendar days ending today (local day basis) where the
**server-backed** history row has `hasCheckin === true`. A missing day breaks
the streak; local-only placeholder days never count; opening Recovery without
saving a check-in never counts; a failed save never counts (the save RPC must
succeed for the server row to exist). No new table/RPC. The widget reuses the
Header 60-Day gold Flame pill styling.

### Muscle recovery map (`estimateMuscleRecovery`)

Estimated training recency/load per muscle group from the real
`svj_recent_muscle_history` rows (recency, direct/supporting sets, volume).
States: Fresh (last trained ≥ 4 days ago), Moderate (1–3 days), High (today),
No recent data (nothing in the 7-day window). Explicitly labelled
"Estimated from recent training history — not a medical or sensor
measurement", with a full sr-only text equivalent (state + reason per muscle).
**RPC unavailability is a first-class state**: if `svj_recent_muscle_history`
is not deployed (PGRST202/42883/42P01, sanitized via the existing
`sanitizeTrainingRpcError`), the map shows "Muscle recovery data isn't
available on this deployment yet." — no fake values, and Focus, streak,
readiness, check-in and history are unaffected. A transient failure shows a
retry card. Data loads through the lightweight `useRecoveryInsights` hook
(`svj_list_goals`, `svj_get_my_training_profile`, `svj_recent_muscle_history`
only — `useTrainingPlan` is deliberately not mounted).

### Shared readiness channel (smallest refactor)

`TrainRecovery` now publishes its already-computed combined `ReadinessResult`
and day history upward through `ReadinessHistoryProvider`
(`src/app/lib/readinessShared.ts` + `src/app/components/ReadinessHistoryProvider.tsx`),
so the Focus and Streak widgets read exactly the panel's numbers instead of
computing a second, competing readiness. The standalone Train › Recovery path
is unchanged (no provider → no widgets), and its behavior is pinned by the
Phase 1 UI test.

### Tests

- `tests/recovery-insights-phase3.test.ts` (31) — streak (0 with no
  check-ins, consecutive counts, missing-day break, local placeholders never
  counted), Focus (profile-goal first, svj_goals secondary, expired-by-date
  and future goals ignored, deterministic reactions to readiness/load/band
  changes, never contradicting the panel score), fatigue (states from real
  rows, stale history, empty data, broken rows tolerated, disabled muscles
  skipped).
- `tests/recovery-insights-widgets.test.mjs` (15) — the real Overview widgets
  in jsdom against mocked RPC boundaries: widget stacking around the panel,
  gold Flame pill, focus wording with profile goal + applicable goal, expired
  goal ignored, all three muscle states + sr-only text equivalent, the
  deployment-unavailable and transient-error states (no raw error text), empty
  muscle state, loading state, six sections intact, standalone Train ›
  Recovery path widget-free.

Validation for the Phase 3 checkpoint: **1125 tests — 1123 pass / 0 fail / 2
skipped**, `bunx tsc --noEmit` clean, ESLint 0 errors on changed files,
Prettier clean, `bun run build` PASS. No database changes.

## Phase 4 — History: heatmap calendar + sleep insights

The Recovery → History placeholder is replaced by a real, server-authoritative
history experience. Overview, Goals, Records, Progress and Devices are
unchanged.

### Day-basis decision (locked)

The History calendar is built ONLY from `svj_list_my_recovery_history` rows via
the existing typed wrapper (`listMyRecoveryHistory`, `RecoveryHistoryPoint`).
The server-returned `date` string is the canonical day key: rows are placed on
that key verbatim, never shifted to a local calendar day, and local
`RecoveryDayRecord` storage is never merged in to "fill" dates (local storage
remains only for the existing Phase-2 Overview fallback). Documented and pinned
by `tests/recovery-history-phase4.test.ts`.

### Heatmap (`buildRecoveryHeatmap`)

- Last 35 server calendar days ending on the newest server date (the server is
  the day authority; a fully empty history renders an empty grid — no invented
  dates).
- **Scored day**: every server row is scored — `score > 0` AND `score === 0`
  are both real data. Intensity derives deterministically from the score via
  the existing `gradeForScore`: excellent ≥ 78 (emerald ◆), good 60–77 (gold
  ◆), fair 40–59 (orange ◇), poor < 40 (red ✕).
- **Missing day**: a calendar day with no server row is a neutral no-data cell
  (`·`, white/5) with `score: null` — never a fabricated zero, never treated as
  poor recovery.
- Colour is never the only signal: every cell carries a glyph, an
  `aria-label` ("September 18, readiness 72, good, check-in completed" /
  "September 19, no recovery data") and an sr-only copy. Days are real
  `<button>`s (44px targets, visible focus, `aria-pressed`); selecting one
  shows the day's server fields (readiness + grade, check-in, reported sleep,
  load band) or its honest no-data note. A legend lists all five states with
  score ranges.

### Sleep vs readiness (`correlateSleepReadiness`)

Deterministic Pearson correlation of `sleepHours` ↔ `score` over the same
server rows (one authoritative collection per mounted Recovery destination —
no second history request):

- a pair needs a finite `sleepHours > 0` AND a finite `score ≥ 0` on the same
  server day; anything else is skipped (missing sleep is never 0),
- fewer than **5 usable pairs** (`SLEEP_CORRELATION_MIN_SAMPLES`) →
  `insufficient_data` with the count shown,
- zero variance on either axis (or any non-finite intermediate) → `r = null`
  and `no_clear_relationship` — NaN/Infinity can never reach the UI,
- |r| ≤ **0.3** (`SLEEP_CORRELATION_WEAK_THRESHOLD`) → `no_clear_relationship`,
- r > 0.3 → "On days after longer reported sleep, your readiness scores have
  tended to be higher"; r < −0.3 → the opposite. Neutral, non-causal wording
  only; the card also states the paired-day count and "observed tendency only,
  not a cause".

### Best sleep (reused)

The History tab reuses the existing `bestSleepRange` (no competing algorithm)
and shows its honest insufficient-data state until enough paired nights exist;
a displayed range is labelled "From your own logged recovery history — not a
clinical recommendation".

### Loading / empty / error

Loading → "Loading your recovery history…"; empty history → "No recovery
history yet — save a check-in on the Overview tab to start."; RPC failure →
"Recovery history is unavailable right now." with a retry button (raw
PostgREST text never reaches the UI). A history failure never affects the
Overview, Focus, streak, muscle map or check-in flow.

### Tests

- `tests/recovery-history-phase4.test.ts` (22) — scored/low/missing-day rules,
  server-key authority, check-in distinction, empty/malformed input, ordering,
  accessible label pieces; correlation: 0 and <5 pairs, excluded missing
  sleep/score, positive/negative/weak relationships, zero-variance safety,
  no NaN/Infinity, determinism, non-causal wording.
- `tests/recovery-history-ui.test.mjs` (15) — the shipped section in jsdom:
  scored vs low vs no-data cells, accessible labels, button semantics +
  `aria-pressed`, day detail, legend, empty/loading/error+retry states,
  insufficient-data and positive-tendency sleep cards, best-sleep honest and
  populated states, six-section shell intact, standalone Train › Recovery
  path unchanged.

Validation for the Phase 4 checkpoint: **1162 tests — 1160 pass / 0 fail / 2
skipped**, `bunx tsc --noEmit` clean, ESLint 0 errors on changed files,
Prettier clean, `bun run build` PASS. No database changes.

## Phase 5 — Recovery goals, lifecycle fix, Discipline progression

Recovery → Goals is now a real section on the EXISTING `svj_goals` system — no
second goals table, no client-owned progress. All progress is derived on the
server; the client can only create, retarget and cancel.

### Migration: `20261004000000_recovery_goals.sql` (additive, idempotent)

DEPENDENCY: requires `svj_recovery_checkins` + `svj_readiness_daily`
(20260919120000_recovery_readiness.sql). It does NOT depend on the Automated
Training chain. NOT applied anywhere yet (no production credentials in this
environment).

- Metric CHECK `svj_goals_metric_check` widened: the four activity metrics +
  `recovery_checkin_count`, `sleep_7h_day_count`, `rest_day_count`,
  `readiness_60_day_count`. A companion constraint forces `activity_type IS
NULL` on recovery metrics (day counts can't take an activity filter).
- `svj_goal_progress(svj_goals)` (same signature) gains the four branches:
  - `recovery_checkin_count` = COUNT(DISTINCT checkin_date) from
    `svj_recovery_checkins` in the period — a real stored row is required.
  - `sleep_7h_day_count` = stored check-in days with `sleep_hours >= 7`;
    NULL/missing sleep is excluded, never treated as 0.
  - `rest_day_count` = elapsed period days with NO canonical `svj_activities`
    row ending that UTC day — the SAME rest-day semantics as
    `svj_compute_readiness` (reused logic, not a parallel definition).
  - `readiness_60_day_count` = `svj_readiness_daily` days with `score >= 60`
    (the existing LOW_READINESS_THRESHOLD boundary); missing days don't count.
    All four count only ELAPSED days: `period_start .. LEAST(period_end, today)`
    on the server clock; future days never contribute. Activity branches are
    byte-for-byte the original rules (anti-cheat guards intact).
- `svj_goal_target_error()` + `svj_create_goal`: recovery targets must be
  positive integers ≤ the number of calendar days in the period (weekly ≤ 7,
  monthly ≤ 31), and reject an activity type. Activity targets unchanged.
- `svj_goal_metric_units`: recovery metrics return 'days'.
- **Expiry fix:** `svj_refresh_goal_statuses` (return type stays `void`) now
  walks every active goal: progress ≥ target → `completed` (completion wins
  over expiry, even past the end date); `period_end < server today` (unmet) →
  `expired`; otherwise active. Old goals stuck active past their period
  repair themselves on the next refresh/list — nothing is deleted.
- **Discipline progression:** `svj_award_recovery_goal_discipline(user, goal)`
  (SECURITY DEFINER, revoked from PUBLIC/anon/authenticated, never a callable
  grant endpoint) inserts `stat_events` with
  `event_key = 'recovery_goal.completed:<goal_id>'`, `source = 'recovery_goal'`,
  `delta = +1 discipline`, `ON CONFLICT DO NOTHING` (the partial unique index
  `stat_events_identity` makes replays no-ops). `user_stats.discipline` is
  incremented only when the event row was actually inserted. Anti-farming:
  max +2 `recovery_goal` discipline per server day — an over-cap event is
  deleted so the ledger stays the sole truth; the `activity` cap sums are
  independent and untouched. Rewards fire ONLY from an observed
  active→completed transition during refresh: cancelled/expired/incomplete
  goals grant nothing, and goals completed before this migration are NOT
  retroactively rewarded (no backfill).

### UI: `RecoveryGoalsSection.tsx`

Create form (SVJSelect for metric/target/period — no native `<select>`)
offering ONLY the four Recovery metrics with human labels (Recovery Check-ins,
7h+ Sleep Days, Rest Days, Ready Days (60+)), plain qualifying-condition hints
("Check-in days where you reported 7+ hours of sleep" — no medical claims),
client-side target mirroring for immediate UX only. Goal cards show the server
status badge, an accessible progressbar (`aria-valuenow` + full label),
"N / M days" copy, period label, edit (+1 day) and cancel for active goals.
Loading, empty, deployment-unavailable (sanitized) and retryable error states
are honest. Goals placeholder removed; Records/Progress/Devices placeholders
untouched; no top-level navigation changes.

### Compatibility

`GOAL_METRICS` split into `ACTIVITY_GOAL_METRICS` (TrainGoals keeps its
existing form) + `RECOVERY_GOAL_METRICS` + combined union for
validation/normalization. `applicableActivityGoals` skips recovery metrics so
Today's Focus can never say "complete 5 sleep days". Standalone Train ›
Recovery unchanged; non-founder navigation unchanged.

### Tests

- `tests/recovery-goals-db.test.mjs` (33, real PostgreSQL via
  PGlite/native-local convention): activity metrics unchanged (incl. manual
  step anti-cheat), each recovery metric definition (duplicate-day upserts
  can't double-count, 7h boundary, NULL sleep, future days, missing readiness
  days), target validation, full lifecycle (active/completed/expired/
  completed-not-expired/cancelled/stuck-repair), and the stat contract
  (+1 on completion, idempotent replays, repeated lists, zero for
  cancelled/expired/incomplete, +2 daily cap with third rolled back,
  activity-cap independence).
- `tests/recovery-goals-ui.test.mjs` (13, jsdom): four metrics only, no
  activity metrics, no native select, qualifying hints, create/edit/cancel
  flows, completed/expired cards, empty/loading/error+retry states,
  placeholder and standalone-path invariants.

Validation for the Phase 5 checkpoint: **1208 tests — 1206 pass / 0 fail / 2
skipped**, `bunx tsc --noEmit` clean, `bunx eslint src/` 0 errors (38
pre-existing warnings elsewhere), Prettier clean, `bun run build` PASS.

## Phase 6 — derived Recovery records

Recovery → Records is now a real section whose values are **derived on read**
from canonical server history — no record table, no record column, no stored
record value, and no record write RPC of any kind. The client can only ask the
server for records it can prove from the athlete's own history.

### Migration: `20261005000000_recovery_records.sql` (additive, idempotent)

DEPENDENCY: requires `svj_recovery_checkins` + `svj_readiness_daily`
(20260919120000_recovery_readiness.sql). It re-declares nothing that Training
uses (`svj_list_records`, `svj_record_eligible`, `svj_record_value`,
`svj_save_activity` are untouched) and touches no goal, stat or event table.
**No table, no column, no index** — the migration is one function plus its
grants. NOT applied anywhere yet (no production credentials in this
environment).

Canonical sources: `public.svj_readiness_daily` (server readiness snapshots) and
`public.svj_recovery_checkins` (stored check-ins). No localStorage history, no
optimistic client state, no demo data, no Character Matrix input.

- `svj_list_recovery_records()` — `STABLE`, `SECURITY INVOKER` (the same rights
  as the existing `svj_list_records()` reader, so RLS remains the second line of
  defence), `SET search_path = public`, identity from `auth.uid()` only, no
  caller-supplied user id, `REVOKE` from `PUBLIC, anon`, `GRANT EXECUTE` to
  `authenticated`. Envelope:
  `{ ok, records: [{ record_type, value, achieved_date, start_date }] }`.
  Only records that genuinely exist appear in the array — the client never
  receives a placeholder 0. `value` keeps full numeric precision
  (`SUM(score) / 7.0`); rounding happens in the display layer only.

The four records (locked, no others):

| Record type                 | Definition                                                                                                                                                                                       | Tie-break                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `highest_readiness_score`   | `MAX(score)` over canonical readiness days                                                                                                                                                       | most recent qualifying day |
| `longest_checkin_streak`    | longest run of consecutive stored check-in dates (one date counts once; a missing calendar day breaks it)                                                                                        | most recent run            |
| `longest_ready_streak`      | longest run of consecutive readiness days with `score >= 60` — the existing Phase 2/5 boundary (`svj_compute_readiness` "good", `svj_goal_progress.readiness_60_day_count`), not a new threshold | most recent run            |
| `best_7d_readiness_average` | highest `SUM(score) / 7.0` over 7 consecutive server calendar days that **all** have canonical rows; a missing day invalidates the window and is never counted as 0                              | most recent window         |

- Streaks use gaps-and-islands (`date - row_number()`); consecutiveness is
  exactly `date + 1 calendar day` on the canonical SERVER date. No local-calendar
  shifting, no merging of local history, no synthesized days.
- `achieved_date` is the anchor server day (score day, streak end, window end);
  `start_date` carries the first day of a streak/window and is `null` otherwise.
- A real stored score of `0` is data: it sets `highest_readiness_score` to 0 and
  is counted inside a 7-day average. An absent record type is simply absent —
  never rendered as 0. Records agree with History's row set: a day History does
  not show can never enter a streak or a 7-day window.
- Read/derive/display only: no XP, no Discipline, no Recovery stat, no badge, no
  Plus access and no achievement is awarded, and goals are never completed,
  progressed or expired by reading records.

**Why a narrow `svj_list_recovery_records()` instead of extending
`svj_list_records()`:** the actual DTO/callers decide it. The Training record DTO
requires `activity_id`, `activity_type` and `source` (a Recovery record has no
activity, so a fabricated id or a loosened normalizer would be needed), and
`TrainProgress` renders one card per key of `RECORD_LABELS` — merging Recovery
types into the shared list would have made Train › Progress advertise "Longest
Check-in Streak — complete more activities to set this record". Extending the
shared reader would also have meant re-declaring the whole Training records
function inside a Recovery migration, which the "Training Records must remain
unchanged" invariant forbids in spirit. Training's reader is therefore
byte-identical, and its failure surface, cost profile and deployment are
independent.

### Client

- `src/app/lib/recoveryRecords.ts` (new, pure — no network): the
  `RECOVERY_RECORD_TYPES` group (the training group is a separate
  `TRAINING_RECORD_TYPES`, so neither can leak into the other), labels,
  `RecoveryRecordDto` + normalizer (a real 0 survives; broken rows are dropped),
  display order, and formatting — value with units, spoken values for screen
  readers, and date/range labels built from the ISO parts so a server day can
  never shift into a neighbouring local day. The client never computes a record.
- `src/app/lib/recovery.ts` gains `listMyRecoveryRecords()` — the same thin
  `rewardsRpcClient()` wrapper pattern as the other recovery readers.
- `src/app/components/recovery/RecoveryRecordsSection.tsx` renders the four
  records as cards (label, value, achieved/ending date, covered range, short
  explanation) with honest per-record "no record yet" copy, an insufficient
  history state for the 7-day average, semantic `h2`/`h3`/`ul` structure,
  `aria-hidden` decorative icons, spoken value equivalents, and a 44px retry on
  failure ("Recovery records are unavailable right now." — raw PGRST/SQL text
  never reaches the user). A failed records read leaves Overview, History and
  Goals fully working. No ranking, percentile or benchmark language.
- `src/app/lib/goalsRecords.ts` exports were renamed to make the split
  explicit: `TRAINING_RECORD_TYPES`, `TrainingRecordType`,
  `TRAINING_RECORD_LABELS`, `TrainingRecordDto` (mechanical, no behaviour
  change; `TrainGoals` updated). Record values, eligibility rules and the
  `svj_list_records` contract are unchanged.

### Tests

- `tests/recovery-records-db.test.mjs` (30, real PostgreSQL via
  PGlite/native-local convention): no rows → no record, a real 0 as data,
  highest score, most-recent tie-breaks for all four records, streaks growing
  and breaking on missing days / a 59 / duplicate same-day rows, exactly seven
  complete days vs six, a missing middle day invalidating a window, overlapping
  windows with the highest average winning, real zeros inside an average, no
  NaN/Infinity, agreement with History's day set, "no record table / no write
  RPC / hardened reader (search_path, not definer, anon denied)", re-derivation
  after canonical edits, no stat/goal side effects, and per-user isolation.
- `tests/recovery-records-ui.test.mjs` (20, jsdom; only the Supabase transport is
  mocked, the shipped section/client/normalizer render as-is): Records is no
  longer a placeholder while Progress/Devices still are, six-section shell
  intact, exactly four cards with the locked labels and order, one rendering
  test per record, a real 0 rendered as data, absent records never rendered as 0,
  insufficient-history state, honest empty state, loading, sanitized retryable
  error with a ≥44px target, only the derived reader ever called, competition
  language absent, semantic headings, and unshifted date labels.
- `src/app/lib/recoveryRecords.test.ts` (13, pure): registry/label contract,
  training-vs-recovery type separation, normalization (including the 0 case),
  ordering, value/spoken/date/range formatting.

Validation for the Phase 6 checkpoint: **1271 tests — 1269 pass / 0 fail / 2
skipped**, `bunx tsc --noEmit` clean, `bunx eslint src/` 0 errors (38
pre-existing warnings elsewhere), Prettier clean in the checked scope (`src/**`,
plus the new files — the repo-wide `prettier --check .` baseline is unchanged),
`bun run build` PASS.

## Phase 7 — weekly recovery intelligence, MY SVJ PLAN integration, Rest-Day alert

Three connected features, all deterministic and derived from data SVJ already
stores. No new table, no persisted digest prose, no AI, and **no production
migration applied**. The Recovery destination stays founder-only; the MY SVJ
PLAN note ships to anyone who can see MY SVJ PLAN (its existing Plus gate).

### Data sources (reused — nothing new)

- `svj_list_my_recovery_history` via `listMyRecoveryHistory()` →
  `RecoveryHistoryPoint[]` (`date`, `score`, `trainingLoad`, `hasCheckin`,
  `sleepHours`, `restDaysLast3`, …). The same rows Overview/History/Records use.
- The panel's already-computed `ReadinessResult` published through
  `ReadinessHistoryProvider` — the digest/alert never recompute readiness.
- `svj_get_my_readiness` (server snapshot) in MY SVJ PLAN, through the new
  `readinessFromServer()` adapter.
- `svj_recent_muscle_history` (via the existing `useRecoveryInsights`) for the
  optional strength line.
- Reused pure helpers: `gradeForScore`, `bandForLoad`, `readinessAdvice`,
  `estimateMuscleRecovery`, `todaysFocus`.

### One authoritative focus decision (hardened)

The Phase-3 thresholds were extracted verbatim into
`readinessEmphasis(readiness): "rest" | "lighter" | "normal" | "stronger"` and
`todaysFocus` now delegates to it. **Every Phase-7 surface consumes that one
function — the threshold is never copied into a component.**

| Emphasis   | Rule                                                               |
| ---------- | ------------------------------------------------------------------ |
| `rest`     | `score < 40` OR (`band === "very_high"` AND `restDaysLast3 === 0`) |
| `lighter`  | `score < 60` OR (`band === "high"` AND `restDaysLast3 === 0`)      |
| `stronger` | `score ≥ 78` AND (`band === "low"` OR `restDaysLast3 > 0`)         |
| `normal`   | everything else                                                    |

The server-readiness adapter `readinessFromServer()` maps
`svj_get_my_readiness` onto the canonical `ReadinessResult`. **Documented
limitation:** the server cannot see the local task-completion ledger, so
`taskLoadPoints` is 0 in the adapter — it is the activity-only reading, and the
Recovery destination's combined reading remains the authority.

### A. Weekly Recovery Digest — Recovery → Progress

The Progress placeholder is replaced by a real, server-authoritative digest
built from the latest **seven canonical server days** (day keys are used
verbatim; local history is never merged in). Pure helper
`buildWeeklyRecoveryDigest(serverDays, days = 7)`:

- **State:** 0 scored days → `insufficient`; a full seven scored days →
  `complete`; anything between → `partial`. `unavailable` is **not** a digest
  state — a failed read is the caller's separate retryable error, so a
  transient outage can never masquerade as "no data".
- `averageReadiness` = mean of the window's finite scores, rounded (null when
  none). A real stored score of `0` counts as data; a **missing calendar day is
  never averaged in as 0**.
- `checkinDays` counts rows with `hasCheckin === true`; `sleepDays` counts rows
  with a finite `sleepHours > 0` (**missing sleep is never 0 hours**).
- `restDaysLast3`/`loadBand` come from the newest row and are `null` when the
  server did not report them (the UI then omits those rows instead of guessing).
- A concise strength line reuses `estimateMuscleRecovery` and is shown only
  when `svj_recent_muscle_history` actually answered.

### Readiness trend (exact algorithm)

`readinessTrendDirection(serverDays, days = 7)`, documented and tested:

1. Take the finite scores of the last seven canonical server days, oldest →
   newest (gaps ignored — never filled with 0).
2. Fewer than **`READINESS_TREND_MIN_DAYS = 4`** scored days →
   `insufficient_data` (no trend is claimed from a tiny sample).
3. Split in half (`earlier` = first `floor(n/2)`, `recent` = the rest) and
   compare their means; `delta = recentAvg − earlierAvg`.
4. `delta > +READINESS_TREND_STABLE_BAND (3)` → **improving**; `delta < −3` →
   **declining**; otherwise → **stable** (a tiny/noisy change stays stable).

The UI always renders the trend as a sentence (`digestTrendSentence`) — colour
and the icon are decorative only.

### B. MY SVJ PLAN Recovery Integration

`SvjPlanView` already reads `svj_get_my_readiness`; it now adapts that snapshot
with `readinessFromServer()` and renders the presentation-only
`PlanRecoveryCard`, which calls `readinessEmphasis`/`todaysFocus`. Copy by
emphasis: rest → “Prioritise recovery today”, lighter → “Keep it light today”,
normal → “Train normally today”, stronger → “Green light for a strong session”.

**Safety (enforced by design):** the card is pure presentation. It never deletes
a completed mission, edits historical activity, changes earned XP, rewrites a
past plan, awards XP or touches entitlement. The rest/lighter cards state
“Today's planned missions stay exactly as they are”; the stronger card states
“Progressive overload still follows your existing training plan — today's
readiness is context, not an automatic increase.”

### C. Rest-Day alert card

`restDayAlert(readiness)` is active **only** when `readinessEmphasis` returns
`rest` — the Phase-3 rule, reused, never duplicated. It renders nothing
ootherwise, so it can never become a generic banner. Evidence is limited to what
the reading actually contains: the score (always), the load line only when the
band is `high`/`very_high`, and the rest line only when `restDaysLast3 === 0`.
The suggestion (“Prioritise sleep, hydration, mobility and low-intensity
movement.”) is clearly a suggestion, never a deficiency claim. It is rendered at
the top of the founder Overview (above Today's Focus) from the same published
`ReadinessResult`, has a semantic heading (`h2`), `role="status"`, readable
evidence text, and a ≥44 px CTA (“Review today's plan”). The CTA is passed only
when a real destination exists — `RecoveryView` receives `onOpenPlan` from
`App.tsx` (`handleTabChange("plan")`), so the button is never dead.

### Notification integration decision (documented limitation)

The existing `NotificationCoordinator` builds a **deterministic, app-wide**
plan from local state (`buildNotificationPlan`) and replaces the whole native
schedule set (`replaceNativeNotificationSchedules` — idempotent, no duplicates).
That planner carries no readiness input, and the coordinator is mounted for
**every** user (including non-founders). Wiring a rest-day alert into it would
require loading readiness into the app shell for all users and adding a second,
unrelated data path with its own staleness/permission semantics — a substantial
change outside Phase 7's scope. Per the phase spec it is therefore **not
forced**: the rest-day recommendation is delivered in-app (Overview alert +
MY SVJ PLAN note) only, and this limitation is recorded here.

### Failure isolation & missing data

Each source fails honestly and independently: a failed history read → a
sanitized “Your weekly recovery summary is unavailable right now.” with a
retryable ≥44 px button (raw `PGRST…`/SQL text never reaches the UI);
`useRecoveryInsights` unavailable/error simply omits the strength line; the
plan note renders nothing when no readiness exists. Readiness, check-in, Focus,
streak, muscle map, History, Goals, Records and Train are all unaffected by a
Phase-7 failure.

### Database decision

**None.** No table, column, index, policy, grant or RPC was added and no
migration was written or applied. The digest and alert are derived on read from
existing canonical history; the plan note reuses the existing readiness RPC.

### Tests

- `tests/recovery-weekly-phase7.test.ts` (31, pure) — digest sufficiency
  (none / one row / partial / full / real 0 / gaps / window cap / malformed
  input), sleep + check-in consistency, trend thresholds and tiny-sample /
  noise / gap / NaN safety and wording, the server adapter (mapping + band
  fallback + NaN safety), the emphasis matrix (rest below 40, very-high-no-rest,
  high-no-rest, lighter, stronger, high-with-rest normal) plus its exact
  agreement with `todaysFocus`, and the alert (inactive/empty, score-only,
  load+rest evidence, neutral non-medical wording).
- `tests/recovery-weekly-ui.test.mjs` (18, jsdom; only the Supabase transport is
  mocked) — digest loading / full week / partial / insufficient / sanitized
  retryable error + successful retry, the alert absent when unjustified and
  present with real evidence when justified, no CTA without a handler and a
  working CTA with one, the four plan states (rest/lighter/normal/stronger,
  including “not an automatic increase”), the Progress panel is real and the
  placeholder is gone, Overview wires the alert CTA to the plan, and the
  standalone Train › Recovery path carries no Phase-7 surfaces.
- Updated: `tests/recovery-goals-ui.test.mjs`, `tests/recovery-records-ui.test.mjs`
  and `tests/recovery-insights-widgets.test.mjs` no longer treat Progress as a
  placeholder (Devices is the only remaining one), and their mock maps now cover
  the digest's imports.

Validation for the Phase 7 checkpoint: **1320 tests — 1318 pass / 0 fail / 2
skipped** (both skips pre-existing native-PostgreSQL-only), `bunx tsc --noEmit`
clean, ESLint 0 errors on changed files, Prettier clean on changed files,
`bun run build` PASS. No database changes.

### Known limitations

- The plan's recovery note sees the activity-only server reading (no local task
  ledger), so it can differ slightly from the Overview's combined number.
- Strength lines depend on `svj_recent_muscle_history` being deployed; until
  then the digest simply omits them.
- Production migrations remain unapplied (no credentials here), so Recovery
  Goals/Records are unaffected but still require the authorized push.
- Rest-day notifications are deliberately not wired (see the decision above).

### Manual verification

Signed-in founder: open Recovery → Progress shows a real weekly digest for the
last seven recorded days; a very-high-load week with no rest surfaces the
Rest-Day alert at the top of Overview with working evidence and a “Review
today's plan” button that opens MY SVJ PLAN; a normal reading shows no alert.
A Plus account: MY SVJ PLAN shows the Recovery check note matching the reading,
and completing/uncompleting missions still behaves exactly as before.
