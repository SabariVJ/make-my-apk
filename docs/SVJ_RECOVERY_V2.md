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
| 3     | Overview intelligence (Today's Focus, Recovery Streak, Muscle Recovery Map)          | pending                                                                   |
| 4     | History (readiness heatmap, sleep vs. performance)                                   | pending                                                                   |
| 5     | Recovery goals + Discipline progression                                              | pending                                                                   |
| 6     | Derived recovery records                                                             | pending                                                                   |
| 7     | Weekly digest, My SVJ Plan integration, rest-day alert card                          | pending                                                                   |

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
