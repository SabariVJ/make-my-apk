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

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Recovery destination + navigation shell | **shipped (founder-only)** |
| 2 | Automation audit + missing gaps (partial readiness, task counts, history automation) | pending |
| 3 | Overview intelligence (Today's Focus, Recovery Streak, Muscle Recovery Map) | pending |
| 4 | History (readiness heatmap, sleep vs. performance) | pending |
| 5 | Recovery goals + Discipline progression | pending |
| 6 | Derived recovery records | pending |
| 7 | Weekly digest, My SVJ Plan integration, rest-day alert card | pending |

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
