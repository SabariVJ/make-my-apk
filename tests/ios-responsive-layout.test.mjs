// iOS / mobile responsive-layout regressions.
//
// The 2026-10 iOS pass removed the last sources of horizontal page overflow:
// the Recovery section selector was a horizontal scroll strip (six shrink-0
// tabs ≈ 600px wide clipped inside a 343px phone column, so "Records" rendered
// as "Reco…"), and the Recovery history calendar forced 44px cells inside a
// seven-column grid (~344px minimum) on top of a phone-width card. Both are
// fixed at the source — not by adding overflow-x hiding — so these checks pin
// the contracts that keep every phone viewport free of horizontal scrolling.
//
// The assertions are structural (source + compiled class contracts), matching
// the rest of the responsive suite; an actual layout measurement is covered by
// the iOS build workflow and the manual viewport audit.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(file, "utf8");

const recoveryView = read("src/app/components/RecoveryView.tsx");
const recoveryNav = read("src/app/lib/recoveryNav.ts");
const historySection = read("src/app/components/recovery/RecoveryHistorySection.tsx");
const app = read("src/app/App.tsx");
const styles = read("src/styles.css");
const header = read("src/app/components/Header.tsx");
const navigation = read("src/app/components/Navigation.tsx");
const root = read("src/routes/__root.tsx");

/** Every source file that renders Recovery, so no sub-panel can reintroduce it. */
const recoveryFiles = [
  "src/app/components/RecoveryView.tsx",
  "src/app/views/TrainRecovery.tsx",
  ...(() => {
    const dir = "src/app/components/recovery";
    return readdirSync(dir)
      .filter((name) => name.endsWith(".tsx") && statSync(path.join(dir, name)).isFile())
      .map((name) => path.join(dir, name));
  })(),
];

/** Tab / carousel strips that used to be horizontal scroll containers. */
const STRIPS = {
  "ActivityView.tsx": read("src/app/views/ActivityView.tsx"),
  "RewardsView.tsx": read("src/app/views/RewardsView.tsx"),
  "TrainStrength.tsx": read("src/app/views/TrainStrength.tsx"),
  "CommunityView.tsx": read("src/app/views/CommunityView.tsx"),
  "ChallengesView.tsx": read("src/app/views/ChallengesView.tsx"),
  "GpsActivityDetail.tsx": read("src/app/views/GpsActivityDetail.tsx"),
  "TemplateBrowser.tsx": read("src/app/components/TemplateBrowser.tsx"),
};

/** All app source (excluding the intentionally-contained admin data table). */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx?|css)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("Recovery section selector never requires horizontal scrolling", () => {
  it("renders the tabs as a wrapping grid, not an overflow-x scroll strip", () => {
    const tablistStart = recoveryView.indexOf('role="tablist"');
    const tablist = recoveryView.slice(
      tablistStart,
      recoveryView.indexOf("RECOVERY_SECTIONS.map", tablistStart),
    );
    assert.match(tablist, /role="tablist"/);
    assert.match(tablist, /data-testid="recovery-sections"/);
    assert.doesNotMatch(tablist, /overflow-x-(auto|scroll)/);
    // Mobile wraps (2 columns, 3 once there is room); lg returns to one row.
    assert.match(tablist, /grid/);
    assert.match(tablist, /grid-cols-2/);
    assert.match(tablist, /flex-wrap/);
  });

  it("lets every tab shrink and keeps its full label visible", () => {
    const tab = recoveryView.slice(
      recoveryView.indexOf("data-testid={`recovery-section-tab-"),
      recoveryView.indexOf("{item.label}"),
    );
    assert.match(tab, /w-full/);
    assert.match(tab, /min-w-0/);
    assert.doesNotMatch(tab, /(?<!lg:)shrink-0/); // shrink-0 only from lg
    assert.doesNotMatch(tab, /truncate/); // a long label must never be ellipsised
    // The compact single-line row is a desktop-only treatment.
    assert.match(recoveryView, /lg:flex lg:flex-wrap/);
  });

  it("keeps all six section labels and panels wired", () => {
    for (const label of ["Overview", "History", "Goals", "Records", "Progress", "Devices"]) {
      assert.match(recoveryNav, new RegExp(`label: "${label}"`), `missing label ${label}`);
    }
    const subtree = recoveryFiles.map(read).join("\n");
    for (const id of ["overview", "history", "goals", "records", "progress", "devices"]) {
      assert.match(subtree, new RegExp(`recovery-panel-${id}`), `missing panel ${id}`);
    }
  });

  it("never reintroduces a horizontal scroll container anywhere in Recovery", () => {
    for (const file of recoveryFiles) {
      assert.doesNotMatch(
        read(file),
        /overflow-x-(auto|scroll)/,
        `${file} must not become a horizontal scroll container`,
      );
    }
  });
});

describe("Recovery history calendar fits the phone column", () => {
  it("keeps the seven-day grid but makes its cells shrinkable on phones", () => {
    assert.match(historySection, /grid grid-cols-7/);
    const cell = historySection.slice(
      historySection.indexOf("recovery-history-cell-"),
      historySection.indexOf("<span aria-hidden"),
    );
    assert.match(cell, /min-w-0/);
    // The 44px touch target is restored only once the calendar has room.
    assert.match(cell, /sm:min-w-\[44px\]/);
    assert.doesNotMatch(cell, /(?<!sm:)min-w-\[44px\]/);
  });
});

describe("the mobile shell cannot push content past the viewport", () => {
  it("never sizes a page container with the viewport-ignoring 100vw/w-screen", () => {
    for (const file of walk("src/app")) {
      const source = read(file);
      assert.doesNotMatch(source, /100vw/, `${file} must not use 100vw`);
      assert.doesNotMatch(source, /\bw-screen\b/, `${file} must not use w-screen`);
    }
  });

  it("clamps the root elements and lets the page container fill the phone", () => {
    assert.match(styles, /html \{[^}]*max-width: 100%/s);
    assert.match(styles, /body \{[^}]*max-width: 100%/s);
    assert.match(styles, /#root \{[^}]*max-width: 100%/s);
    assert.match(app, /const PAGE_CONTAINER =\s*\n?\s*"svj-page-gutters mx-auto min-w-0 w-full/);
    assert.doesNotMatch(app, /w-screen|100vw/);
  });

  it("keeps the header inside the viewport with shrinkable grid tracks", () => {
    assert.match(header, /svj-page-gutters/);
    assert.match(header, /grid-cols-\[minmax\(0,1fr\)/);
    assert.doesNotMatch(header, /100vw|w-screen/);
  });

  it("keeps the bottom navigation within the full width and bottom safe area", () => {
    assert.match(navigation, /fixed bottom-0 left-0/);
    assert.match(navigation, /w-full max-w-full/);
    assert.match(navigation, /env\(safe-area-inset-bottom,0px\)/);
    assert.match(navigation, /min-w-0/);
  });

  it("keeps safe-area gutters that never double-apply the inset", () => {
    assert.match(styles, /--svj-safe-left: env\(safe-area-inset-left, 0px\)/);
    assert.match(styles, /padding-left: max\(var\(--svj-gutter\), var\(--svj-safe-left\)\)/);
    assert.match(styles, /padding-right: max\(var\(--svj-gutter\), var\(--svj-safe-right\)\)/);
  });
});

describe("no destination exposes a horizontal scroll strip", () => {
  it("wraps every former tab/carousel strip instead of scrolling it", () => {
    for (const [name, source] of Object.entries(STRIPS)) {
      assert.doesNotMatch(source, /overflow-x-(auto|scroll)/, `${name} still scrolls horizontally`);
    }
    assert.match(STRIPS["ActivityView.tsx"], /flex flex-wrap gap-2/);
    assert.match(STRIPS["RewardsView.tsx"], /flex flex-wrap items-center gap-2/);
    assert.match(STRIPS["ChallengesView.tsx"], /flex flex-wrap items-center justify-between gap-2/);
    assert.match(STRIPS["TemplateBrowser.tsx"], /flex flex-wrap gap-2/);
    assert.match(STRIPS["GpsActivityDetail.tsx"], /flex flex-wrap gap-1\.5/);
  });

  it("only the admin data table keeps a contained horizontal scroll", () => {
    const offenders = [];
    for (const file of walk("src/app")) {
      const source = read(file);
      if (/overflow-x-(auto|scroll)/.test(source)) offenders.push(file);
    }
    assert.deepEqual(offenders, ["src/app/views/AdminDashboardView.tsx"]);
  });
});

describe("iOS viewport metadata stays zoom-accessible and safe-area aware", () => {
  it("keeps viewport-fit=cover without disabling accessibility zoom", () => {
    assert.match(root, /width=device-width, initial-scale=1, viewport-fit=cover/);
    assert.doesNotMatch(root, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
  });

  it("keeps rotation/reflow safe: no fixed pixel width on the primary containers", () => {
    // The page container is fluid; only the decorative admin table is fixed.
    const fixedWidth = /(?<![-\w])w-\[\d{3,}px\]/;
    assert.doesNotMatch(app, fixedWidth);
    assert.doesNotMatch(header, fixedWidth);
    assert.doesNotMatch(recoveryView, fixedWidth);
  });
});
