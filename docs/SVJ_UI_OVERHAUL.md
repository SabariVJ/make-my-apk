# SVJ — Deep UI/UX Overhaul

Running changelog for the visual-redesign pass. Keep this current if the work is
interrupted: it is the audit trail for what changed per screen.

## Phase 0 — Design system

### Tokens (`src/styles.css`)

The palette comment block at the top of the `@theme` section is now the canonical
record of the actual hex values. Summary:

| Role                                    | Token                         | Value     |
| --------------------------------------- | ----------------------------- | --------- |
| Page plane                              | `--color-svj-bg`              | `#0B0B0C` |
| Primary cards                           | `--color-svj-surface`         | `#17171A` |
| Sheets / menus                          | `--color-svj-surface-overlay` | `#212126` |
| Sunken data wells                       | `--color-svj-surface-inset`   | `#08080A` |
| Accent (brand)                          | `--color-svj-crimson`         | `#C81E3A` |
| Accent pressed/active                   | `--color-svj-crimson-deep`    | `#A0182E` |
| Accent highlight                        | `--color-svj-crimson-soft`    | `#E62846` |
| Premium (tier/founder/achievement only) | `--color-svj-premium`         | `#C9A227` |
| Foil edge (membership card only)        | `--color-svj-bronze`          | `#8A6A2F` |

Attribute palette (now shared tokens, not local hex copies):
Physical `#10B981`, Ambition `#A855F7`, Intellect `#F59E0B`, Mental `#EAB308`,
Social `#3B82F6`, Discipline `#F43F5E`.

New utilities: `svj-elev-1/2/3` (a real three-step shadow scale),
`svj-radius-card` (1.25rem) vs `svj-radius-row` (0.75rem), and `svj-lit-top`
(a hairline top light so near-black surfaces read as lit rather than flat).

**Sanity check against the generic AI dark-mode app:** that app is one flat
`#0f0f10` with a single `#7c3aed`-style accent, one radius, and no elevation.
This system has four distinct surface planes, a three-step accent scale, a
premium accent reserved for reward moments, six authored attribute hues, two
radii and three shadow steps — and none of the six attribute hues is a
default Tailwind swatch pick.

### Shared primitives

| Component          | Purpose                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SVJScoreRing`     | THE treatment for "a value out of a maximum" (readiness, steps, active kcal, daily XP, training attendance). Renders an honest dashed empty ring for `null` instead of a fake `0`. |
| `SVJHeroCard`      | Headline content only; variants `active` / `complete` / `reward` / `milestone` so a finished milestone never looks like an active mission.                                         |
| `SVJTimelineStep`  | Genuinely sequential content only (60-Day milestone history).                                                                                                                      |
| `SVJEmptyState`    | One component for empty / error / coming-soon, with per-call-site copy.                                                                                                            |
| `SVJSectionHeader` | Sentence case by default; caps is an explicit `variant="badge"` opt-in.                                                                                                            |

`src/app/lib/attributeColors.ts` is the single source of truth for the six
Character Matrix hues, plus the category → attribute mapping. The designed
avatar monogram helpers (`avatarMonogram`, `avatarPalette`) live in
`src/lib/avatar.ts` and are consumed by the existing `AvatarImage` /
`AvatarFrame` components rather than by a second avatar implementation.

## Phase 1 — Home / Challenges

- Home decomposed from seven equal-weight blocks to one hero + light sections:
  **Today's mission** hero (daily XP now a `SVJScoreRing`), **Your programs**
  (Earn Plus + 60-Day demoted to compact status chips that open the same
  destinations), **Today's movement**, **Character Matrix**, then **Today's
  tasks** and the challenge list.
- Challenge category tags now take their hue from the attribute palette.

## Phase 2 — Earn Plus

- The middle-dot meta line ("30 days of Plus · one-time launch reward · …")
  became three checked facts.

## Phase 3 — 60-Day Transformation report

- Header became a premium-accent victory-lap hero.
- Attribute-change bars use each attribute's Character Matrix hue (previously
  one flat fill for all eight) and dim on a negative delta.
- Milestone history now uses `SVJTimelineStep`.
- Insights use one colour system per type: positive (emerald), needs-attention
  (premium amber), neutral (surface).

## Phase 4 — Activity

- Step-goal ring and active-calorie goal now both render `SVJScoreRing`; the
  bespoke `ProgressRing` was deleted.
- "Step XP" milestone card renders once, on Overview, instead of verbatim on
  every sub-tab.
- Section headers sentence-cased; kcal labels de-middle-dotted.

## Phase 5 / 6 — Train and Recovery

- Recovery readiness ring uses `SVJScoreRing`; the local ring was deleted.
- The four "unavailable right now" banners became `SVJEmptyState`
  `variant="error"` with copy specific to what is missing (check-ins vs. weekly
  summary vs. history vs. records vs. goals). The goals surface still
  distinguishes "not applied to this backend" from a generic load failure.
- Best-sleep and 7-day trend callouts were demoted to a lighter editorial
  treatment (hairline surface + left accent rule) so they no longer carry the
  same weight as the check-in form.

## Phase 7 — Fuel

- Macro meters now have per-macro hue, gradient fill, glow and an accessible
  `progressbar` role; previously three identical flat bars.
- Meals section uses `SVJEmptyState` when nothing is logged, and the 7-day chart
  has its own empty state that says days with nothing logged stay empty.

## Phase 8 — Community / Leaderboard

- Every bare letter-in-circle avatar is gone: `AvatarImage` and `AvatarFrame`
  now render a deterministic two-tone monogram tile.
- Podium medals follow a real metal hierarchy (champion gold with a halo,
  silver, bronze).

## Phase 9 — Profile

- Membership card got a foil/brushed-metal treatment using the premium and
  bronze tokens; its header is no longer an ALL-CAPS section header.
- Eleven undifferentiated notification toggles are grouped into **Daily
  reminders**, **Progress & recovery**, **Membership & recap**. Same
  preferences, same persistence.

## Phase 10 — Motion

- Exactly one choreographed motion moment exists: the staged level-up sequence
  in `LevelUpModal` (emblem → tier name → staggered perks → action). The
  perpetual `animate-ping` on the nav Plus item was replaced with a static dot,
  and the modal's infinite idle rotation was removed.
- `prefersReducedMotion()` is now defensive about `window.matchMedia` being
  absent (test environments and old webviews).

## Phase 11 — second pass: the surfaces the first pass missed

After the token system landed, an audit of every `.tsx` under `src/app` showed a
long tail of screens that had never been touched and still carried the original
template chrome (Anton ALL-CAPS titles, `font-mono uppercase` micro-labels, one
card shell for everything, middle-dot meta strings, `rounded-full` used as a
container). Those are now on the system:

- **Blocking / gate screens** — `StatusScreen` (404, crash, offline, session
  expiry) and `TrialExpiredScreen` lost their ALL-CAPS Anton titles and flat
  `#121214` card, and now use the shared card radius, lit top edge and elevation
  step. `tests/status-screen.test.ts` was updated to assert the new tokens instead
  of the old ones.
- **Profile** — the bio/name/tier block was one middle-dotted meta string
  (`@handle • Tier Tier`); it is now identity on its own line with a real tier
  badge. Section headers use `SVJSectionHeader`, stat tiles are sunken data wells
  instead of four identical cards, and the Character Matrix no longer draws an
  **invented** `93/91/87/84/93/95` polygon for accounts with no stats — it renders
  `user.stats` only. The 🔥 emoji was removed from the streak tile.
- **Modals** — `XPComparisonModal`, `EditProfileModal`, `UPIPaymentModal`,
  `AuthScreen`, `RewardsView`'s reward detail. Two real defects fell out of this:
  the "you" and "opponent" competitor boxes used `rounded-full` on a `p-4` block
  (rendering as ellipses), and the same pattern appeared on the segment stat tiles
  in `RecordsView`. Both are now the shared row radius. The rivalry progress bars
  use `SVJProgress`.
- **Activity** — `ActivitySummaryCard` (shared progress primitive, sentence-case
  units), `ActivityHistory` (shared header + `SVJEmptyState` for "no activities",
  split meta strings, source badge) and `RecordsView` (personal-best cards, record
  values, heatmap filters, segment cards).
- **Train / plan / body** — `TrainGoals`, `SvjPlanView`, `BodyProfileView`,
  `SixtyDayChallengeView`, `AssessmentView`, `RouteLibrary` and the two recovery
  cards (`RestDayAlertCard`, `PlanRecoveryCard`).

The only test expectations changed were source-scanning assertions that pinned
the _old_ copy (`REQUEST SENT`, `Active Outperform Rivalry`, `% OF STEP GOAL`,
`KCAL`, the old StatusScreen tokens, `No activity yet` / `No members to show
yet`). Each was rewritten to assert the same behaviour with the new copy, and the
Activity-summary test now also asserts the shared progress primitive is used
rather than a bespoke bar.

## Phase 12 — closing the long tail

A final sweep brought the last surfaces that were still on the template onto the
system, and reconciled this changelog with the code (the previous "Not yet done"
list had drifted: several components it named had already been converted, and it
still described the legal routes as ALL-CAPS when they were not).

**Converted in this pass**

- **Editors / modals** — `TaskEditorDialog` (sentence-case title, Inter field
  labels, menus now on the overlay plane `#212126` so a menu reads as floating),
  `GoogleAuthModal` (obsidian card, real elevation, de-caps founder/status copy),
  `AvatarCropEditor` (sentence-case header, dropped "LIVE SQUARE OUTPUT").
- **Train surfaces** — `TemplateBrowser` (section headers use
  `SVJSectionHeader`, card titles are Inter semibold, filter chips are chips not
  containers, empty catalog uses `SVJEmptyState`), `LegacyTemplateImportCard`
  (premium-amber eyebrow on the token, de-dotted meta), `StrengthDetails`
  (muscle chips, set rows and the whole exercise-history panel now use
  `SVJEmptyState` for its error/empty states instead of bespoke banners),
  `StructuredStrengthCard` (hero keeps Anton but loses the ALL-CAPS).
- **Recovery** — `RecoveryView`'s destination header and the honest
  "Coming next" placeholders are sentence-case on the shared card/row radii; the
  tab strip uses the row radius. Copy the tests pin is unchanged.
- **Shell** — `App.tsx` (config-missing screen, profile splash, the restricted
  post-trial shell's modal + banner + Redeem Code heading), `TrialGate` splash.
- **Public routes** — `src/routes/landing.tsx` was still an off-palette navy/rose
  Lovable marketing page with a perpetual `animate-bounce`; it is now on the SVJ
  obsidian/crimson/premium palette with the six Character Matrix hues, and it
  links to the real `/privacy` and `/terms` pages. `src/routes/live.$token.tsx`
  (public live-share) moved to the same surfaces, and `src/routes/delete-account.tsx`
  went sentence-case/Inter. `src/routes/__root.tsx`'s 404 link dropped its mono
  micro-label.
- **Titles** — the remaining screen/section titles that still forced ALL-CAPS
  (`Activity`, `Iron Log`, `Leaderboard`, `Nutrition`, `Earn Plus`, the 60-Day
  card, `TrainingToday`'s headings, `WorkoutView` history names, `Recovery`) are
  sentence case to match the convention `ChallengesView`, `CommunityView` and
  `RecoveryView` already used. Anton small-caps stays on primary CTA buttons and
  on real badges/tiers, which is the system's intent.

One test expectation moved with the code: `tests/activity-ui.test.mjs` asserted
the task editor's select menu was `bg-[#17171A]`; it now asserts the overlay
plane (`bg-[#212126]`) the menu actually renders on. Same behaviour (a dark,
non-native menu), corrected token.

## Phase 13 — app-wide responsive density / viewport pass

**Presentation only.** No backend logic, RPC, schema, XP, tracking, training,
recovery, nutrition, notification or membership behaviour was touched, and no
migration was needed.

### One shell owns padding and nav clearance

`App.tsx` now exports two constants used by both the authenticated and the
restricted post-trial shell:

```
PAGE_CONTAINER         = mx-auto w-full px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-4
PAGE_CONTAINER_DESKTOP = lg:max-w-[86rem] lg:pr-28
```

The old shell pinned the whole app to `max-w-5xl` (1024px) _and_ reserved the
7rem rail gutter, so desktop rendered a phone-width column inside a wide window.
The content box is now ~1264px on desktop, the rail gutter is reserved exactly
once (`lg:pr-28` appears in one place), and one bottom-navigation clearance
respects `env(safe-area-inset-bottom)`. The twelve screens that each carried
their own `pb-24` / `pb-28` / `pb-32` were updated to stop duplicating it, which
is what made spacing uneven between pages.

Full-viewport gates (config-missing, profile splash, `StatusScreen`,
`AuthScreen`, `TrialExpiredScreen`, `TrialGate`) moved from `min-h-screen` to
`min-h-[100dvh]` so a browser-chrome-inflated `100vh` can never push the centred
card out of view.

### Per-screen composition

| Screen            | Change                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Train             | Hero card + "Iron Log" hero collapsed into one slim page-identity row plus a compact two-column dashboard header (promise left, real last-session + Start workout right); sub-tabs pinned under the sticky header, one control row tall.                                    |
| Train → Log       | Session name and _Add exercise_ share a row; exercise cards flow into a desktop 2-column grid; working-set summary and **Save template / Log workout** merged into one compact action row.                                                                                  |
| Train → Templates | Catalog is a responsive grid (`lg:2 / xl:3` columns) with condensed cards; the filter panel is two rows on desktop.                                                                                                                                                         |
| Train → Today     | Next session and the weekly plan sit in a desktop two-column grid, so the plan is visible without scrolling past the CTA.                                                                                                                                                   |
| Train → Progress  | Cards flow in a desktop 2-column grid instead of one card per screenful.                                                                                                                                                                                                    |
| Train → History   | Completed plan sessions + weight trend share a row; the workout list is a 2-column grid.                                                                                                                                                                                    |
| Activity          | Dropped the `max-w-2xl` phone column; the Today's-activity and Calories cards pair on desktop and the two period summaries sit side by side. START/STOP is unchanged and still sits directly beneath the tracking status.                                                   |
| Challenges        | Mission hero compacted (smaller ring, smaller title, denser stat row); task list is a 2-column grid on desktop; program chips pair up. Character Matrix stays removed.                                                                                                      |
| Recovery          | Compact header and tab row; the small insight widgets pair on desktop (`xl:grid-cols-2`) with DOM order unchanged, so the mobile stack reads exactly as before. The Devices panel now carries the `recovery-panel-devices` id its tab's `aria-controls` already pointed at. |
| Fuel              | Calorie/macro summary and the _Scan meal_ / _Manual_ actions share the first desktop row; the four meal sections are a 2-column grid; the 7-day chart keeps its height.                                                                                                     |
| Plus              | Earn Plus header compacted; the existing reward-progress grid is unchanged. `PaywallModal` and `FirstTimeOnboardingModal` are now `max-h-[92dvh]` with internal scrolling so Save/Confirm can never sit off-screen.                                                         |
| Profile           | Header and cards compacted; the _Your progress_ and _Account actions_ cards pair on desktop. Character Matrix stays in Profile. No notification controls reintroduced.                                                                                                      |
| Community         | Header, feed cards and friend/rivalry cards densified; the member directory keeps its grid.                                                                                                                                                                                 |
| Leaderboard       | Rankings are a 2-column grid instead of one row per screenful.                                                                                                                                                                                                              |
| 60-Day            | Header, in-progress stats and the completion card compacted; the 6/10-column day grid is unchanged. Empty/loading states no longer reserve 60vh.                                                                                                                            |
| Transformation    | Header and stat cards compacted; the four summary stats become a 4-column row on desktop.                                                                                                                                                                                   |
| Records / History | Activity history, records and segment cards densified; the workout-complete stat row goes 4-up on desktop.                                                                                                                                                                  |
| Modals            | `max-h-[90vh]` → `max-h-[90dvh]` on the member, UPI, XP-comparison and rewards dialogs.                                                                                                                                                                                     |
| Empty states      | `SVJEmptyState` non-compact padding reduced (`py-10` → `py-8`).                                                                                                                                                                                                             |

### Regression cover

`tests/responsive-density.test.mjs` (new, wired into `bun run test`) pins the
shared container constants, the single rail reservation, the absence of
per-screen `pb-20/24/28/32`, and — per screen — the desktop-column compositions,
the Train sub-tabs and Log controls, the template grid, the Recovery tabs,
Fuel actions, Profile's Character Matrix, the Community/Leaderboard grids, and
that no screen reintroduces in-app notification permission controls.

Three existing expectations moved with the code: `tests/navigation.test.ts`
(shell constants and the tab-row anchor), `tests/challenge-completion-ui.test.ts`
(task-row radius with the new padding), and `tests/status-screen.test.ts`
(`100dvh`).

## Deliberately left alone

- `HexagonRadarChart` keeps its own minimum-value floors (12/20/12/14/10/15) when
  a stat is missing — a separate, deliberate decision about the polygon's
  minimum drawable shape.
- `SVJDatePicker` / `SVJTimePicker` keep their small mono weekday/column labels:
  they are the Android native-picker replacement, their layout is pinned by
  `tests/train-picker.test.mjs` and the mono caps is a data/telemetry treatment,
  not section chrome.
- The two completion banners (`WORKOUT COMPLETE`, `STRENGTH COMPLETE`) keep their
  literal caps wording — they are celebratory moments, not section headers, and
  behavioural tests assert the exact strings.
- `NativeBannerAd` renders `null` (side-effect-only AdMob component), so it has no
  visual chrome to restyle.
