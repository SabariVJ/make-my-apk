// Liquid Glass bottom-navigation regression tests.
//
// Structural: pins the glass dock implementation on the current release
// architecture without resurrecting any pre-release/arena design system.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const navigation = await read("../src/app/components/Navigation.tsx");
const styles = await read("../src/styles.css");
const motionDocs = await read("../docs/SVJ_UI_MOTION_SYSTEM.md");
const app = await read("../src/app/App.tsx");

// Strip comments so prose about the old bar can't trip assertions.
const navCode = navigation
  .split("\n")
  .filter(
    (l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"),
  )
  .join("\n");
const cssCode = styles
  .split("\n")
  .filter((l) => !l.trim().startsWith("/*") && !l.trim().startsWith("*"))
  .join("\n");

describe("glass dock CSS treatment", () => {
  it("defines one dock-specific glass utility", () => {
    assert.match(styles, /\.svj-glass-dock\s*\{/);
    assert.match(navCode, /svj-glass-dock/);
  });

  it("emits both prefixed and standard backdrop-filter and never animates it", () => {
    assert.match(cssCode, /-webkit-backdrop-filter:\s*blur\(18px\)\s*saturate\(140%\)/);
    assert.match(cssCode, /(?<!-webkit-)backdrop-filter:\s*blur\(18px\)\s*saturate\(140%\)/);
    assert.doesNotMatch(cssCode, /transition[^;]*backdrop-filter/i);
    assert.doesNotMatch(cssCode, /@keyframes[^{]*glass/i);
  });

  it("provides a graceful opaque fallback behind a feature query", () => {
    assert.match(
      styles,
      /@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/,
    );
    const dockStart = styles.indexOf(".svj-glass-dock {");
    const base = styles.slice(dockStart, styles.indexOf("@supports", dockStart));
    assert.match(base, /rgba\(11, 11, 12, 0\.97\)/);
  });

  it("uses only current tokens — no resurrected legacy names", () => {
    assert.ok(!cssCode.includes("--shadow-svj-"), "no legacy shadow token");
    assert.ok(!cssCode.includes("--color-svj-crimson-bright"), "no legacy crimson token");
    assert.ok(!styles.includes(".svj-safe-bottom"), "no duplicate safe-area utility");
    assert.match(cssCode, /rgba\(200, 30, 58, 0\.14\)/);
    assert.ok(!cssCode.includes("animate-ping"));
  });
});

describe("floating dock layout + safe area", () => {
  it("floats inset from the edges instead of edge-to-edge", () => {
    assert.match(navCode, /fixed bottom-0 left-0/);
    assert.match(navCode, /w-full max-w-full overflow-x-clip/);
    assert.match(navCode, /svj-dock-gutters/);
  });

  it("clears the gesture bar via the existing env(safe-area-inset-bottom) pattern", () => {
    assert.match(navCode, /env\(safe-area-inset-bottom,0px\)/);
    assert.match(app, /env\(safe-area-inset-bottom,0px\)/);
    assert.ok(!navCode.includes("bottom-[-"), "no negative offsets");
  });

  it("keeps the shared page-bottom clearance in App.tsx intact", () => {
    assert.match(app, /pb-\[calc\(6rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  });

  it("fits 320px: fluid full-width grid capped at max-w-md", () => {
    assert.match(navCode, /w-full max-w-md/);
    assert.match(navCode, /min-w-0/, "tabs must be allowed to shrink");
    assert.match(navCode, /truncate/, "labels truncate instead of clipping");
  });

  it("keeps accessible touch targets", () => {
    assert.match(navCode, /min-h-\[44px\]/);
  });

  it("renders 5 columns normally and 6 for the founder", () => {
    assert.match(navCode, /grid-cols-5/);
    assert.match(navCode, /grid-cols-6/);
    assert.match(navCode, /navItems\.length === 6/);
  });
});

describe("behavior and accessibility unchanged", () => {
  it("keeps the exact destinations, handlers, test ids and aria-current", () => {
    const ids = [...navCode.matchAll(/id: "([a-z]+)", label: "/g)].map((m) => m[1]);
    assert.deepEqual(ids.slice(0, 5), ["challenges", "activity", "workouts", "nutrition", "plus"]);
    assert.ok(navCode.includes("data-testid={`primary-nav-${item.id}`}"));
    assert.ok(navCode.includes('aria-current={isActive ? "page" : undefined}'));
    assert.ok(navCode.includes("onClick={() => setActiveTab(item.id)}"));
    assert.ok(navCode.includes("isFounderAccount"), "founder-only Recovery logic untouched");
    assert.ok(navCode.includes('id: "recovery", label: "Recovery"'));
  });

  it("keeps the static accent dot and never reintroduces animate-ping", () => {
    assert.ok(navCode.includes("aria-hidden"));
    assert.ok(!navigation.includes("animate-ping"));
    assert.ok(!navigation.includes("animate-pulse"));
  });

  it("respects reduced motion and the documented motion system", () => {
    assert.match(motionDocs, /No animated backdrop-filter/);
    assert.match(navCode, /svj-press/);
    assert.doesNotMatch(navCode, /transition-all/);
  });
});
