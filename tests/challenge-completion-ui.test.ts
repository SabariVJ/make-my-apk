/**
 * Challenge completion UI regressions:
 *  - raw ISO timestamps never reach the UI (human-friendly formatter instead)
 *  - the completion control reads as a checkbox (rounded-md, not rounded-2xl/full)
 *  - the completed row is visually simplified (no strikethrough, no heavy dimming)
 *  - semantic radius usage across the app (cards kept, controls corrected)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCompletedAt } from "../src/app/lib/dateFormat";

const challenges = readFileSync("src/app/views/ChallengesView.tsx", "utf8");
const card = readFileSync("src/app/components/ChallengeCard.tsx", "utf8");

describe("formatCompletedAt", () => {
  const now = new Date(2026, 8, 21, 18, 0, 0); // 21 Sep 2026, 6:00 PM local

  it("renders today as Completed · <time>", () => {
    const earlier = new Date(2026, 8, 21, 10, 42, 0).toISOString();
    const out = formatCompletedAt(earlier, now);
    assert.match(out, /^Completed · /);
    assert.ok(!out.includes("T"), "no raw ISO in output");
    assert.ok(!out.includes("+00:00"), "no raw offset in output");
  });

  it("renders yesterday as Yesterday · <time>", () => {
    const out = formatCompletedAt(new Date(2026, 8, 20, 10, 42, 0).toISOString(), now);
    assert.match(out, /^Yesterday · /);
  });

  it("renders older dates as D Mon · <time>", () => {
    const out = formatCompletedAt(new Date(2026, 8, 12, 9, 5, 0).toISOString(), now);
    assert.match(out, /^\d{1,2} \w+ · /);
  });

  it("returns empty string for missing or invalid input", () => {
    assert.equal(formatCompletedAt(null, now), "");
    assert.equal(formatCompletedAt(undefined, now), "");
    assert.equal(formatCompletedAt("not-a-date", now), "");
  });
});

describe("challenge completion UI", () => {
  it("never renders the raw completedAt value", () => {
    assert.doesNotMatch(card, /Done \{challenge\.completedAt\}/);
    assert.match(card, /formatCompletedAt\(challenge\.completedAt\)/);
  });

  it("completion control is a square checkbox, not a pill", () => {
    const checkbox = card.match(/rounded-(\w+) border transition-colors/);
    assert.ok(checkbox, "checkbox class found");
    assert.equal(checkbox![1], "md");
  });

  it("completed row is simplified: no strikethrough, no heavy dimming", () => {
    assert.doesNotMatch(card, /line-through/);
    assert.doesNotMatch(card, /opacity-60/);
    assert.match(card, /opacity-80/);
  });

  it("completion timestamp uses the muted text token, not green", () => {
    const block = card.split("formatCompletedAt(challenge.completedAt)")[1] ?? "";
    assert.doesNotMatch(block.slice(0, 200), /emerald/);
  });

  it("difficulty is a compact bordered chip, XP is a rounded-md mono readout", () => {
    assert.match(card, /rounded border px-1\.5 py-px font-inter text-\[9px\]/); // difficulty
    assert.match(card, /rounded-md px-1\.5 py-0\.5 font-mono text-\[11px\]/); // XP chip
  });

  it("completion checkbox is not a radio-style circle or card radius", () => {
    assert.doesNotMatch(card, /rounded-2xl border-svj-crimson bg-svj-crimson/);
    assert.doesNotMatch(card, /rounded-full bg-svj-crimson/);
  });
});

describe("radius semantics", () => {
  const earn = readFileSync("src/app/components/EarnPlusCard.tsx", "utf8");
  const nav = readFileSync("src/app/components/Navigation.tsx", "utf8");
  const nutrition = readFileSync("src/app/views/NutritionView.tsx", "utf8");
  const frame = readFileSync("src/app/components/AvatarFrame.tsx", "utf8");

  it("cards keep rounded-2xl", () => {
    assert.match(earn, /rounded-2xl/);
    assert.match(challenges, /rounded-2xl border border-white\/\[0\.06\] bg-svj-surface/);
  });

  it("nav buttons use button radius, not panel radius", () => {
    assert.doesNotMatch(nav, /py-1\.5 px-2 sm:px-3 rounded-2xl/);
    assert.match(nav, /py-1\.5 px-2 sm:px-3 rounded-xl/);
  });

  it("inputs use input radius", () => {
    assert.match(nutrition, /rounded-xl px-3 py-2\.5/);
  });

  it("avatars are round", () => {
    assert.match(frame, /md: "w-10 h-10 rounded-full"/);
  });
});
