# SVJ Premium Train Hero Asset Contract

- File: `public/assets/svj-premium/train/hero.webp`
- Referenced by: `src/app/components/SvjTrainHero.tsx` (mounted in `src/app/views/WorkoutView.tsx` header area)
- Composition: athlete + barbell on the left/left-center, dark gym scene, negative space on the right for real session UI
- Presentation-only decorative layer: `aria-hidden`, `alt=""`, `pointer-events-none`, `object-cover`, `z-0`
- Responsive tiers: mobile `h-20`/`object-[22%_38%]`/opacity 40, `sm:h-28`/opacity 60, `lg:h-36`/`object-[20%_42%]`/opacity 75 for clear visibility on large monitors
- Overlays: bottom→top fade to `#0B0B0C` and left→right side fade, lightened at `sm:` so the asset stays visible on desktop
- Layering contract: hero `z-0`; Train header `relative z-10`; sticky tab strip is `sticky z-20` and clips above the hero
- Graceful fallback: `onError` hides the entire layer, leaving the Train screen unchanged if the asset is missing
