import fs from "fs";
import path from "path";
import sharp from "sharp";

const BRAND_DIR = path.resolve("public/brand");
if (!fs.existsSync(BRAND_DIR)) {
  fs.mkdirSync(BRAND_DIR, { recursive: true });
}

// 1. Standalone Symbol SVG (512x512)
const symbolSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <!-- Gradients for Upper Chevron -->
    <linearGradient id="upLeftGrad" x1="122" y1="100" x2="256" y2="242" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="35%" stop-color="#E2E8F0" />
      <stop offset="70%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#A0182E" />
    </linearGradient>
    <linearGradient id="upRightGrad" x1="390" y1="100" x2="256" y2="242" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="50%" stop-color="#A0182E" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>

    <!-- Gradients for Lower Chevron -->
    <linearGradient id="downLeftGrad" x1="122" y1="204" x2="256" y2="346" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F1F5F9" />
      <stop offset="40%" stop-color="#CBD5E1" />
      <stop offset="80%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>
    <linearGradient id="downRightGrad" x1="390" y1="204" x2="256" y2="346" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="50%" stop-color="#7F1325" />
      <stop offset="100%" stop-color="#560D19" />
    </linearGradient>

    <!-- Core Glow Filter -->
    <filter id="apexGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Ambient Underglow -->
  <g opacity="0.45" filter="url(#apexGlow)">
    <path d="M 256 120 L 375 215 L 340 242 L 256 178 L 172 242 L 137 215 Z" fill="#C81E3A" />
    <path d="M 256 220 L 375 315 L 340 342 L 256 278 L 172 342 L 137 315 Z" fill="#C81E3A" />
  </g>

  <!-- UPPER CHEVRON -->
  <!-- Left Facet -->
  <path d="M 256 100 L 122 210 L 162 242 L 256 166 Z" fill="url(#upLeftGrad)" />
  <!-- Right Facet -->
  <path d="M 256 100 L 390 210 L 350 242 L 256 166 Z" fill="url(#upRightGrad)" />
  <!-- Apex Specular Highlight Ridge -->
  <path d="M 256 100 L 256 166" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.8" />
  <!-- Left Outer Rim Highlight -->
  <path d="M 256 100 L 122 210" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" opacity="0.9" />

  <!-- LOWER CHEVRON -->
  <!-- Left Facet -->
  <path d="M 256 204 L 122 314 L 162 346 L 256 270 Z" fill="url(#downLeftGrad)" />
  <!-- Right Facet -->
  <path d="M 256 204 L 390 314 L 350 346 L 256 270 Z" fill="url(#downRightGrad)" />
  <!-- Center Ridge -->
  <path d="M 256 204 L 256 270" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.7" />
  <!-- Left Outer Rim Highlight -->
  <path d="M 256 204 L 122 314" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
</svg>`;

// 2. Standalone Monochrome Symbol (Pure White on Transparent)
const symbolMonochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- UPPER CHEVRON -->
  <path d="M 256 100 L 122 210 L 162 242 L 256 166 Z" fill="#FFFFFF" />
  <path d="M 256 100 L 390 210 L 350 242 L 256 166 Z" fill="#E2E8F0" />
  <!-- LOWER CHEVRON -->
  <path d="M 256 204 L 122 314 L 162 346 L 256 270 Z" fill="#FFFFFF" />
  <path d="M 256 204 L 390 314 L 350 346 L 256 270 Z" fill="#E2E8F0" />
</svg>`;

// 3. App Icon SVG (512x512 with Squircle, Dark Gradient, Chamfered Bevel & Centered Logo)
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="iconBg" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#181A20" />
      <stop offset="65%" stop-color="#0B0C0E" />
      <stop offset="100%" stop-color="#060708" />
    </radialGradient>
    
    <!-- Outer Rim Stroke Gradient -->
    <linearGradient id="rimStroke" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" stop-opacity="0.35" />
      <stop offset="35%" stop-color="#C81E3A" stop-opacity="0.6" />
      <stop offset="70%" stop-color="#FFFFFF" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#C81E3A" stop-opacity="0.2" />
    </linearGradient>

    <!-- Radial Crimson Halo -->
    <radialGradient id="crimsonHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#C81E3A" stop-opacity="0.28" />
      <stop offset="50%" stop-color="#C81E3A" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#C81E3A" stop-opacity="0" />
    </radialGradient>

    <!-- Logo Gradients -->
    <linearGradient id="icUpLeft" x1="140" y1="120" x2="256" y2="242" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="40%" stop-color="#E2E8F0" />
      <stop offset="80%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#A0182E" />
    </linearGradient>
    <linearGradient id="icUpRight" x1="372" y1="120" x2="256" y2="242" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="55%" stop-color="#A0182E" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>
    <linearGradient id="icDownLeft" x1="140" y1="214" x2="256" y2="336" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F8FAFC" />
      <stop offset="45%" stop-color="#CBD5E1" />
      <stop offset="85%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>
    <linearGradient id="icDownRight" x1="372" y1="214" x2="256" y2="336" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="55%" stop-color="#7F1325" />
      <stop offset="100%" stop-color="#560D19" />
    </linearGradient>
    
    <filter id="iconShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.75" />
      <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#C81E3A" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- Squircle Base (Apple/Android continuous curve) -->
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#iconBg)" />
  <rect x="16" y="16" width="480" height="480" rx="108" stroke="url(#rimStroke)" stroke-width="2" />
  
  <!-- Subtle Internal Grid Matrix Accent -->
  <circle cx="256" cy="256" r="160" fill="url(#crimsonHalo)" />

  <!-- Centered Symbol Group with Shadow -->
  <g filter="url(#iconShadow)">
    <!-- UPPER CHEVRON -->
    <path d="M 256 128 L 138 226 L 174 254 L 256 186 Z" fill="url(#icUpLeft)" />
    <path d="M 256 128 L 374 226 L 338 254 L 256 186 Z" fill="url(#icUpRight)" />
    <path d="M 256 128 L 256 186" stroke="#FFFFFF" stroke-width="2" opacity="0.8" />
    <path d="M 256 128 L 138 226" stroke="#FFFFFF" stroke-width="1.6" opacity="0.9" />

    <!-- LOWER CHEVRON -->
    <path d="M 256 220 L 138 318 L 174 346 L 256 278 Z" fill="url(#icDownLeft)" />
    <path d="M 256 220 L 374 318 L 338 346 L 256 278 Z" fill="url(#icDownRight)" />
    <path d="M 256 220 L 256 278" stroke="#FFFFFF" stroke-width="2" opacity="0.7" />
    <path d="M 256 220 L 138 318" stroke="#FFFFFF" stroke-width="1.6" opacity="0.85" />
  </g>
</svg>`;

// 4. Primary Horizontal Brand Logo (Symbol + Typography Wordmark)
const logoPrimarySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 280" fill="none">
  <defs>
    <linearGradient id="logoUpLeft" x1="50" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="40%" stop-color="#E2E8F0" />
      <stop offset="80%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#A0182E" />
    </linearGradient>
    <linearGradient id="logoUpRight" x1="270" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="60%" stop-color="#A0182E" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>
    <linearGradient id="logoDownLeft" x1="50" y1="120" x2="160" y2="240" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F8FAFC" />
      <stop offset="45%" stop-color="#CBD5E1" />
      <stop offset="85%" stop-color="#C81E3A" />
      <stop offset="100%" stop-color="#7F1325" />
    </linearGradient>
    <linearGradient id="logoDownRight" x1="270" y1="120" x2="160" y2="240" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C81E3A" />
      <stop offset="60%" stop-color="#7F1325" />
      <stop offset="100%" stop-color="#560D19" />
    </linearGradient>
    <linearGradient id="textGrad" x1="320" y1="80" x2="900" y2="180" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="70%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>
  </defs>

  <!-- Left Symbol (Scale to fit height 200px) -->
  <g transform="translate(20, 20) scale(0.68)">
    <!-- UPPER CHEVRON -->
    <path d="M 160 30 L 40 130 L 75 158 L 160 90 Z" fill="url(#logoUpLeft)" />
    <path d="M 160 30 L 280 130 L 245 158 L 160 90 Z" fill="url(#logoUpRight)" />
    <path d="M 160 30 L 160 90" stroke="#FFFFFF" stroke-width="2.5" opacity="0.8" />
    <!-- LOWER CHEVRON -->
    <path d="M 160 120 L 40 220 L 75 248 L 160 180 Z" fill="url(#logoDownLeft)" />
    <path d="M 160 120 L 280 220 L 245 248 L 160 180 Z" fill="url(#logoDownRight)" />
    <path d="M 160 120 L 160 180" stroke="#FFFFFF" stroke-width="2.5" opacity="0.7" />
  </g>

  <!-- Wordmark "ZENEXIS" -->
  <g fill="url(#textGrad)">
    <!-- Z -->
    <path d="M 270 95 L 340 95 L 340 114 L 298 165 L 342 165 L 342 185 L 268 185 L 268 166 L 310 115 L 270 115 Z" />
    <!-- E -->
    <path d="M 364 95 L 424 95 L 424 114 L 388 114 L 388 130 L 418 130 L 418 149 L 388 149 L 388 166 L 425 166 L 425 185 L 364 185 Z" />
    <!-- N -->
    <path d="M 448 95 L 471 95 L 507 151 L 507 95 L 530 95 L 530 185 L 507 185 L 471 129 L 471 185 L 448 185 Z" />
    <!-- E -->
    <path d="M 554 95 L 614 95 L 614 114 L 578 114 L 578 130 L 608 130 L 608 149 L 578 149 L 578 166 L 615 166 L 615 185 L 554 185 Z" />
    <!-- X -->
    <path d="M 636 95 L 661 95 L 685 136 L 709 95 L 734 95 L 698 140 L 736 185 L 710 185 L 685 145 L 660 185 L 634 185 L 672 140 Z" />
    <!-- I -->
    <path d="M 756 95 L 779 95 L 779 185 L 756 185 Z" />
    <!-- S -->
    <path d="M 802 165 L 823 162 C 825 170 831 173 840 173 C 849 173 855 169 855 163 C 855 158 850 155 838 152 C 816 146 805 139 805 125 C 805 107 820 95 842 95 C 864 95 878 107 880 124 L 858 126 C 856 118 851 113 842 113 C 834 113 828 117 828 122 C 828 128 834 130 846 133 C 868 139 879 146 879 161 C 879 179 864 191 840 191 C 817 191 804 179 802 165 Z" />
  </g>

  <!-- Tagline "ASCEND TO YOUR APEX" -->
  <text x="272" y="222" font-family="'Inter', sans-serif" font-size="16" font-weight="600" letter-spacing="6" fill="#C81E3A" opacity="0.95">ASCEND TO YOUR APEX</text>
</svg>`;

// 5. Light Background Variant Logo
const logoLightSvg = logoPrimarySvg
  .replace('fill="url(#textGrad)"', 'fill="#0B0C0E"')
  .replace('fill="#C81E3A"', 'fill="#A0182E"');

// 6. Monochrome All-White Logo
const logoMonochromeSvg = logoPrimarySvg
  .replace(/url\(#logoUpLeft\)/g, "#FFFFFF")
  .replace(/url\(#logoUpRight\)/g, "#E2E8F0")
  .replace(/url\(#logoDownLeft\)/g, "#FFFFFF")
  .replace(/url\(#logoDownRight\)/g, "#E2E8F0")
  .replace('fill="url(#textGrad)"', 'fill="#FFFFFF"')
  .replace('fill="#C81E3A"', 'fill="#FFFFFF"');

// 7. Standalone Wordmark SVG
const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 140" fill="none">
  <g fill="#FFFFFF">
    <!-- Z -->
    <path d="M 10 25 L 80 25 L 80 44 L 38 95 L 82 95 L 82 115 L 8 115 L 8 96 L 50 45 L 10 45 Z" />
    <!-- E -->
    <path d="M 104 25 L 164 25 L 164 44 L 128 44 L 128 60 L 158 60 L 158 79 L 128 79 L 128 96 L 165 96 L 165 115 L 104 115 Z" />
    <!-- N -->
    <path d="M 188 25 L 211 25 L 247 81 L 247 25 L 270 25 L 270 115 L 247 115 L 211 59 L 211 115 L 188 115 Z" />
    <!-- E -->
    <path d="M 294 25 L 354 25 L 354 44 L 318 44 L 318 60 L 348 60 L 348 79 L 318 79 L 318 96 L 355 96 L 355 115 L 294 115 Z" />
    <!-- X -->
    <path d="M 376 25 L 401 25 L 425 66 L 449 25 L 474 25 L 438 70 L 476 115 L 450 115 L 425 75 L 400 115 L 374 115 L 412 70 Z" />
    <!-- I -->
    <path d="M 496 25 L 519 25 L 519 115 L 496 115 Z" />
    <!-- S -->
    <path d="M 542 95 L 563 92 C 565 100 571 103 580 103 C 589 103 595 99 595 93 C 595 88 590 85 578 82 C 556 76 545 69 545 55 C 545 37 560 25 582 25 C 604 25 618 37 620 54 L 598 56 C 596 48 591 43 582 43 C 574 43 568 47 568 52 C 568 58 574 60 586 63 C 608 69 619 76 619 91 C 619 109 604 121 580 121 C 557 121 544 109 542 95 Z" />
  </g>
</svg>`;

// Write all SVGs
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-symbol.svg"), symbolSvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-symbol-monochrome.svg"), symbolMonochromeSvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-app-icon.svg"), appIconSvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-logo-primary.svg"), logoPrimarySvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-logo-light.svg"), logoLightSvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-logo-monochrome.svg"), logoMonochromeSvg);
fs.writeFileSync(path.join(BRAND_DIR, "zenexis-wordmark.svg"), wordmarkSvg);

// Overwrite public/favicon.svg
fs.writeFileSync(path.resolve("public/favicon.svg"), symbolSvg);

console.log("Vector SVGs successfully generated in public/brand/");

// 8. Generate High-Res PNG exports via sharp
async function generatePngExports() {
  const iconBuffer = Buffer.from(appIconSvg);
  const symbolBuffer = Buffer.from(symbolSvg);
  const logoBuffer = Buffer.from(logoPrimarySvg);

  // 1024x1024 Master iOS App Store Icon
  await sharp(iconBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(BRAND_DIR, "zenexis-app-icon-1024.png"));

  // 512x512 Google Play & Web PWA Icons
  await sharp(iconBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(BRAND_DIR, "zenexis-app-icon-512.png"));
  await sharp(iconBuffer).resize(512, 512).png().toFile(path.resolve("public/icon-512.png"));
  await sharp(iconBuffer).resize(192, 192).png().toFile(path.resolve("public/icon-192.png"));
  await sharp(iconBuffer).resize(64, 64).png().toFile(path.resolve("public/favicon.png"));

  // High-Res Primary Logos
  await sharp(logoBuffer)
    .resize(1920, 560)
    .png()
    .toFile(path.join(BRAND_DIR, "zenexis-logo-primary-2x.png"));
  await sharp(symbolBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(BRAND_DIR, "zenexis-symbol-1024.png"));

  // Android Adaptive Launcher Assets
  // Foreground: 432x432 (safe zone is center 66% = 288px)
  const androidForegroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 432" fill="none">
    <g transform="translate(68, 68) scale(0.58)">
      ${symbolSvg.replace(/<svg[^>]*>/, "").replace("</svg>", "")}
    </g>
  </svg>`;
  fs.writeFileSync(path.join(BRAND_DIR, "ic_launcher_foreground.svg"), androidForegroundSvg);

  const fgBuffer = Buffer.from(androidForegroundSvg);
  const mipmaps = [
    { dir: "mipmap-mdpi", size: 108 },
    { dir: "mipmap-hdpi", size: 162 },
    { dir: "mipmap-xhdpi", size: 216 },
    { dir: "mipmap-xxhdpi", size: 324 },
    { dir: "mipmap-xxxhdpi", size: 432 },
  ];

  for (const m of mipmaps) {
    const targetDir = path.resolve("android/app/src/main/res", m.dir);
    if (fs.existsSync(targetDir)) {
      await sharp(fgBuffer)
        .resize(m.size, m.size)
        .png()
        .toFile(path.join(targetDir, "ic_launcher_foreground.png"));
      // Legacy square icon & round icon
      await sharp(iconBuffer)
        .resize((m.size / 432) * 192, (m.size / 432) * 192)
        .png()
        .toFile(path.join(targetDir, "ic_launcher.png"));
      await sharp(iconBuffer)
        .resize((m.size / 432) * 192, (m.size / 432) * 192)
        .png()
        .toFile(path.join(targetDir, "ic_launcher_round.png"));
    }
  }

  // Play Store 512x512 Master Android Icon
  await sharp(iconBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve("android/app/src/main/ic_launcher-playstore.png"));

  // Android Splash Screen (centered symbol on obsidian background)
  const splashBuffer = await sharp(symbolBuffer)
    .resize(360, 360)
    .extend({
      top: 480,
      bottom: 480,
      left: 360,
      right: 360,
      background: { r: 11, g: 12, b: 14, alpha: 1 },
    })
    .png()
    .toFile(path.resolve("android/app/src/main/res/drawable/splash.png"));

  // iOS App Icon Assets (Assets.xcassets/AppIcon.appiconset)
  const iosIconDir = path.resolve("ios/App/App/Assets.xcassets/AppIcon.appiconset");
  if (fs.existsSync(iosIconDir)) {
    await sharp(iconBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(iosIconDir, "AppIcon-512@2x.png"));
  }

  // iOS Launch Screen Splash Image (Assets.xcassets/Splash.imageset)
  const iosSplashDir = path.resolve("ios/App/App/Assets.xcassets/Splash.imageset");
  if (fs.existsSync(iosSplashDir)) {
    await sharp(symbolBuffer)
      .resize(480, 480)
      .extend({
        top: 600,
        bottom: 600,
        left: 480,
        right: 480,
        background: { r: 11, g: 12, b: 14, alpha: 1 },
      })
      .png()
      .toFile(path.join(iosSplashDir, "splash.png"));
  }

  console.log(
    "High-resolution PNG assets, Android adaptive icons, and iOS launch assets successfully generated!",
  );
}

generatePngExports().catch((err) => {
  console.error("Export error:", err);
  process.exit(1);
});
