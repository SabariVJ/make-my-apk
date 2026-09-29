# SVJ Transformation Premium Asset

Drop the approved transformation-complete hero here as `hero.webp`.

Contract:
- Path: `public/assets/svj-premium/transformation/hero.webp`
- Served at: `/assets/svj-premium/transformation/hero.webp`
- Format: WebP, dark exposure (white/gold UI text must stay readable)
- Scene: post-workout exhaustion / quiet relief, no superhuman presentation
- Decorative only — rendered by `SvjTransformationHero` as `aria-hidden`

While `hero.webp` is absent, the hero layer hides itself via `onError`
and the completion card renders unchanged.
