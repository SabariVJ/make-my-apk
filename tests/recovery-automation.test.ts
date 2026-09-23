/**
 * Phase 2 — automated recovery pipeline audit + history automation.
 *
 * Pins the audit conclusions so they cannot silently drift:
 *   - training load comes from canonical activity (real duration + type), in a
 *     trailing 7-day window, with no hardcoded/demo load;
 *   - readiness is a partial score even with no check-in (the base score is
 *     computed before the check-in branch), and the check-in refines it;
 *   - the server's history RPC now also returns the athlete's own check-in
 *     values, and its aggregate is the FIXED form (the previous
 *     `jsonb_agg(row ORDER BY row.<col> ...)` body raised
 *     `missing FROM-clause entry for table "row"` at runtime);
 *   - mergeServerHistory folds real server days into the device store without
 *     inventing a single check-in, day or trend point.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bestSleepRange,
  computeReadiness,
  emptyDayRecord,
  mergeServerHistory,
  readinessTrend,
  type RecoveryDayRecord,
  type ServerHistoryDay,
} from "../src/app/lib/recoveryInsights";
import { localDayKey } from "../src/app/lib/taskCompletions";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const foundation = read("../supabase/migrations/20260919120000_recovery_readiness.sql");
const historyMigration = read(
  "../supabase/migrations/20261003000000_recovery_history_checkin_values.sql",
);
const recoveryClient = read("../src/app/lib/recovery.ts");

// Local calendar days — the same keys the app stores and the trend derives.
const DAY = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
};

const localDay = (date: string, over: Partial<RecoveryDayRecord> = {}): RecoveryDayRecord => ({
  ...emptyDayRecord(date),
  ...over,
});

const serverDay = (date: string, over: Partial<ServerHistoryDay> = {}): ServerHistoryDay => ({
  date,
  score: 64,
  band: "low",
  recovery: "good",
  hasCheckin: false,
  sleepHours: null,
  soreness: null,
  energy: null,
  perceivedRecovery: null,
  activityLoadPoints: 0,
  restDaysLast3: null,
  ...over,
});

describe("training load uses canonical, real activity", () => {
  it("scores real duration and activity type, with no hardcoded demo load", () => {
    assert.match(foundation, /FUNCTION public\.svj_activity_load_points/);
    assert.match(foundation, /LEAST\(p_duration_seconds, 10800\)/, "3h cap per activity");
    assert.match(foundation, /WHEN 'strength' THEN 1\.3/);
    assert.match(foundation, /WHEN 'walking' THEN 0\.6/);
    assert.doesNotMatch(foundation, /\bdemo\b/i);
  });

  it("reads the trailing seven days of canonical activity on the database clock", () => {
    assert.match(foundation, /FROM public\.svj_activities a/);
    assert.match(foundation, /a\.ended_at >= now\(\) - make_interval\(days => p_days\)/);
    assert.match(foundation, /a\.ended_at < now\(\)/, "future rows never count");
    assert.match(foundation, /v_points := public\.svj_training_load_points\(p_user_id, 7\)/);
    assert.match(foundation, /svj_activity_load_points\(a\.activity_type, a\.duration_seconds\)/);
  });
});

describe("readiness is a partial score, refined by the check-in", () => {
  it("computes the base score before the check-in branch", () => {
    const base = foundation.indexOf("v_score := 70 - v_load_penalty");
    const checkin = foundation.indexOf("IF v_checkin.checkin_date IS NOT NULL THEN");
    assert.ok(base > -1 && checkin > -1, "both statements must exist");
    assert.ok(base < checkin, "the partial score must exist without any check-in");
  });

  it("mirrors that in the client: no check-in still yields a meaningful score", () => {
    const partial = computeReadiness({ activityLoadPoints: 0, taskLoadPoints: 0 });
    assert.equal(partial.score, 70);
    assert.ok(partial.score > 0);
    assert.equal(partial.recovery, "unknown");
    assert.equal(partial.isLow, false);
    assert.deepEqual(partial.components.sources, []);
  });

  it("keeps the task COUNT separate from the task load it contributes", () => {
    const result = computeReadiness({
      activityLoadPoints: 0,
      taskLoadPoints: 24,
      taskCount: 4,
    });
    assert.equal(result.components.taskCount, 4, "the count is real completed work");
    assert.equal(result.components.taskLoadPoints, 24, "the load is strain, not a count");
    assert.notEqual(result.components.taskCount, result.components.taskLoadPoints);
  });
});

describe("history RPC contract", () => {
  it("keeps the same name and signature (no client/SQL drift)", () => {
    assert.match(
      historyMigration,
      /CREATE OR REPLACE FUNCTION public\.svj_list_my_recovery_history\(\s*p_limit integer DEFAULT 30\s*\)/,
    );
    assert.match(recoveryClient, /rpc\("svj_list_my_recovery_history", \{\s*p_limit: limit,/);
  });

  it("is additive only — no table, index or policy is touched", () => {
    assert.doesNotMatch(historyMigration, /CREATE TABLE|ALTER TABLE|DROP\s|TRUNCATE|CREATE INDEX/);
  });

  it("stays server-authoritative and private", () => {
    assert.match(historyMigration, /SECURITY DEFINER/);
    assert.match(historyMigration, /SET search_path = public/);
    assert.match(historyMigration, /v_caller uuid := auth\.uid\(\)/);
    assert.match(historyMigration, /RAISE EXCEPTION 'Authentication required'/);
    assert.match(historyMigration, /ON c\.user_id = d\.user_id/);
    assert.match(historyMigration, /WHERE d\.user_id = v_caller/);
    assert.match(historyMigration, /\(c\.user_id IS NULL OR c\.user_id = v_caller\)/);
    assert.doesNotMatch(historyMigration, /p_user_id|user_id uuid/);
    assert.match(
      historyMigration,
      /REVOKE ALL ON FUNCTION public\.svj_list_my_recovery_history\(integer\)\s+FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      historyMigration,
      /GRANT EXECUTE ON FUNCTION public\.svj_list_my_recovery_history\(integer\)\s+TO authenticated/,
    );
    assert.match(historyMigration, /NOTIFY pgrst, 'reload schema'/);
  });

  it("returns the athlete's own check-in values and the real load behind each day", () => {
    for (const key of [
      "'date'",
      "'score'",
      "'trainingLoad'",
      "'recovery'",
      "'loadPoints7d'",
      "'hasCheckin'",
      "'sleepHours'",
      "'soreness'",
      "'energy'",
      "'perceivedRecovery'",
    ]) {
      assert.ok(historyMigration.includes(key), `${key} must stay in the payload`);
    }
  });

  it("uses the corrected aggregate (the old body failed at runtime)", () => {
    assert.match(historyMigration, /jsonb_agg\(s\.row ORDER BY s\.readiness_date DESC\)/);
    assert.doesNotMatch(
      historyMigration,
      /jsonb_agg\(row ORDER BY row\./,
      'jsonb_agg(row ORDER BY row.<col>) raises missing FROM-clause entry for table "row"',
    );
    assert.match(
      historyMigration,
      /FROM \(\s*SELECT\s+d\.readiness_date,\s*jsonb_build_object\(/,
      "the ordered date must be a real column of the subquery",
    );
  });
});

describe("mergeServerHistory keeps the device store honest", () => {
  it("adopts the athlete's own check-in values from the server", () => {
    const merged = mergeServerHistory(
      [localDay(DAY(0), { score: 61, checkin: { ...emptyDayRecord(DAY(0)).checkin } })],
      [
        serverDay(DAY(0), {
          hasCheckin: true,
          sleepHours: 7.5,
          soreness: 2,
          energy: 4,
          perceivedRecovery: 4,
        }),
      ],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].checkin.sleepHours, 7.5);
    assert.equal(merged[0].checkin.soreness, 2);
    assert.equal(merged[0].checkin.energy, 4);
    assert.equal(merged[0].checkin.perceivedRecovery, 4);
  });

  it("never invents a check-in the server does not have", () => {
    const merged = mergeServerHistory(
      [],
      [serverDay(DAY(-1), { hasCheckin: false, score: 70, activityLoadPoints: 44 })],
    );
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].checkin, emptyDayRecord(DAY(-1)).checkin);
    // A server-only day still carries the real recorded load and score.
    assert.equal(merged[0].activityLoadPoints, 44);
    assert.equal(merged[0].totalLoadPoints, 44);
    assert.equal(merged[0].score, 70);
    assert.equal(merged[0].band, "low");
    assert.equal(merged[0].recovery, "good");
  });

  it("keeps this device's richer score for a day it already scored", () => {
    const merged = mergeServerHistory(
      [
        localDay(DAY(-1), {
          score: 58,
          band: "moderate",
          totalLoadPoints: 210,
          taskLoadPoints: 60,
          taskCount: 6,
          activityLoadPoints: 150,
        }),
      ],
      [serverDay(DAY(-1), { score: 70, band: "low", activityLoadPoints: 150 })],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].score, 58, "the locally scored day was computed with the task ledger");
    assert.equal(merged[0].band, "moderate");
    assert.equal(merged[0].taskCount, 6);
  });

  it("backfills a missing recorded load without touching the score", () => {
    const merged = mergeServerHistory(
      [localDay(DAY(0), { score: 61, activityLoadPoints: 0 })],
      [serverDay(DAY(0), { score: 61, activityLoadPoints: 78 })],
    );
    assert.equal(merged[0].activityLoadPoints, 78);
    assert.equal(merged[0].score, 61);
  });

  it("only touches days the server actually returned", () => {
    const only = localDay(DAY(-5), { score: 55 });
    const merged = mergeServerHistory([only], [serverDay(DAY(-1))]);
    assert.deepEqual(
      merged.map((row) => row.date),
      [DAY(-5), DAY(-1)],
    );
    assert.equal(merged.find((row) => row.date === DAY(-5))?.score, 55);
  });

  it("ignores malformed rows instead of creating fake days", () => {
    const merged = mergeServerHistory(
      [],
      [
        serverDay(""),
        { ...(serverDay(DAY(0)) as ServerHistoryDay), date: undefined as unknown as string },
      ],
    );
    assert.deepEqual(merged, []);
  });

  it("sorts and de-duplicates by day", () => {
    const merged = mergeServerHistory(
      [],
      [
        serverDay(DAY(0), { score: 64 }),
        serverDay(DAY(-2), { score: 71 }),
        serverDay(DAY(0), { score: 66 }),
      ],
    );
    assert.deepEqual(
      merged.map((row) => row.date),
      [DAY(-2), DAY(0)],
    );
    assert.equal(merged[1].score, 66, "the newest server value wins for the day");
  });
});

describe("best sleep derives from real logged history only", () => {
  const night = (offset: number, sleep: number, energy: number): RecoveryDayRecord => ({
    ...emptyDayRecord(DAY(offset)),
    score: 70,
    checkin: { sleepHours: sleep, soreness: null, energy, perceivedRecovery: null },
  });

  it("stays honest until enough nights are paired", () => {
    const merged = mergeServerHistory(
      [],
      [
        serverDay(DAY(-2), { hasCheckin: true, sleepHours: 7.5, energy: null }),
        serverDay(DAY(-1), { hasCheckin: true, sleepHours: 7.5, energy: null }),
      ],
    );
    const sleep = bestSleepRange(merged);
    assert.equal(sleep.insufficientData, true);
    assert.equal(sleep.bestRangeLabel, null, "no range may be claimed without evidence");
    assert.equal(sleep.best, null);
  });

  it("uses server-backed nights once the evidence exists", () => {
    // Three nights from the server (a reinstalled device has no local history)
    // whose next day carries a real derived score.
    const serverNights: ServerHistoryDay[] = [
      serverDay(DAY(-4), {
        hasCheckin: true,
        sleepHours: 7.5,
        energy: 5,
        score: 80,
      }),
      serverDay(DAY(-3), {
        hasCheckin: true,
        sleepHours: 7.5,
        energy: 5,
        score: 78,
      }),
      serverDay(DAY(-2), {
        hasCheckin: true,
        sleepHours: 5,
        energy: 1,
        score: 41,
      }),
      serverDay(DAY(-1), { hasCheckin: false, score: 70 }),
    ];
    const merged = mergeServerHistory([], serverNights);
    const sleep = bestSleepRange(merged);
    assert.equal(sleep.insufficientData, false);
    assert.equal(sleep.bestRangeLabel, "7.5–8 h");
    assert.equal(sleep.best?.fromHour, 7.5, "the real logged nights decide the range");
    assert.equal(sleep.best?.samples, 2);
    assert.equal(sleep.pairedDays, 3);
  });

  it("keeps locally logged nights when the server has none", () => {
    const merged = mergeServerHistory(
      [night(-3, 8, 4), night(-2, 8, 4), night(-1, 8, 4), localDay(DAY(0), { score: 72 })],
      [serverDay(DAY(-1), { hasCheckin: false })],
    );
    assert.equal(
      merged.find((row) => row.date === DAY(-1))?.checkin.sleepHours,
      8,
      "a server day without a check-in must not erase the device's own night",
    );
    assert.equal(bestSleepRange(merged).insufficientData, false);
  });
});

describe("the trend never shows fake points", () => {
  it("marks days with no data as empty instead of zero-scoring them", () => {
    const merged = mergeServerHistory([], [serverDay(DAY(-2), { score: 66, hasCheckin: false })]);
    const trend = readinessTrend(merged, 7, new Date());
    assert.equal(trend.length, 7);
    const real = trend.find((point) => point.hasData);
    assert.ok(real, "the one real day must be present");
    assert.equal(real?.score, 66);
    for (const point of trend.filter((p) => !p.hasData)) {
      assert.equal(point.score, 0);
      assert.equal(point.sleepHours, null);
    }
  });
});
