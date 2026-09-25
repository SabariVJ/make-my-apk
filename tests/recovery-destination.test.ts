/**
 * SVJ Recovery V2 — Phase 1: Recovery destination + navigation shell.
 *
 * Pins the staged rollout contract so it cannot silently drift:
 *   - exactly five primary destinations for ordinary users (unchanged),
 *   - Recovery promoted to a sixth founder-only destination directly after
 *     Train, gated on the server-backed profile AFTER it has loaded,
 *   - the founder's duplicate Recovery section hidden inside Activity, while
 *     everyone else keeps the current Train › Recovery path,
 *   - the six Recovery sections (and no Routes tab),
 *   - accessible tabs (roles, roving tabindex, keyboard) and honest empty
 *     states instead of fabricated recovery analytics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFounderAccount } from "../src/app/lib/founderGate";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const navigation = read("../src/app/components/Navigation.tsx");
const app = read("../src/app/App.tsx");
const activityView = read("../src/app/views/ActivityView.tsx");
const recoveryView = read("../src/app/components/RecoveryView.tsx");
const recoveryNav = read("../src/app/lib/recoveryNav.ts");
const founderGate = read("../src/app/lib/founderGate.ts");

/** Ids declared by a `{ id: "x", label: "Y" }` style list, in source order. */
function navIds(source: string): string[] {
  return [...source.matchAll(/id: "([a-z]+)", label: "/g)].map((m) => m[1]);
}

describe("founder rollout gate", () => {
  it("never answers before the real profile has loaded", () => {
    assert.equal(isFounderAccount({ isFounder: true }, false), false);
    assert.equal(isFounderAccount({ isOwner: true }, false), false);
    assert.equal(isFounderAccount(undefined, false), false);
  });

  it("trusts only the server-backed founder/owner flags", () => {
    assert.equal(isFounderAccount({ isFounder: true }, true), true);
    assert.equal(isFounderAccount({ isOwner: true }, true), true);
    assert.equal(isFounderAccount({}, true), false);
    assert.equal(isFounderAccount(null, true), false);
    assert.equal(isFounderAccount(undefined, true), false);
  });

  it("keeps no email allow-list of its own (no second founder system)", () => {
    assert.doesNotMatch(founderGate, /@/, "the gate must not hardcode any email");
    assert.match(founderGate, /isFounder === true \|\| user\.isOwner === true/);
  });
});

describe("primary navigation information architecture", () => {
  it("keeps the five existing destinations for everyone else", () => {
    assert.deepEqual(
      navIds(navigation).slice(0, 5),
      ["challenges", "activity", "workouts", "nutrition", "plus"],
      "the ordinary bottom navigation must stay exactly five destinations",
    );
    assert.match(navigation, /\{ id: "nutrition", label: "Fuel", icon: Apple \}/);
    assert.match(navigation, /\{ id: "plus", label: "Plus", icon: Crown/);
  });

  it("declares the recovery destination separately and gates it on the founder flag", () => {
    assert.match(navigation, /\|\s*"recovery"/, "ActiveTab must include recovery");
    assert.match(
      navigation,
      /const recoveryItem: PrimaryNavItem = \{ id: "recovery", label: "Recovery", icon: HeartPulse \}/,
    );
    assert.match(navigation, /const recoveryEnabled = isFounderAccount\(user, profileLoaded\)/);
    assert.match(navigation, /recoveryEnabled\s*\?\s*\[/);
  });

  it("inserts Recovery directly after Train for the founder", () => {
    // Recovery is spliced in directly after Train (index 2), before Fuel.
    assert.ok(
      navigation.includes(
        "[...primaryNavItems.slice(0, 3), recoveryItem, ...primaryNavItems.slice(3)]",
      ),
      "Recovery must be inserted directly after Train",
    );
    const order = navIds(navigation).slice(0, 5);
    assert.equal(order.indexOf("workouts"), 2);
    assert.equal(order.indexOf("nutrition"), 3);
  });

  it("grows the mobile dock to six columns without touching the five-column default", () => {
    assert.match(navigation, /"grid grid-cols-5"/);
    assert.match(navigation, /"grid grid-cols-6"/);
    assert.match(navigation, /navItems\.length === 6/);
  });

  it("keeps the restricted post-trial shell unchanged", () => {
    assert.match(navigation, /restricted \? restrictedNavItems : allNavItems/);
    const restrictedBlock = navigation.slice(navigation.indexOf("restrictedNavItems"));
    assert.doesNotMatch(
      restrictedBlock.slice(0, 400),
      /id: "recovery"/,
      "the restricted shell must not gain a Recovery destination",
    );
  });
});

describe("App routing", () => {
  it("routes the recovery destination to the Recovery shell", () => {
    assert.match(app, /import \{ RecoveryView \} from "\.\/components\/RecoveryView"/);
    assert.match(
      app,
      /\{activeTab === "recovery" && \(\s*<RecoveryView [\s\S]*?\/>\s*\)\}/,
      "the founder Recovery tab must render the Recovery shell",
    );
  });

  it("computes the rollout from the loaded profile only", () => {
    assert.match(app, /const founderRecoveryEnabled = isFounderAccount\(user, profileLoaded\)/);
    assert.match(app, /<ActivityView hideRecoverySection=\{founderRecoveryEnabled\} \/>/);
  });
});

describe("Train › Recovery is hidden only for the founder", () => {
  it("defaults the ActivityView section to visible", () => {
    assert.match(activityView, /hideRecoverySection = false/);
    assert.match(
      activityView,
      /\.filter\(\(s\) => !hideRecoverySection \|\| s\.id !== "recovery"\)/,
    );
  });

  it("keeps the existing Recovery section and engine for ordinary users", () => {
    assert.match(activityView, /\{ id: "recovery", label: "Recovery" \}/);
    assert.match(activityView, /section === "recovery" && <TrainRecovery \/>/);
    assert.match(recoveryView, /import \{ TrainRecovery \} from "\.\.\/views\/TrainRecovery"/);
  });
});

describe("Recovery shell sections", () => {
  it("exposes Overview, History, Goals, Records, Progress and Devices in order", () => {
    const ids = [...recoveryNav.matchAll(/\{ id: "([a-z]+)", label: "([A-Za-z]+)", icon:/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(ids, ["overview", "history", "goals", "records", "progress", "devices"]);
    assert.match(recoveryView, /import \{ RECOVERY_SECTIONS, type RecoverySection \}/);
  });

  it("does not include Routes or the GPS device list", () => {
    assert.doesNotMatch(recoveryNav, /\{ id: "routes"/);
    assert.doesNotMatch(recoveryView, /RouteLibrary/);
    assert.doesNotMatch(recoveryView, /ConnectedDevicesView/);
  });

  it("renders the live Overview from the one existing Recovery engine", () => {
    assert.match(recoveryView, /section === "overview" && \(/);
    assert.match(recoveryView, /<TrainRecovery \/>/);
  });

  it("labels every placeholder honestly instead of inventing data", () => {
    assert.match(recoveryView, /Coming next/);
    assert.match(recoveryView, /Nothing is shown here yet because SVJ only displays recovery data/);
    // Check the shipped code, not the comments that promise this behaviour.
    const recoveryCode = recoveryView.replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(recoveryCode, /\bdemo\b|\bsample data\b|\bfake\b/i);
  });

  it("only claims a wearable once one can actually be read", () => {
    assert.match(recoveryView, /Health Connect/);
    assert.match(recoveryView, /Wear OS/);
    assert.match(recoveryView, /No device is connected\./);
  });
});

describe("Recovery section accessibility", () => {
  it("uses a real tablist with tabs wired to their panels", () => {
    assert.match(recoveryView, /role="tablist"/);
    assert.match(recoveryView, /aria-label="Recovery sections"/);
    assert.match(recoveryView, /role="tab"/);
    assert.match(recoveryView, /aria-selected=\{active\}/);
    assert.match(recoveryView, /aria-controls=\{`recovery-panel-\$\{item\.id\}`\}/);
    assert.match(recoveryView, /id=\{`recovery-tab-\$\{item\.id\}`\}/);
    assert.match(recoveryView, /role="tabpanel"/);
    assert.match(recoveryView, /aria-labelledby=\{`recovery-tab-\$\{section\}`\}/);
  });

  it("supports keyboard navigation with a roving tabindex", () => {
    assert.match(recoveryView, /tabIndex=\{active \? 0 : -1\}/);
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      assert.ok(recoveryView.includes(key), `${key} must move between recovery sections`);
    }
    assert.match(recoveryView, /event\.preventDefault\(\)/);
  });

  it("never communicates the selected state by colour alone", () => {
    assert.match(recoveryView, /<span className="sr-only">\(selected\)<\/span>/);
  });

  it("uses buttons rather than clickable divs", () => {
    assert.match(recoveryView, /<button/);
    assert.doesNotMatch(recoveryView, /<div[^>]*onClick=/);
  });
});
