# ZENEXIS responsive UI and motion plan

## Approved direction and constraints

- Source of truth: `rebrand/new-brand-identity` after the latest release changes.
- Preserve the approved Sovereign Crimson logo geometry and startup choreography. On 27 October 2026 the user requested red: replace the former emerald accents with crimson `#C81E3A` and darker red gradient stops across web and native exports. Do not redraw or retime the animation.
- Use `ZENEXIS` and `ASCEND TO YOUR APEX` on customer-facing surfaces. Keep package IDs, URL/domain, auth redirects, database identifiers, notification channel IDs, reward-code format, and existing account records stable.
- App canvas: obsidian `#0B0B0C`; identity/action accent: crimson `#C81E3A`; earned/premium accent: gold `#D4AF37`; primary text: bone `#F4F2ED`. Logo highlights retain their approved metallic treatment with crimson gradients.
- No merge, push, release, or deployment until the user reviews the result and approves it.

## Experience to design first

The primary path is **open app → see today's challenge → train or track → see progress**. A user should understand the next action within the first viewport. The challenge screen owns the day's main action; Training and Activity show current state before historical detail; Progress closes the loop with verified outcomes. Data and reward states must remain honest when offline, loading, incomplete, or unavailable.

| Step | Main surface | Signature behavior | Success check |
| --- | --- | --- | --- |
| Open | Existing approved startup, then app shell | Preserve startup exactly; shell is ready when it ends | No blank/white frame or blocked first action |
| Decide | Today's challenge | One clear hero, task progress, one primary next action | Challenge and next action visible at 320px width |
| Act | Train or Activity | Immediate press feedback; live metrics update without count-up | Start/stop state and permissions are unambiguous |
| Reflect | Progress | Verified progress reveals once and remains readable | No invented values or motion that obscures numbers |

## System rules

1. **Hierarchy:** one hero per destination, then compact sections. Shared cards, section headers, badges, rings, buttons, and empty states should follow the same spacing and type scale.
2. **Typography:** Anton for short display headlines, Inter for reading and controls, IBM Plex Mono for numeric telemetry only. Body copy and control labels must remain legible at increased text scale.
3. **Color:** use crimson for identity and primary action/live state, gold for Plus and earned milestones, and neutral surfaces for most content. Never rely on color alone to explain status.
4. **Motion:** preserve the startup; use motion only for a meaningful state change or orientation cue. Press feedback about 120ms, state changes about 200ms, destination changes about 240ms, and progress reveals about 500ms. Use transform and opacity for moving elements; live sensor values update immediately. Limit entrance stagger to 300ms total.
5. **Reduced motion:** remove travel, scale, and stagger when `prefers-reduced-motion` is enabled. Keep state and result readable without the animation. Avoid looping attention effects.
6. **Accessibility:** semantic controls, visible focus, descriptive names, screen-reader status for important results, 44px minimum primary touch targets, and readable contrast on the dark surfaces.
7. **Performance:** keep the first actionable screen responsive while imagery loads, reserve media space to prevent layout shifts, lazy-load below-the-fold media, pause offscreen motion, and keep animation off sensor callback paths. Measure on a mid-range Android phone as well as desktop.

## Device contract

| Context | Layout and input requirements |
| --- | --- |
| Small Android/iPhone phones, 320–430px | Single column, safe-area-aware header/dock, thumb-sized actions, no horizontal document scroll, keyboard does not cover the submit action |
| Large phones and landscape, 600–844px | Content reflows rather than scaling down; compact heights preserve task and recording controls; rotation keeps current state |
| iPad/tablets, 768–1024px | Wider reading column and paired panels where useful; no stretched phone cards; touch and keyboard support |
| Responsive web, 1024–1280px and wider | Bounded content width, persistent orientation in navigation, mouse hover plus keyboard focus, no empty full-width rows |
| All native shells | Respect status bar, camera cutouts, home indicator, font scaling, permission prompts, and back behavior; retain existing Capacitor/native bridge contracts |

The existing Playwright geometry matrix covers 320, 360, 375, 390, 430, 600, 768, 1024, and 1280px portrait, plus 667×375 and 844×390 landscape in Chromium and WebKit. Add real-device checks for Android and iPhone/iPad before release because browser geometry cannot prove native safe-area, permission, or sensor behavior.

## Delivery sequence

1. **Identity and shell:** customer-facing name and copy, approved logo use, splash references, metadata, navigation, safe areas, and shared primitives. Keep technical identifiers stable.
2. **Core journey:** challenge hero and completion, Training/Activity start and live state, progress reveal, empty/loading/error/offline states, and motion reduction.
3. **Remaining destinations:** Fuel, Community, leaderboard, membership/payments, rewards, profile, records, recovery, admin/support, auth/onboarding, and public/legal pages. Reuse the system rather than inventing a separate treatment for each screen.
4. **Validation:** lint/typecheck/build; native and unit tests; responsive matrix; keyboard/screen reader review; real-device Android and iOS smoke tests; final asset hash and identifier diff audit.
5. **Review:** present screenshots/video from phone, tablet, and desktop plus a change list and test results. Merge and deployment require separate explicit approval.

## Implementation checkpoint — 20 October 2026

The isolated `codex/zenexis-ui-consistency` worktree now contains the first implementation pass. It applies the approved name and assets across the app shell, native notifications and support text, onboarding, membership and rewards, public pages, secondary destinations, and the core challenge → train/activity → progress journey. The existing logo files and `StartupAnimation.tsx` remain byte-for-byte unchanged; iOS launch assets now point to the approved emerald image.

Screenshot review also identified and corrected desktop utility-rail overlap and tablet navigation-label wrapping. The browser matrix now checks both conditions. Training instructions use athlete-facing language rather than backend terminology.

| Check | Current result |
| --- | --- |
| Production web build | Pass |
| Full unit/integration suite | 1,624 pass, 2 skipped, 0 fail |
| iOS compatibility/layout suite | 71 pass, 0 fail |
| Chromium/WebKit responsive geometry matrix | 6 pass, 0 fail |
| Responsive TypeScript project | Pass |
| Full TypeScript project | Seven `TS2367` errors in the unchanged approved startup animation |
| Changed-file lint | No errors with Windows line-ending tolerance; existing Fast Refresh warnings remain |

Before any release, review screenshots and the approved startup on a real small Android phone, a recent iPhone, and an iPad; verify native splash, safe areas, font scaling, keyboard, reduced motion, permission prompts, sensor start/stop, and app links. Native app compilation and physical-device checks need the Android SDK/macOS build environment and devices. Confirm store listing graphics and text in the publishing consoles after the code review. No merge or deployment is part of this checkpoint.

## Crimson update — 27 October 2026

The user requested a red logo after the initial emerald approval. All identity SVGs and derived web/Android/iOS icons and splash images now use crimson. Vector paths and startup timers are preserved. Redundant unreachable startup comparisons were removed without changing rendered behavior; the full TypeScript check now passes. The production build, full suite (1,624 passed, 2 skipped), iOS suite (71 passed), and changed-component lint pass.

The public URL was inspected and reported revision `6d6e57dd34a4`, predating the pushed ZENEXIS release `614cebf`. Lovable's editor confirms the newer ZENEXIS preview and unpublished changes. GitHub synchronization updates the editor; publishing to the existing URL remains a separate action requiring the user's deployment approval.

## Release acceptance

- Approved logo geometry and startup timing are preserved; Android/iOS splash references resolve to the crimson exports.
- Every customer-facing app name, icon, splash, notification, support/payment message, and public page says ZENEXIS, except existing issued codes and serial identifiers that users may need to redeem or quote.
- The core journey works with real data and truthful empty, loading, error, permission, and offline states.
- No horizontal overflow or clipped controls in the viewport matrix; touch, keyboard, screen-reader, reduced-motion, and text-scaling checks pass.
- Android and iPhone/iPad native builds preserve package IDs, auth redirects, deep links, backend connections, and current domain.
- Build/test gates are green or any inherited failures are documented with evidence; the user has approved the final branch before it is merged or deployed.
