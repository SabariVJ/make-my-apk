/**
 * Challenge completion UI regressions:
 *  - raw ISO timestamps never reach the UI (human-friendly formatter instead)
 *  - the completion control reads as a checkbox (rounded-md, not rounded-2xl/full)
 *  - the completed row is visually simplified (no strikethrough, no red/green pile-up)
 *  - semantic radius usage across the app (cards kept, controls corrected)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCompletedAt } from "../src/app/lib/dateFormat";

const challenges = readFileSync("src/app/views/ChallengesView.tsx", "utf8");

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
    assert.doesNotMatch(challenges, /Done \{challenge\.completedAt\}/);
    assert.match(challenges, /formatCompletedAt\(challenge\.completedAt\)/);
  });

  it("completion control is a square checkbox, not a pill", () => {
    const checkbox = challenges.match(/w-5 h-5 rounded-(\w+) border flex items-center/);
    assert.ok(checkbox, "checkbox class found");
    assert.equal(checkbox![1], "md");
  });

  it("completed row is simplified: no strikethrough, no heavy dimming", () => {
    assert.doesNotMatch(challenges, /line-through/);
    assert.doesNotMatch(challenges, /opacity-60/);
    assert.match(challenges, /opacity-80/);
  });

  it("completion timestamp uses the muted text token, not green", () => {
    const block = challenges.split("formatCompletedAt(challenge.completedAt)")[1] ?? "";
    assert.doesNotMatch(block.slice(0, 200), /emerald/);
  });

  it("difficulty badge and XP pill are pills, status chips are chips", () => {
    assert.match(challenges, /rounded-full text-\[9px\]/); // difficulty badge
    assert.match(challenges, /px-2\.5 py-1 rounded-full text-\[11px\]/); // XP pill
  });

  it("completion checkbox is not a radio-style circle or card radius", () => {
    assert.doesNotMatch(challenges, /w-5 h-5 rounded-2xl/);
    assert.doesNotMatch(challenges, /w-5 h-5 rounded-full/);
  });
});

describe("radius semantics", () => {
  const card = readFileSync("src/app/components/EarnPlusCard.tsx", "utf8");
  const nav = readFileSync("src/app/components/Navigation.tsx", "utf8");
  const nutrition = readFileSync("src/app/views/NutritionView.tsx", "utf8");
  const frame = readFileSync("src/app/components/AvatarFrame.tsx", "utf8");

  it("cards keep rounded-2xl", () => {
    assert.match(card, /rounded-2xl/);
    // The task row keeps its card radius; only its padding was tightened by the
    // responsive-density pass.
    assert.match(challenges, /rounded-2xl border bg-\[#17171A\] p-3\.5/);
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
