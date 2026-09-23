# SVJ UI & Motion System

## Design Principles

Every visual decision answers:
- Does this help the user understand something?
- Does this make an action clearer?
- Does this communicate state?

If not, remove it. Animation is **feedback**, not decoration.

**Target feeling:** premium, athletic, dark, focused, high-performance, precise.

---

## Color Tokens

| Token | Hex | Usage |
|---|---|---|
| `svj-bg` | `#0b0b0c` | Page background |
| `svj-surface` | `#17171a` | Card/panel surface |
| `svj-surface-raised` | `#1e1e22` | Elevated panels |
| `svj-crimson` | `#c81e3a` | Primary accent (active, CTA, progress) |
| `svj-crimson-hover` | `#a0182e` | Pressed crimson |
| `svj-text` | `#f4f2ed` | Primary text |
| `svj-secondary` | `#8c8c90` | Secondary/muted text |
| `svj-muted` | `#5c5c60` | Disabled/placeholder |
| `svj-gold` | `#d4af37` | Premium/Plus accent (used sparingly) |

**Usage rules:**
- Crimson = active nav, important CTA, live recording, critical metric
- Crimson borders used at ≤15% opacity — never full red borders on every card
- Gold = Plus/Founder only
- Surface layers: `bg-[#0b0b0c]` (inset) → `bg-[#17171a]` (surface) → `bg-[#1e1e22]` (raised)

---

## Typography Hierarchy

| Level | Font | Size | Weight | Usage |
|---|---|---|---|---|
| Page title | Anton | 24-32px | 400 | Screen headings |
| Major metric | Mono | 28-42px | 700 | HR, XP, steps, calories |
| Section heading | Anton | 14px | 400 | "STEP XP", "CHARACTER MATRIX" |
| Body | Inter | 13-14px | 400-500 | Descriptions, labels |
| Label | Inter | 11px | 500 | "XP Today", "Completed", category |
| Metadata | Inter | 10-11px | 400-500 | Timestamps, secondary info |

**Monospace (IBM Plex Mono) reserved for:**
- Numeric readouts (XP, HR, steps, calories, timer, pace)
- GPS coordinates
- Technical/debug status

**Everything else uses Inter.** No monospace for section titles, card descriptions, or button labels.

---

## Spacing

Standard scale: 4, 8, 12, 16, 20, 24, 32

- Card padding: p-4 to p-5 (16-20px)
- Gap between cards: space-y-5 (20px)
- Inline gap: gap-2 to gap-3 (8-12px)
- Compact gap: gap-1.5 to gap-2 (6-8px)

---

## Card Hierarchy

| Level | Class | Usage |
|---|---|---|
| Surface | `svj-card-clean` | Standard cards |
| Crimson | `svj-card-crimson` | Program cards (Earn Plus, 60-Day, Strength) |
| Gold | `svj-card-gold` | Premium/Plus cards |
| Inset | `svj-stat` | Stats, data rows, small modules |

Cards use `rounded-2xl`, `border border-white/[0.06]`, and subtle gradients for accent cards.

**Removed:** heavy `shadow-2xl`, `blur-3xl` decorative glows, full-opacity red borders.

---

## Motion Tokens

| Name | Duration | Easing | Usage |
|---|---|---|---|
| Fast | 120ms | ease-out | Press feedback, icon scale |
| Normal | 200ms | ease-out | State changes, color transitions |
| Page | 240ms | ease-out | View/page transitions |
| Progress | 500-600ms | ease-out | Progress bars, metric growth |
| Stagger | 40ms/item (max 300ms) | ease-out | List item entrance |

**All animations use transform + opacity only.** No layout thrashing, no box-shadow animation, no blur filters in motion.

---

## Interactive States

### Buttons
- Rest: default state
- Hover: subtle brightness/opacity change
- Press: `scale(0.98)` via `.svj-press` — 120ms
- Disabled: `opacity: 0.4`

### Cards (clickable)
- Hover: border brightness increase
- Press: `scale(0.98)` — 120ms
- Non-interactive cards: no hover/press

### Navigation
- Active tab: crimson background pill + crimson icon
- Inactive: grey icon + label
- Transition: 150ms color change

---

## Reduced Motion

`prefers-reduced-motion: reduce` strips all animation durations to 1ms.
State changes (colors, opacity) still occur — only movement is removed.

---

## Performance Rules

- No animated box-shadows
- No animated backdrop-filter
- No large animated gradients
- No DOM manipulation per sensor callback
- Live HR: instant number swap, no count-up animation
- XP award: simple `+40 XP` fade-in, no confetti
- Progress bars: width transition only

---

## Files

- `src/styles.css` — tokens, utilities, reduced-motion
- `src/app/lib/motion.ts` — timing presets, fade-in variants
- `src/app/components/ui-primitives/` — shared card, badge, progress, section header, empty state
