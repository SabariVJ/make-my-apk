// SVJ PERFORMANCE OS — design foundation regression checks.
// Static source assertions so the shared visual system cannot silently
// regress (tokens removed, primitives renamed, safety features dropped).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("Performance OS design tokens (src/styles.css)", () => {
  it("registers all six Character Matrix attribute colors", async () => {
    const css = await read("../src/styles.css");
    for (const [name, hex] of [
      ["--color-attr-physical", "#10b981"],
      ["--color-attr-ambition", "#a855f7"],
      ["--color-attr-intellect", "#f59e0b"],
      ["--color-attr-mental", "#eab308"],
      ["--color-attr-social", "#3b82f6"],
      ["--color-attr-discipline", "#f43f5e"],
    ]) {
      assert.match(css, new RegExp(`${name}:\\s*${hex}`), `missing token ${name}`);
    }
  });

  it("registers status colors, elevation, easing, breakpoint and shimmer", async () => {
    const css = await read("../src/styles.css");
    assert.match(css, /--color-state-positive:\s*#34d399/);
    assert.match(css, /--color-state-warning:\s*#eab308/);
    assert.match(css, /--color-state-caution:\s*#fb923c/);
    assert.match(css, /--color-state-critical:\s*#f87171/);
    assert.match(css, /--shadow-svj-1:/);
    assert.match(css, /--shadow-svj-2:/);
    assert.match(css, /--shadow-svj-3:/);
    assert.match(css, /--ease-svj:/);
    assert.match(css, /--breakpoint-xs:\s*26rem/);
    assert.match(css, /@keyframes svj-shimmer/);
  });

  it("keeps the brand signals and dark-only shell intact", async () => {
    const css = await read("../src/styles.css");
    assert.match(css, /--color-svj-crimson:\s*#c81e3a/);
    assert.match(css, /--color-svj-gold:\s*#d4af37/);
    assert.match(css, /--color-svj-bg:\s*#0b0b0c/);
    assert.match(css, /color-scheme: dark/);
  });

  it("keeps reduced-motion protection and Android safe-area utilities", async () => {
    const css = await read("../src/styles.css");
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /\.svj-safe-bottom/);
    assert.match(css, /env\(safe-area-inset-bottom/);
  });

  it("chart tokens agree between :root and .dark (dark-only app)", async () => {
    const css = await read("../src/styles.css");
    assert.doesNotMatch(
      css,
      /oklch\(0\.646/,
      "light-mode oklch chart tokens must not remain in :root",
    );
  });
});

describe("JS token mirror (src/app/lib/designTokens.ts)", () => {
  it("preserves the original Character Matrix identity exactly", async () => {
    const tokens = await read("../src/app/lib/designTokens.ts");
    const matrix = await read("../src/app/components/CharacterMatrix.tsx");
    for (const hex of ["#10B981", "#A855F7", "#F59E0B", "#EAB308", "#3B82F6", "#F43F5E"]) {
      assert.ok(tokens.includes(hex), `designTokens missing ${hex}`);
    }
    // Matrix geometry reads attribute colors from the token mirror.
    assert.match(matrix, /ATTRIBUTE_COLORS\[[^\]]+\]/, "matrix must read token colors");
    assert.doesNotMatch(matrix, /💪|👑|📖|🧠|👥|⚔️/, "no emoji in Character Matrix");
  });

  it("exposes brand, status, radii, motion and breakpoint scales", async () => {
    const tokens = await read("../src/app/lib/designTokens.ts");
    for (const sym of [
      "BRAND_COLORS",
      "ATTRIBUTE_COLORS",
      "STATUS_COLORS",
      "RADII",
      "MOTION",
      "BREAKPOINTS",
      "readinessColor",
    ]) {
      assert.match(tokens, new RegExp(`export (const|function) ${sym}`), `missing ${sym}`);
    }
  });
});

describe("primitive kit (src/app/components/ui-primitives)", () => {
  it("exports every Performance OS primitive from the barrel", async () => {
    const barrel = await read("../src/app/components/ui-primitives/index.ts");
    for (const name of [
      "SVJSurface",
      "SVJCard",
      "SVJHeroCard",
      "SVJMetricCard",
      "SVJInsightCard",
      "SVJActionCard",
      "SVJListRow",
      "SVJSectionHeader",
      "SVJScoreRing",
      "SVJProgressMeter",
      "SVJProgress",
      "SVJStatDelta",
      "SVJStatusPill",
      "SVJBadge",
      "SVJAvatar",
      "SVJEmptyState",
      "SVJErrorState",
      "SVJSkeleton",
      "SVJResponsiveDialog",
      "SVJBottomSheet",
      "SVJTimelineStep",
      "SVJDatePicker",
      "SVJTimePicker",
      "SVJSelect",
    ]) {
      assert.match(barrel, new RegExp(`\\b${name}\\b`), `barrel missing ${name}`);
    }
  });

  it("keeps the legacy primitives intact for existing screens", async () => {
    const card = await read("../src/app/components/ui-primitives/SVJCard.tsx");
    assert.match(card, /level\?: "surface" \| "raised" \| "inset" \| "crimson" \| "gold"/);
    const progress = await read("../src/app/components/ui-primitives/SVJProgress.tsx");
    assert.match(progress, /role="progressbar"/);
  });

  it("rings and meters honor reduced motion", async () => {
    for (const file of ["SVJScoreRing.tsx", "SVJProgressMeter.tsx"]) {
      const src = await read(`../src/app/components/ui-primitives/${file}`);
      assert.match(src, /useReducedMotion/, `${file} must check reduced motion`);
    }
  });

  it("overlays are dark-branded and clear the Android gesture bar", async () => {
    const sheet = await read("../src/app/components/ui-primitives/SVJBottomSheet.tsx");
    assert.match(sheet, /bg-svj-surface/);
    assert.match(sheet, /svj-safe-bottom/);
    const dialog = await read("../src/app/components/ui-primitives/SVJResponsiveDialog.tsx");
    assert.match(dialog, /bg-svj-surface/);
    assert.match(dialog, /useIsTabletOrDesktop/);
  });

  it("the media query hook never touches window at module scope", async () => {
    const hook = await read("../src/app/hooks/useMediaQuery.ts");
    assert.match(hook, /useSyncExternalStore/);
    assert.doesNotMatch(hook, /^window\./m);
  });

  it("ships no browser dialogs in the foundation", async () => {
    for (const file of [
      "SVJSurface.tsx",
      "SVJHeroCard.tsx",
      "SVJMetricCard.tsx",
      "SVJInsightCard.tsx",
      "SVJActionCard.tsx",
      "SVJListRow.tsx",
      "SVJScoreRing.tsx",
      "SVJProgressMeter.tsx",
      "SVJStatDelta.tsx",
      "SVJStatusPill.tsx",
      "SVJAvatar.tsx",
      "SVJErrorState.tsx",
      "SVJSkeleton.tsx",
      "SVJBottomSheet.tsx",
      "SVJResponsiveDialog.tsx",
      "SVJTimelineStep.tsx",
    ]) {
      const src = await read(`../src/app/components/ui-primitives/${file}`);
      assert.doesNotMatch(src, /window\.(alert|confirm|prompt)/, file);
    }
  });
});
