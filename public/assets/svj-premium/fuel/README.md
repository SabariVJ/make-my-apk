# SVJ Premium Fuel Hero Asset Contract

- File: `public/assets/svj-premium/fuel/hero.webp`
- Referenced by: `src/app/components/SvjFuelHero.tsx` (mounted in `src/app/views/NutritionView.tsx` header area)
- Composition: plated chicken/rice/greens plate on the left/left-center, negative space on the right, dark slate table, red napkin/glass accents
- Presentation-only decorative layer: `aria-hidden`, `alt=""`, `pointer-events-none`, `object-cover`
- Responsive tiers: mobile `h-24`/`object-[28%_45%]`/opacity 40, `sm:h-36`/opacity 60, `lg:h-48`/`object-[25%_40%]`/opacity 75 for clear visibility on large monitors
- Overlays: bottom→top fade to `#0B0B0C` and left→right side fade, lightened at `sm:` so the asset stays visible on desktop
- Graceful fallback: `onError` hides the entire layer, leaving the Fuel screen unchanged if the asset is missing
