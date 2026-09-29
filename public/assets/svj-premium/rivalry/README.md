# SVJ Rivalry Premium Asset

Drop the approved "Lock In & Outperform" hero here as `hero.webp`.

Contract:
- Path: `public/assets/svj-premium/rivalry/hero.webp`
- Served at: `/assets/svj-premium/rivalry/hero.webp`
- Format: WebP, 16:9 landscape, dark exposure (white UI text must stay readable)
- Scene: two athletes facing each other from the sides, negative space at center/top for UI
- Decorative only — rendered by `SvjRivalryHero` as `aria-hidden` background

While `hero.webp` is absent, the hero layer hides itself via `onError`
and the rivalry UI renders unchanged.
