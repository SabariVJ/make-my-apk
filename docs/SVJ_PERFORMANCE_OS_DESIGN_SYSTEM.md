# SVJ PERFORMANCE OS — Design System Foundation

**Branch:** `arena/01a0d332-make-my-apk` · **Date:** 2026-09-24 · **Scope:** shared visual foundation only (no screen redesigns)

This document is the single reference for the SVJ Performance OS visual layer:
the audit that motivated it, the token system, the primitive kit, and the
plans for graphics, motion and responsive behavior that later screen work will
follow.

---

## 1. Audit — what exists today

**Stack:** TanStack Start (React 19, SSR) + Tailwind CSS v4 + Capacitor 8
(`app.lovable.svj`). Dark-only product. App shell in `src/app/App.tsx`
(`max-w-4xl` / `lg:max-w-5xl`), five primary destinations in a bottom dock
(`Navigation.tsx`), secondary destinations in a utility rail/drawer.

**Identity that works and stays:**

- Obsidian `#0B0B0C` / surface `#17171A` / raised `#1E1E22` near-black hierarchy.
- Crimson `#C81E3A` as the single brand signal; gold `#D4AF37` reserved for Plus/Founder.
- Anton (uppercase display) + Inter (body) + IBM Plex Mono (numeric readouts).
- Character Matrix hex radar with six attribute colors.
- Restrained motion doctrine (`docs/SVJ_UI_MOTION_SYSTEM.md`, `src/app/lib/motion.ts`).
- `StatusScreen` for full-screen error/404 states.
- `.svj-press` tactile feedback; global `prefers-reduced-motion` kill-switch.

**Problems found:**

| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Token bypass at scale** — tokens exist but are ignored | ~2,400 raw hex literals across 76 TSX files (`#8C8C90` ×864, `#C81E3A` ×666, `#17171A` ×212) |
| 2 | **Character Matrix colors not systemized** | Hardcoded in `HexagonRadarChart.tsx` only, with emoji icons (💪👑📖🧠👥⚔️); never reused as the data palette |
| 3 | **Duplicated hand-rolled primitives** | `ScoreRing` rebuilt in `TrainRecovery.tsx`; three parallel card systems (`svj-card-*` CSS, `SVJCard`, raw Tailwind); status chips, meters and empty states re-implemented per screen |
| 4 | **Radius drift** | `rounded-2xl` ×387, `rounded-full` ×211, `rounded-lg` ×202, `rounded-xl` ×139 with no shared rule |
| 5 | **Missing primitives** | No shared MetricCard / StatDelta / StatusPill / ListRow / ErrorState / Skeleton / TimelineStep / ResponsiveDialog / BottomSheet — every screen hand-rolls them |
| 6 | **Overlay risk** | shadcn `dialog`/`drawer` wrappers use generic tokens; ad-hoc modals elsewhere can surface light/white dialogs |
| 7 | **Tablet support effectively absent** | Only 83 `sm:` / 9 `lg:` / 4 `md:` usages app-wide; single column stretches on 600–800px+ devices |
| 8 | **Token inconsistencies** | `--chart-1..5` differed between `:root` (oklch light values) and `.dark`; gold defined twice (`--color-gold`, `--color-svj-gold`) |
| 9 | **No elevation or safe-area tokens** | Depth expressed ad hoc; bottom dock/sheets lack `env(safe-area-inset-bottom)` clearance |

No native/feature logic was touched: permission onboarding, notifications,
activity sensors, Health Connect, Bluetooth/Nearby, GPS, the train date
picker, leaderboard nav, Recovery V2, workout/XP/membership logic,
Supabase/RLS, 60-Day and rivalries are all unchanged.

---

## 2. Concept — one OS, eight domains

SVJ is one operating system for **Body · Training · Recovery · Nutrition ·
Discipline · Progression · Competition · Identity**. Every screen is a view
into the same OS: same surfaces, same type ramp, same data colors, same
motion grammar. Crimson is the brand signal; the six Character Matrix
attributes are the data palette.

---

## 3. Color

### Brand (unchanged values, now enforced through tokens)

| Token | Value | Use |
|---|---|---|
| `svj-bg` | `#0B0B0C` | Page background |
| `svj-surface` | `#17171A` | Standard panel |
| `svj-surface-raised` | `#1E1E22` | Elevated panel |
| `svj-overlay` | `#212126` | Hover/pressed panel |
| `svj-crimson` / `svj-crimson-hover` | `#C81E3A` / `#A0182E` | Active state, CTA, live, progress |
| `svj-gold` | `#D4AF37` | Plus/Founder only |
| `svj-text` / `svj-secondary` / `svj-muted` | `#F4F2ED` / `#8C8C90` / `#5C5C60` | Text ramp |

Hairlines: `white/4%` (inset) · `white/6%` (surface) · `white/8%` (raised).
Crimson borders at ≤15% opacity. No glassmorphism, no gradients except the
existing accent-card tints, no glow outside XP level-up moments.

### Character Matrix attribute colors (secondary data palette)

| Token | Value | OS domain |
|---|---|---|
| `attr-physical` | `#10B981` | Body / Activity |
| `attr-discipline` | `#F43F5E` | Training / Discipline |
| `attr-mental` | `#EAB308` | Recovery / Mind |
| `attr-intellect` | `#F59E0B` | Nutrition / Fuel |
| `attr-ambition` | `#A855F7` | Progression / XP |
| `attr-social` | `#3B82F6` | Competition / Community |

Values are the radar chart's original identity — preserved exactly, promoted
to CSS custom properties (`bg-attr-physical`, `text-attr-social`, …) and to
`ATTRIBUTE_COLORS` in `src/app/lib/designTokens.ts` for SVG/canvas work.

### Status / telemetry colors

| Token | Value | Meaning |
|---|---|---|
| `state-positive` | `#34D399` | Ready / improving |
| `state-warning` | `#EAB308` | Moderate / watch |
| `state-caution` | `#FB923C` | Strained |
| `state-critical` | `#F87171` | Low readiness / failure |
| `state-info` | `#60A5FA` | Neutral informational |

These match the recovery readiness bands already shipped, so nothing
re-learns a color.

---

## 4. Typography

| Level | Font | Size | Usage |
|---|---|---|---|
| Page title | Anton, uppercase, `tracking-wider` | 24–32px | Screen headings |
| Hero display | Anton | 28–36px | `SVJHeroCard` title |
| Major metric | IBM Plex Mono, 600, `tabular-nums` | 26–42px | HR, XP, steps, pace, readiness |
| Section heading | Anton | 14px | `SVJSectionHeader` |
| Body | Inter | 13–14px | Descriptions |
| Label | Inter, 11px, caps, `0.12em` tracking | 11px | Card labels, eyebrows |
| Metadata | Inter | 10–11px | Timestamps, sources |

Mono is reserved for numeric readouts and technical status. Everything else
is Inter. No emoji in data UI; attribute icons move to Lucide glyphs in
screen-level work (phase 2).

---

## 5. Spacing, radius, elevation

**Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32. Card padding `p-4`–`p-5`,
screen gutter `px-4 sm:px-6`, card gap `space-y-4/5`, inline gaps `gap-2/3`.
Touch targets ≥44px (`SVJListRow` enforces `min-h-12`).

**Radius scale (fewer, deliberate):**

| Token | Value | Use |
|---|---|---|
| chip | 6px (`rounded-md`) | Status pills, badges |
| control | 10px (`rounded-lg`) | Buttons, inputs, icon tiles |
| module | 12px (`rounded-xl`) | Inner modules, skeletons |
| card | 16px (`rounded-2xl`) | All cards/surfaces |

`rounded-full` is reserved for avatars, dots and rings only.

**Elevation:** depth comes from surface step + hairline border first;
`shadow-svj-1/2/3` (soft, black-only, no glow) for floating layers (sheets,
dialogs, dock). New `--ease-svj: cubic-bezier(0.22, 1, 0.36, 1)` is the house
curve for CSS transitions.

---

## 6. Motion tokens

| Token | Value | Usage |
|---|---|---|
| fast | 120ms | Press feedback, color swap |
| base | 200ms | State changes, tab content |
| page | 240ms | View transitions |
| progress | 500ms | Rings, meters, value growth |
| stagger | 40ms/item, max 300ms | List entrances |

Animate only: state transitions, tab changes, progress changes, dialog/sheet
entry, XP gain, level-up. Transform + opacity only. `prefers-reduced-motion`
strips everything (existing global CSS rule); JS-driven animations in new
primitives additionally check `useReducedMotion`.

---

## 7. Primitive kit (`src/app/components/ui-primitives/`)

Import from the barrel: `import { SVJMetricCard } from "@/app/components/ui-primitives"`.

**New in this foundation:**

| Primitive | Purpose |
|---|---|
| `SVJSurface` | Level-correct panel (base/surface/raised/overlay), optional interactive |
| `SVJHeroCard` | One-per-screen opener: eyebrow, Anton title, graphic slot, action slot |
| `SVJMetricCard` | Label + mono value + unit + delta + footer (sparkline/meter) |
| `SVJInsightCard` | Icon-railed interpretation card with tone system |
| `SVJActionCard` | Real-button tappable card with chevron affordance |
| `SVJListRow` | Standard 48px row: leading / title / subtitle / trailing / divider |
| `SVJScoreRing` | Animated SVG gauge (readiness, recovery, OVR), a11y progressbar |
| `SVJProgressMeter` | Labeled linear meter, token tones, width-only animation |
| `SVJStatDelta` | ▲/▼/— change chip with `invert` for lower-is-better metrics |
| `SVJStatusPill` | rounded-md status chip, dot/pulse for live states |
| `SVJAvatar` | Initials fallback, crimson/gold level ring, badge slot |
| `SVJErrorState` | Inline failure surface with retry slot (`role="alert"`) |
| `SVJSkeleton` + Text/Card/Grid | Shimmer placeholders (static under reduced motion) |
| `SVJResponsiveDialog` | Phone → bottom sheet, ≥768px → centered dark dialog, one API |
| `SVJBottomSheet` | vaul sheet: dark surface, grab handle, 85dvh cap, safe-area footer |
| `SVJTimelineStep` | done/active/upcoming timeline node (60-Day, weeks, milestones) |

**Kept unchanged:** `SVJCard`, `SVJBadge`, `SVJSectionHeader`, `SVJProgress`,
`SVJEmptyState`, `SVJDatePicker`, `SVJTimePicker`, `SVJSelect` (existing
screens keep working while migration proceeds).

Support: `src/app/hooks/useMediaQuery.ts` (SSR-safe) and
`src/app/lib/designTokens.ts` (JS mirror of all tokens for SVG work).

---

## 8. Graphics plan (phase 2 — screens)

1. **Character Matrix** — keep hex/radar identity; replace emoji icons with
   Lucide glyphs; labels move outside the hex; progression overlay (previous
   period vs current) and `SVJScoreRing`-style value-change animation; colors
   read from `ATTRIBUTE_COLORS`.
2. **Train muscle map** — front/back body SVG; target muscles in attribute
   color, recently-trained dimmed by recovery state (load from existing
   training history — no new data sources).
3. **Recovery visualization** — `SVJScoreRing` readiness gauge using
   `readinessColor()`, weekly state strip, sleep window meter.
4. **Activity** — integrated map with telemetry rows built from
   `SVJMetricCard`; live values swap instantly (no count-up, per motion doc).
5. **60-Day** — premium timeline from `SVJTimelineStep`; milestones +
   attribute growth sparklines.
6. **XP / Level** — one signature level-up moment inside `LevelUpModal`
   (gold ring sweep + value roll, reduced-motion fallback to static).

---

## 9. Responsive plan

Targets: **360 / 390 / 412 / 600 / 768 / 800+**.

- Base styles are the 360–412px design; new `xs:` breakpoint (`26rem`) for
  large-phone refinements; `sm`/`md`/`lg` defaults unchanged so existing
  screens keep their current behavior.
- Tablet (≥600px): metric grids go 2→3 columns via primitives; screen content
  stays capped (`max-w-4xl/5xl`) — no stretched hero cards; grids use fixed
  `max-w` columns instead of fluid stretch.
- Overlays: sheets below 768px, dialogs at/above (`SVJResponsiveDialog`).
- Android: `svj-safe-bottom` on every fixed-bottom surface; no hover-only
  affordances; 48px touch rows.
- No horizontal overflow: `overflow-x-hidden` shell retained; wide tables get
  horizontal scroll containers inside their card, never the page.

---

## 10. Screen personalities (phase 2 brief)

| Screen | Personality | Primary primitives |
|---|---|---|
| Challenges | energetic / mission-driven | HeroCard, ActionCard, ProgressMeter |
| Activity | live performance telemetry | MetricCard grid, StatusPill(live), map |
| Train | focused / powerful | HeroCard, muscle map, ListRow |
| Recovery | calm / analytical | ScoreRing, InsightCard, TimelineStep |
| Fuel | clean / nutritional | MetricCard, ProgressMeter, ListRow |
| Community | social / competitive | Avatar, ListRow, StatusPill |
| 60-Day | transformational | TimelineStep, ProgressMeter, HeroCard |
| Profile | identity / prestige | Avatar(ring), Badge, MetricCard |
| Plus | premium / restrained | gold-tone HeroCard, ActionCard |

---

## 11. Adoption rules

1. New screens/features import only from the primitive barrel.
2. Existing screens migrate opportunistically when touched — no churn-only
   edits. Hardcoded hexes are replaced by tokens as files are visited.
3. Any new modal must be `SVJResponsiveDialog` / `SVJBottomSheet` (kills the
   white-native-dialog class of bugs).
4. Data colors come from `ATTRIBUTE_COLORS` / `STATUS_COLORS` — never ad hoc.
5. `tests/design-system.test.mjs` guards the foundation in CI.

---

## 12. Files changed in this foundation pass

- `src/styles.css` — token v2 block (breakpoint, attribute + state colors,
  elevation, easing, shimmer), chart-token `:root`/`.dark` alignment,
  `svj-safe-bottom` + skeleton utilities. *(Everything else untouched.)*
- `src/app/lib/designTokens.ts` — **new** JS token mirror.
- `src/app/hooks/useMediaQuery.ts` — **new** SSR-safe media query hook.
- `src/app/components/ui-primitives/` — **16 new files**: `SVJSurface`,
  `SVJHeroCard`, `SVJMetricCard`, `SVJInsightCard`, `SVJActionCard`,
  `SVJListRow`, `SVJScoreRing`, `SVJProgressMeter`, `SVJStatDelta`,
  `SVJStatusPill`, `SVJAvatar`, `SVJErrorState`, `SVJSkeleton`,
  `SVJBottomSheet`, `SVJResponsiveDialog`, `SVJTimelineStep`, plus `index.ts`
  barrel.
- `tests/design-system.test.mjs` — **new** foundation regression tests.
- `package.json` — registered the new test in the `test` script.
