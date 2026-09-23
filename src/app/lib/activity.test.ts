import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_USER } from "../data/initialData";
import {
  applyActivityXp,
  editCustomChallenge,
  normalizeUserProfile,
  summarizeWorkout,
} from "./activity";
import type { DailyChallenge } from "../types";

describe("activity progress", () => {
  it("repairs an older cached profile without losing its XP or identity", () => {
    const user = normalizeUserProfile({
      id: "existing",
      name: "Existing member",
      totalXP: 100285,
      xpHistory: null,
      stats: null,
      badges: null,
      achievements: null,
    });
    assert.equal(user.id, "existing");
    assert.equal(user.name, "Existing member");
    assert.equal(user.totalXP, 100285);
    assert.equal(user.level, 201);
    assert.deepEqual(user.xpHistory, []);
    assert.equal(applyActivityXp(user, 60, new Date(2026, 8, 2)).totalXP, 100345);
  });

  it("does not trust a cached paid membership", () => {
    assert.equal(normalizeUserProfile({ isPremium: true }).isPremium, false);
  });

  it("is replayable without mutating the profile, history or stats", () => {
    const user = structuredClone(INITIAL_USER);
    const before = structuredClone(user);
    const now = new Date(2026, 8, 2, 10);
    const one = applyActivityXp(user, 80, now, { stats: { physical: 3 }, challengeDelta: 1 });
    const replay = applyActivityXp(user, 80, now, { stats: { physical: 3 }, challengeDelta: 1 });
    assert.deepEqual(one, replay);
    assert.deepEqual(user, before);
    assert.equal(one.totalXP, before.totalXP + 80);
    assert.equal(one.totalChallengesCompleted, before.totalChallengesCompleted + 1);
  });

  it("appends a new day's history and combines only that day's XP", () => {
    const user = { ...INITIAL_USER, xpHistory: [{ date: "Sep 01", dayKey: "2026-09-01", xp: 90 }] };
    const first = applyActivityXp(user, 60, new Date(2026, 8, 2, 10));
    const next = applyActivityXp(first, 10, new Date(2026, 8, 2, 12));
    assert.equal(next.xpHistory.length, 2);
    assert.equal(next.xpHistory[0].xp, 90);
    assert.equal(next.xpHistory[1].xp, 70);
    assert.equal(next.xpHistory[1].dayKey, "2026-09-02");
  });

  it("undoes task progress without negative counters", () => {
    const now = new Date(2026, 8, 2);
    const completed = applyActivityXp(INITIAL_USER, 80, now, { challengeDelta: 1 });
    const undone = applyActivityXp(completed, -80, now, { challengeDelta: -1 });
    assert.equal(undone.totalXP, INITIAL_USER.totalXP);
    assert.equal(undone.totalChallengesCompleted, INITIAL_USER.totalChallengesCompleted);
    assert.equal(applyActivityXp(INITIAL_USER, -100000, now).totalXP, 0);
  });

  it("updates tier and level together when a grant crosses a threshold", () => {
    const user = normalizeUserProfile({ ...INITIAL_USER, totalXP: 2490 });
    const next = applyActivityXp(user, 50, new Date());
    assert.equal(next.tier, "Bronze");
    assert.equal(next.level, 6);
  });
});

describe("custom task editing", () => {
  const task: DailyChallenge = {
    id: "custom",
    title: "Read",
    category: "Mental",
    difficulty: "Medium",
    xp: 80,
    durationMinutes: 20,
    description: "Custom task",
    isCustom: true,
    completed: false,
    createdAt: "2026-09-01T10:00:00Z",
  };

  it("preserves task identity and creation time when changing an incomplete task", () => {
    const edited = editCustomChallenge(
      task,
      { title: " Read 20 pages ", category: "Discipline", difficulty: "Hard" },
      new Date(),
    );
    assert.equal(edited?.id, task.id);
    assert.equal(edited?.createdAt, task.createdAt);
    assert.equal(edited?.title, "Read 20 pages");
    assert.equal(edited?.xp, 120);
    assert.equal(edited?.completed, false);
  });

  it("allows a completed title correction while preserving awarded XP", () => {
    const completed = { ...task, completed: true, earnedXP: 80, completedAt: "10:00" };
    const edited = editCustomChallenge(
      completed,
      { title: "Read 10 pages", category: task.category, difficulty: task.difficulty },
      new Date(),
    );
    assert.equal(edited?.earnedXP, 80);
    assert.equal(edited?.completedAt, "10:00");
    assert.equal(edited?.xp, 80);
  });

  it("rejects changing a completed reward, editing app tasks, and blank titles", () => {
    assert.equal(
      editCustomChallenge(
        { ...task, completed: true },
        { title: "Read", category: "Mental", difficulty: "Elite" },
        new Date(),
      ),
      null,
    );
    assert.equal(editCustomChallenge({ ...task, isCustom: false }, task, new Date()), null);
    assert.equal(editCustomChallenge(task, { ...task, title: "   " }, new Date()), null);
  });
});

describe("workout validation and displayed XP", () => {
  it("counts only named exercises with actual sets", () => {
    const summary = summarizeWorkout([
      { id: "one", name: " Squats ", sets: [{ reps: 8, weight: 20 }] },
      { id: "blank", name: "", sets: [{ reps: 100, weight: 100 }] },
    ]);
    assert.equal(summary.valid, true);
    assert.equal(summary.sets, 1);
    assert.equal(summary.volume, 160);
    assert.equal(summary.xp, 25);
    assert.equal(summary.exercises[0].name, "Squats");
  });

  it("rejects invalid reps/weight and accepts bodyweight movements", () => {
    for (const set of [
      { reps: 1.5, weight: 20 },
      { reps: 8, weight: -1 },
      { reps: 8, weight: Infinity },
    ]) {
      assert.equal(summarizeWorkout([{ id: "one", name: "Squats", sets: [set] }]).valid, false);
    }
    assert.equal(
      summarizeWorkout([{ id: "one", name: "Pushups", sets: [{ reps: 8, weight: 0 }] }]).valid,
      true,
    );
    assert.equal(
      summarizeWorkout([{ id: "one", name: "", sets: [{ reps: 8, weight: 20 }] }]).xp,
      0,
    );
  });
});
