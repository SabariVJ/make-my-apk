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

## Not yet done

- Train muscle-coverage **body-map silhouette** (Phase 5) is still the existing
  list.
- Activity **Devices** screen visual pass and the live-recorder stat-tile
  hierarchy + map "center on the user" empty state.
- Community activity-feed / member / friend cards are not yet unified into one
  card language.
