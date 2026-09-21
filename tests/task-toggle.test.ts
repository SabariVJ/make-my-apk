/**
 * Task completion toggle regressions:
 *  - completions are stored as ROWS with the exact xp_awarded + stat points
 *  - unchecking today reverses exactly those stored amounts
 *  - re-checking reuses the stored payout (no re-roll, no XP farming)
 *  - past days and pre-ledger completions are locked
 *  - Character Matrix / Total Completed / Habit Consistency are live sums
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeRowsForDay,
  createLedger,
  dayXpTotal,
  deriveHabitCompletionRate,
  deriveStats,
  deriveTotalCompleted,
  localDayKey,
  normalizeLedger,
  reconcileStatPoints,
  statPointTotals,
  toggleTaskCompletion,
  type CompletionLedger,
} from "../src/app/lib/taskCompletions";
import type { UserStats } from "../src/app/types";

const BASE_STATS: UserStats = {
  physical: 20,
  social: 10,
  discipline: 10,
  mental: 10,
  intellect: 10,
  ambition: 10,
};

const NOW = new Date(2026, 8, 21, 12, 0, 0);

const task = (over: Partial<Parameters<typeof toggleTaskCompletion>[1]> = {}) => ({
  id: "c1",
  title: "Morning Run",
  category: "Physical" as const,
  completed: false,
  xp: 40,
  ...over,
});

const fresh = (): CompletionLedger => createLedger({ stats: BASE_STATS, totalCompleted: 7 });

function complete(ledger: CompletionLedger, over = {}) {
  const result = toggleTaskCompletion(ledger, task(over), { now: NOW, newId: () => "row-1" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result;
}

describe("completion rows", () => {
  it("stores a row with the exact XP and stat points granted", () => {
    const { ledger, row } = complete(fresh());
    assert.equal(ledger.rows.length, 1);
    assert.equal(row.challengeId, "c1");
    assert.equal(row.dayKey, localDayKey(NOW));
    assert.equal(row.xpAwarded, 40);
    assert.equal(row.statCategory, "physical");
    assert.equal(row.statPoints, 3);
    assert.equal(typeof row.completedAt, "string");
  });

  it("is not a boolean: the row survives the uncheck as history", () => {
    const first = complete(fresh());
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(undone.ledger.rows.length, 1); // row kept
    assert.equal(undone.action, "uncomplete");
    assert.equal(activeRowsForDay(undone.ledger, localDayKey(NOW)).length, 0);
    assert.ok(undone.row.undoneAt);
  });
});

describe("exact reversal", () => {
  it("subtracts the stored xpAwarded and statPoints on uncheck", () => {
    const first = complete(fresh(), { xp: 55 });
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt, xp: 999 }),
      { now: NOW },
    );
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    // Reversal uses the STORED amount (55), never the challenge's current xp.
    assert.equal(undone.xpDelta, -55);
    assert.deepEqual(undone.statDelta, { physical: -3 });
    assert.equal(dayXpTotal(undone.ledger, localDayKey(NOW)), 0);
    assert.deepEqual(statPointTotals(undone.ledger).physical, 0);
  });

  it("reverses only the matching stat, leaving others untouched", () => {
    const first = complete(fresh(), { category: "Mental" });
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt, category: "Mental" }),
      { now: NOW },
    );
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.deepEqual(undone.statDelta, { mental: -3 });
  });
});

describe("re-check reuses the stored payout", () => {
  it("never re-rolls XP or stats when toggled again", () => {
    const first = complete(fresh(), { xp: 40 });
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    // Challenge XP raised after the original completion — must be ignored.
    const again = toggleTaskCompletion(undone.ledger, task({ completed: false, xp: 900 }), {
      now: NOW,
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.reused, true);
    assert.equal(again.row.xpAwarded, 40);
    assert.equal(again.row.statPoints, 3);
    assert.equal(again.xpDelta, 40);
    assert.equal(again.row.completedAt, first.row.completedAt);
    assert.ok(again.row.recompletedAt);
    assert.equal(again.ledger.rows.length, 1);
  });

  it("net XP across complete → uncheck → recheck → uncheck is zero", () => {
    let ledger = fresh();
    const deltas: number[] = [];
    let completed = false;
    let completedAt: string | undefined;
    for (const step of ["on", "off", "on", "off"] as const) {
      const result = toggleTaskCompletion(ledger, task({ completed, completedAt }), { now: NOW });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      deltas.push(result.xpDelta);
      ledger = result.ledger;
      completed = result.action === "complete";
      completedAt = completed ? result.row.completedAt : undefined;
    }
    assert.deepEqual(deltas, [40, -40, 40, -40]);
    assert.equal(
      deltas.reduce((a, b) => a + b, 0),
      0,
    );
  });
});

describe("locked completions", () => {
  it("refuses to uncheck a completion with no ledger row", () => {
    const result = toggleTaskCompletion(fresh(), task({ completed: true }), { now: NOW });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /undo tracking/);
  });

  it("refuses to uncheck a completion from a past day", () => {
    const yesterday = new Date(2026, 8, 20, 12, 0, 0).toISOString();
    const result = toggleTaskCompletion(
      fresh(),
      task({ completed: true, completedAt: yesterday }),
      {
        now: NOW,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Past days are locked/);
  });
});

describe("derived live sums", () => {
  it("Character Matrix stats go back down with the rows", () => {
    const first = complete(fresh());
    const afterComplete = { ...BASE_STATS, physical: BASE_STATS.physical + 3 };
    assert.deepEqual(deriveStats(first.ledger), afterComplete);
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    assert.deepEqual(deriveStats(undone.ledger), BASE_STATS);
  });

  it("Total Completed and per-day XP are live sums over active rows", () => {
    let ledger = fresh();
    const first = complete(ledger, { id: "a", xp: 30 });
    ledger = first.ledger;
    const second = toggleTaskCompletion(ledger, task({ id: "b", xp: 20 }), {
      now: NOW,
      newId: () => "row-2",
    });
    if (!second.ok) throw new Error("unreachable");
    ledger = second.ledger;
    assert.equal(deriveTotalCompleted(ledger), 9); // baseline 7 + 2 rows
    assert.equal(dayXpTotal(ledger, localDayKey(NOW)), 50);

    const undone = toggleTaskCompletion(
      ledger,
      task({ id: "a", completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    assert.equal(deriveTotalCompleted(undone.ledger), 8);
    assert.equal(dayXpTotal(undone.ledger, localDayKey(NOW)), 20);
  });

  it("Habit Consistency falls again when today's only task is undone", () => {
    const first = complete(fresh());
    assert.equal(deriveHabitCompletionRate(first.ledger, 10, NOW), 10);
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    assert.equal(deriveHabitCompletionRate(undone.ledger, 10, NOW), 0);
  });

  it("streak moves only when today crosses the completion threshold", () => {
    const first = complete(fresh(), { id: "a" });
    assert.equal(first.streakDelta, 1);
    // A second task the same day must not add another day to the streak.
    const second = toggleTaskCompletion(first.ledger, task({ id: "b" }), {
      now: NOW,
      newId: () => "row-2",
    });
    if (!second.ok) throw new Error("unreachable");
    assert.equal(second.streakDelta, 0);
    // Dropping one of two still leaves today above the threshold: no change.
    const undone = toggleTaskCompletion(
      second.ledger,
      task({ id: "a", completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    assert.equal(undone.streakDelta, 0);
    // Dropping the last one takes today below the threshold: streak reverses.
    const last = toggleTaskCompletion(
      undone.ledger,
      task({ id: "b", completed: true, completedAt: second.row.completedAt }),
      { now: NOW },
    );
    if (!last.ok) throw new Error("unreachable");
    assert.equal(last.streakDelta, -1);
  });
});

describe("stat reconciliation", () => {
  it("only ever moves stats by the ledger's own contribution", () => {
    const before = { ...BASE_STATS };
    const first = complete(fresh());
    // The applied delta is exactly the ledger's contribution for that attribute.
    assert.deepEqual(first.statDelta, { physical: 3 });
    // Re-reconciling the same ledger is a no-op (never double-applies).
    assert.deepEqual(reconcileStatPoints(first.ledger).delta, {});
    // Unchecking reconciles back to the pre-ledger value.
    const undone = toggleTaskCompletion(
      first.ledger,
      task({ completed: true, completedAt: first.row.completedAt }),
      { now: NOW },
    );
    if (!undone.ok) throw new Error("unreachable");
    assert.deepEqual(undone.statDelta, { physical: -3 });
    assert.deepEqual(deriveStats(undone.ledger), before);
  });
});

describe("persistence safety", () => {
  it("ignores malformed stored rows", () => {
    const ledger = normalizeLedger(
      { rows: [{ challengeId: "x", dayKey: "2026-09-21", xpAwarded: "nope" }, { junk: true }] },
      { stats: BASE_STATS, totalCompleted: 3 },
    );
    assert.equal(ledger.rows.length, 0);
    assert.equal(ledger.baseline.totalCompleted, 3);
    assert.deepEqual(ledger.baseline.stats, BASE_STATS);
  });
});

describe("wiring", () => {
  const context = readFileSync("src/app/context/SVJContext.tsx", "utf8");
  const view = readFileSync("src/app/views/ChallengesView.tsx", "utf8");

  it("context toggles through the ledger and persists rows", () => {
    assert.match(context, /toggleTaskCompletion\(ledger, \{/);
    assert.match(context, /_task_completions/);
    assert.match(context, /deriveHabitCompletionRate\(/);
    assert.match(context, /deriveTotalCompleted\(/);
    assert.match(
      context,
      /currentStreak: Math\.max\(0, previous\.currentStreak \+ outcome\.streakDelta\)/,
    );
  });

  it("personalized (server) tasks cannot be locally uncompleted", () => {
    assert.match(context, /Server-assigned tasks can only be completed, not undone\./);
  });

  it("the checkbox is the only undo affordance", () => {
    assert.match(view, /Only today's tasks can be undone|Uncheck to undo today's completion/);
    assert.match(view, /if \(challenge\.completed\) return;/);
  });
});
