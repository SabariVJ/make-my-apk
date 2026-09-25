// SVJ Recovery V2 — Phase 6: the real Recovery → Records section.
//
// Every record is DERIVED ON THE SERVER at read time from canonical recovery
// history (svj_list_recovery_records → public.svj_readiness_daily +
// public.svj_recovery_checkins). The client can only read and format a record:
// there is no create, edit or delete path, no stored record value, and no XP,
// Discipline, Recovery stat or achievement is awarded here.
//
// Honesty rules enforced by this component:
//   - a record that does not exist yet says so — it never renders 0,
//   - a real stored score of 0 IS data and renders as 0,
//   - a failed read is a retryable error, never a fabricated record,
//   - no ranking, percentile or comparison against other members.
import React, { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Trophy } from "lucide-react";
import { SVJEmptyState } from "../ui-primitives/SVJEmptyState";
import { listMyRecoveryRecords } from "../../lib/recovery";
import {
  RECOVERY_RECORD_LABELS,
  RECOVERY_RECORD_TYPES,
  formatRecoveryRecordValue,
  orderRecoveryRecords,
  recoveryRecordDateLabel,
  recoveryRecordRangeLabel,
  recoveryRecordValueSpoken,
  type RecoveryRecordDto,
  type RecoveryRecordType,
} from "../../lib/recoveryRecords";
import { LOW_READINESS_THRESHOLD } from "../../lib/recoveryInsights";

const CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4";
const HEADING = "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]";
const CAPTION = "text-[10px] font-inter text-[#8C8C90]";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]";

/** What each record actually measures — plain language, no medical claims. */
const RECORD_EXPLANATIONS: Record<RecoveryRecordType, string> = {
  highest_readiness_score:
    "Your highest readiness score SVJ computed on a day with saved recovery data.",
  longest_checkin_streak: "Your longest run of back-to-back days with a saved recovery check-in.",
  longest_ready_streak: `Your longest run of back-to-back days at readiness ${LOW_READINESS_THRESHOLD} or above.`,
  best_7d_readiness_average:
    "Your highest average readiness across 7 straight days that all have saved readiness.",
};

/**
 * Honest "no record yet" copy per record. The ready-streak message depends on
 * whether any readiness day exists at all — an absent record is never a 0.
 */
function emptyRecordMessage(recordType: RecoveryRecordType, readinessKnown: boolean): string {
  switch (recordType) {
    case "highest_readiness_score":
      return "No readiness record yet.";
    case "longest_checkin_streak":
      return "No recovery check-in streak yet.";
    case "longest_ready_streak":
      return readinessKnown
        ? `No ${LOW_READINESS_THRESHOLD}+ readiness streak yet.`
        : "No readiness record yet.";
    case "best_7d_readiness_average":
      return "Not enough complete recovery history yet.";
  }
}

const RecordCard: React.FC<{
  recordType: RecoveryRecordType;
  record: RecoveryRecordDto | null;
  readinessKnown: boolean;
}> = ({ recordType, record, readinessKnown }) => {
  const label = RECOVERY_RECORD_LABELS[recordType];
  const range = record ? recoveryRecordRangeLabel(record) : null;
  return (
    <li
      data-testid="recovery-record-card"
      data-record-type={recordType}
      className="rounded-xl border border-white/5 bg-black/30 p-3"
    >
      <div className="flex items-start gap-2">
        <Trophy aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-inter font-semibold text-[#F4F2ED]">{label}</h3>

          {record ? (
            <>
              {/* Value is never carried by colour or icon alone: the visible
                  text is mirrored by a spoken phrase for screen readers. */}
              <p className="mt-0.5 font-mono text-xl font-bold text-[#E62846]">
                <span aria-hidden="true">
                  {formatRecoveryRecordValue(recordType, record.value)}
                </span>
                <span className="sr-only">
                  {recoveryRecordValueSpoken(recordType, record.value)}
                </span>
              </p>
              <p className={`mt-0.5 ${CAPTION}`}>
                {recoveryRecordDateLabel(record)}
                {range ? ` · ${range}` : ""}
              </p>
            </>
          ) : (
            <p
              className="mt-1 text-[11px] font-inter text-[#8C8C90]"
              data-testid="recovery-record-empty"
            >
              {emptyRecordMessage(recordType, readinessKnown)}
            </p>
          )}

          <p className={`mt-1 ${CAPTION}`}>{RECORD_EXPLANATIONS[recordType]}</p>
        </div>
      </div>
    </li>
  );
};

const RecoveryRecordsSection: React.FC = () => {
  const [records, setRecords] = useState<RecoveryRecordDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      setRecords(null);
      const result = await listMyRecoveryRecords();
      if (cancelled) return;
      if (!result.ok) {
        // Raw RPC text (PGRST…/PostgreSQL…) never reaches the user.
        setError("Recovery records are unavailable right now.");
        setRecords([]);
        return;
      }
      setRecords(result.records ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const ordered = useMemo(() => orderRecoveryRecords(records ?? []), [records]);
  const byType = useMemo(
    () => new Map(ordered.map((record) => [record.recordType, record])),
    [ordered],
  );
  // Readiness rows exist as soon as the highest-score record does (a real 0
  // included) — that is what tells an absent ready streak apart from "no data".
  const readinessKnown = byType.has("highest_readiness_score");

  return (
    <div
      role="tabpanel"
      id="recovery-panel-records"
      aria-labelledby="recovery-tab-records"
      data-testid="recovery-section-records"
    >
      <div className={CARD}>
        <h2 className={HEADING}>Recovery records</h2>
        <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">
          Your own historical bests, derived on the server from your saved check-ins and readiness
          days. They cannot be edited here and they change only when your own history does — they
          are not a ranking against other members.
        </p>

        {error ? (
          <div data-testid="recovery-records-error">
            <SVJEmptyState
              variant="error"
              compact
              title="Your records didn't load"
              description="Recovery records are derived on the server from your own saved check-ins, so they can't be calculated without a connection."
              action={
                <button
                  type="button"
                  className={BUTTON}
                  data-testid="recovery-records-retry"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                  Retry
                </button>
              }
            />
          </div>
        ) : records === null ? (
          <p
            className="mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]"
            data-testid="recovery-records-loading"
          >
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Loading your recovery records…
          </p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="recovery-records-list">
            {RECOVERY_RECORD_TYPES.map((recordType) => (
              <RecordCard
                key={recordType}
                recordType={recordType}
                record={byType.get(recordType) ?? null}
                readinessKnown={readinessKnown}
              />
            ))}
          </ul>
        )}

        {!error && records !== null && (
          <p className="mt-3 text-[10px] font-inter text-[#8C8C90]">
            Server-derived. This screen grants no points, badges or streaks.
          </p>
        )}
      </div>
    </div>
  );
};

export default RecoveryRecordsSection;
