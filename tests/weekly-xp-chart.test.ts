/**
 * Weekly XP chart regressions — the Profile chart must reflect real activity:
 * Mon–Sun buckets of the current week, reset each week, true daily average,
 * no hardcoded XP floors or fake averages.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCurrentWeekXp, getWeekAverageXp } from "../src/app/lib/weeklyXp";

const profile = readFileSync("src/app/views/ProfileView.tsx", "utf8");

// Wednesday 2026-09-16 12:00 local.
const WEDNESDAY = new Date(2026, 8, 16, 12, 0, 0);

describe("weekly XP chart", () => {
  it("produces exactly 7 Mon–Sun buckets", () => {
    const week = getCurrentWeekXp([], WEDNESDAY);
    assert.equal(week.length, 7);
    assert.deepEqual(
      week.map((d) => d.day),
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    );
    assert.equal(week[2].isToday, true);
  });

  it("maps real xpHistory dayKeys into the correct day buckets", () => {
    const week = getCurrentWeekXp(
      [
        { date: "14 Sep", dayKey: "2026-09-14", xp: 120 },
        { date: "16 Sep", dayKey: "2026-09-16", xp: 60 },
        { date: "10 Sep", dayKey: "2026-09-10", xp: 999 }, // last week — ignored
      ],
      WEDNESDAY,
    );
    assert.equal(week[0].xp, 120); // Mon
    assert.equal(week[1].xp, 0); // Tue
    assert.equal(week[2].xp, 60); // Wed (today)
    assert.equal(week[6].xp, 0); // Sun
  });

  it("resets to all-zero at the start of a new week", () => {
    // Monday of a NEW week — all prior week entries must be excluded.
    const nextMonday = new Date(2026, 8, 21, 8, 0, 0);
    const week = getCurrentWeekXp([{ date: "16 Sep", dayKey: "2026-09-16", xp: 500 }], nextMonday);
    assert.ok(week.every((d) => d.xp === 0));
  });

  it("average comes from real week data only", () => {
    const week = getCurrentWeekXp(
      [
        { date: "14 Sep", dayKey: "2026-09-14", xp: 140 },
        { date: "16 Sep", dayKey: "2026-09-16", xp: 60 },
      ],
      WEDNESDAY,
    );
    assert.equal(getWeekAverageXp(week), Math.round(200 / 7));
    assert.equal(getWeekAverageXp(getCurrentWeekXp([], WEDNESDAY)), 0);
  });

  it("no hardcoded floors or fake labels remain in the Profile chart", () => {
    assert.doesNotMatch(profile, /Avg 380/);
    assert.doesNotMatch(profile, /30-Day XP Growth Trend/);
    assert.doesNotMatch(profile, /Math\.max\(\.\.\.weekXp[\s\S]{0,20}600\)/);
    assert.match(profile, /getCurrentWeekXp\(user\.xpHistory\)/);
    assert.match(profile, /getWeekAverageXp\(weekXp\)/);
  });

  it("no founder XP hardcodes exist anywhere", () => {
    const ctx = readFileSync("src/app/context/SVJContext.tsx", "utf8");
    assert.doesNotMatch(ctx, /Math\.max\(baseUser\.totalXP/);
    assert.doesNotMatch(ctx, /100000/);
    assert.doesNotMatch(profile, /100000/);
  });
});
