// Phase 6 — the pure Recovery records client model.
//
// These are formatting/normalization rules only: the record VALUES are derived
// by the server (tests/recovery-records-db.test.mjs proves the SQL). Here we
// pin the display contract: exactly four record types in display order, a real
// 0 is data, an absent record is never rendered as 0, and server dates never
// shift into a neighbouring local day.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_RECORD_LABELS,
  RECOVERY_RECORD_TYPES,
  formatRecoveryRecordDate,
  formatRecoveryRecordRange,
  formatRecoveryRecordValue,
  isServerDate,
  normalizeRecoveryRecord,
  normalizeRecoveryRecords,
  orderRecoveryRecords,
  recoveryRecordDateLabel,
  recoveryRecordRangeLabel,
  recoveryRecordValueSpoken,
  type RecoveryRecordDto,
} from "./recoveryRecords";
import { TRAINING_RECORD_TYPES } from "./goalsRecords";

const record = (overrides: Partial<RecoveryRecordDto> = {}): RecoveryRecordDto => ({
  recordType: "highest_readiness_score",
  value: 84,
  achievedDate: "2026-09-10",
  startDate: null,
  ...overrides,
});

/** The raw shape the RPC returns to the client. */
const rawRecord = (overrides: Record<string, unknown> = {}) => ({
  record_type: "highest_readiness_score",
  value: 84,
  achieved_date: "2026-09-10",
  start_date: null,
  ...overrides,
});

describe("Recovery record registry", () => {
  it("holds exactly the four locked record types, in display order", () => {
    assert.deepEqual(
      [...RECOVERY_RECORD_TYPES],
      [
        "highest_readiness_score",
        "longest_checkin_streak",
        "longest_ready_streak",
        "best_7d_readiness_average",
      ],
    );
  });

  it("labels every record without competition language", () => {
    assert.deepEqual(RECOVERY_RECORD_LABELS, {
      highest_readiness_score: "Highest Readiness",
      longest_checkin_streak: "Longest Check-in Streak",
      longest_ready_streak: "Longest Ready Streak",
      best_7d_readiness_average: "Best 7-Day Readiness",
    });
    for (const label of Object.values(RECOVERY_RECORD_LABELS)) {
      assert.doesNotMatch(label, /elite|top \d|world class|better than/i);
    }
  });

  it("never mixes Recovery records into the Training record group", () => {
    for (const type of RECOVERY_RECORD_TYPES) {
      assert.equal(
        (TRAINING_RECORD_TYPES as readonly string[]).includes(type),
        false,
        `${type} must not be a Training record type`,
      );
    }
    for (const type of TRAINING_RECORD_TYPES) {
      assert.equal((RECOVERY_RECORD_TYPES as readonly string[]).includes(type), false);
    }
  });
});

describe("server envelope normalization", () => {
  it("keeps a real 0 as data instead of treating it as missing", () => {
    const normalized = normalizeRecoveryRecord(rawRecord({ value: 0 }));
    assert.equal(normalized?.value, 0);
    assert.equal(normalized?.recordType, "highest_readiness_score");
    assert.equal(formatRecoveryRecordValue("highest_readiness_score", 0), "0 / 100");
  });

  it("drops structurally broken rows rather than inventing values", () => {
    assert.equal(normalizeRecoveryRecord(rawRecord({ record_type: "unknown_record" })), null);
    assert.equal(normalizeRecoveryRecord(rawRecord({ value: null })), null);
    assert.equal(normalizeRecoveryRecord(rawRecord({ value: Number.NaN })), null);
    assert.equal(normalizeRecoveryRecord(rawRecord({ achieved_date: "not-a-date" })), null);
    assert.equal(normalizeRecoveryRecord(null), null);
  });

  it("keeps a valid range start and ignores a broken one", () => {
    assert.equal(
      normalizeRecoveryRecord(
        rawRecord({ record_type: "longest_checkin_streak", start_date: "2026-09-04" }),
      )?.startDate,
      "2026-09-04",
    );
    assert.equal(normalizeRecoveryRecord(rawRecord({ start_date: "nope" }))?.startDate, null);
    assert.equal(isServerDate("2026-9-4"), false);
    assert.equal(isServerDate("2026-09-04"), true);
  });

  it("rejects an unreadable envelope so the section can fail honestly", () => {
    assert.equal(normalizeRecoveryRecords(null), null);
    assert.equal(normalizeRecoveryRecords({ ok: false, records: [] }), null);
    assert.equal(normalizeRecoveryRecords({ ok: true, records: "nope" }), null);
  });

  it("normalizes the whole list and keeps the canonical order", () => {
    const records = normalizeRecoveryRecords({
      ok: true,
      records: [
        rawRecord({
          record_type: "best_7d_readiness_average",
          value: 76,
          start_date: "2026-09-04",
        }),
        rawRecord(),
        rawRecord({ record_type: "longest_checkin_streak", value: 6, achieved_date: "2026-09-12" }),
        rawRecord({ record_type: "longest_ready_streak", value: 3, achieved_date: "2026-09-12" }),
      ],
    });
    assert.equal(records?.length, 4);
    assert.deepEqual(
      orderRecoveryRecords(records ?? []).map((item) => item.recordType),
      [...RECOVERY_RECORD_TYPES],
    );
    // An empty server list stays empty — nothing is synthesized.
    assert.deepEqual(normalizeRecoveryRecords({ ok: true, records: [] }), []);
    assert.deepEqual(orderRecoveryRecords([]), []);
  });
});

describe("display formatting", () => {
  it("formats each value with its own unit", () => {
    assert.equal(formatRecoveryRecordValue("highest_readiness_score", 84), "84 / 100");
    assert.equal(formatRecoveryRecordValue("longest_checkin_streak", 1), "1 day");
    assert.equal(formatRecoveryRecordValue("longest_checkin_streak", 6), "6 days");
    assert.equal(formatRecoveryRecordValue("longest_ready_streak", 6), "6 days");
    assert.equal(formatRecoveryRecordValue("best_7d_readiness_average", 76), "76 avg");
    // Display rounding only: the server keeps SUM(score)/7.0 at full precision.
    assert.equal(formatRecoveryRecordValue("best_7d_readiness_average", 75.5714285), "76 avg");
  });

  it("speaks values in words for screen readers", () => {
    assert.equal(recoveryRecordValueSpoken("highest_readiness_score", 84), "84 out of 100");
    assert.equal(recoveryRecordValueSpoken("longest_checkin_streak", 1), "1 day in a row");
    assert.equal(recoveryRecordValueSpoken("longest_ready_streak", 6), "6 days in a row");
    assert.equal(
      recoveryRecordValueSpoken("best_7d_readiness_average", 76),
      "76 average readiness",
    );
  });

  it("formats server dates without shifting them into another local day", () => {
    assert.equal(formatRecoveryRecordDate("2026-09-10"), "10 September 2026");
    assert.equal(formatRecoveryRecordDate("2026-01-01"), "1 January 2026");
    // An unparseable value is echoed, never silently dropped.
    assert.equal(formatRecoveryRecordDate("soon"), "soon");
  });

  it("formats streak and window ranges", () => {
    assert.equal(formatRecoveryRecordRange("2026-09-07", "2026-09-13"), "7–13 September 2026");
    assert.equal(
      formatRecoveryRecordRange("2026-08-30", "2026-09-05"),
      "30 August – 5 September 2026",
    );
    assert.equal(
      formatRecoveryRecordRange("2025-12-30", "2026-01-05"),
      "30 December 2025 – 5 January 2026",
    );
    assert.equal(formatRecoveryRecordRange("nope", "2026-09-13"), "");
  });

  it("labels the achieved day and the covered range", () => {
    assert.equal(
      recoveryRecordDateLabel(record({ achievedDate: "2026-09-10" })),
      "Achieved 10 September 2026",
    );
    assert.equal(
      recoveryRecordDateLabel(
        record({ recordType: "longest_ready_streak", achievedDate: "2026-09-13" }),
      ),
      "Ended 13 September 2026",
    );
    assert.equal(recoveryRecordRangeLabel(record()), null);
    assert.equal(
      recoveryRecordRangeLabel(
        record({
          recordType: "best_7d_readiness_average",
          startDate: "2026-09-07",
          achievedDate: "2026-09-13",
        }),
      ),
      "7–13 September 2026",
    );
    assert.equal(
      recoveryRecordRangeLabel(
        record({ recordType: "longest_checkin_streak", startDate: "2026-09-10" }),
      ),
      null,
      "a one-day streak has no range",
    );
  });
});
