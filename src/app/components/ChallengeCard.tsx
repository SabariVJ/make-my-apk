import React from "react";
import { Check, Loader2, Lock, Pencil, X } from "lucide-react";
import type { DailyChallenge } from "../types";
import { formatCompletedAt } from "../lib/dateFormat";
import {
  categoryColor,
  difficultyMeta,
  getChallengeVisualState,
  type ChallengeVisualState,
} from "../lib/challengeUI";

/**
 * SVJ ChallengeCard — one challenge row in the daily hierarchy.
 *
 * Communicates category (semantic attribute color rail), title, difficulty,
 * progress, completion state, XP value and duration — all driven by real
 * challenge data. Every state is visually distinct AND labeled/icon-backed,
 * so meaning is never color-only.
 */
interface ChallengeCardProps {
  challenge: DailyChallenge;
  /** True while this challenge's completion RPC is in flight. */
  pending?: boolean;
  /** View-level predicate: completed + not reversible today (read-only history). */
  completionLocked?: boolean;
  /** True when the answer to "what should I do first" resolves to this card. */
  isPrimary?: boolean;
  onToggle: (challenge: DailyChallenge) => void;
  onEdit?: (challenge: DailyChallenge) => void;
  onRemove?: (challenge: DailyChallenge) => void;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  challenge,
  pending = false,
  completionLocked = false,
  isPrimary = false,
  onToggle,
  onEdit,
  onRemove,
}) => {
  const state: ChallengeVisualState = getChallengeVisualState(challenge, pending, completionLocked);
  const categoryHex = categoryColor(challenge.category);
  const difficulty = difficultyMeta(challenge.difficulty);
  const earned = challenge.earnedXP ?? challenge.xp;
  const completedAt = formatCompletedAt(challenge.completedAt);

  const staticBorders: Record<Exclude<ChallengeVisualState, "completing">, string> = {
    available: "border-white/[0.06] hover:border-white/[0.16] transition-colors",
    completed: "border-white/[0.06]",
    locked: "border-white/[0.04]",
  };
  const borderClass = state === "completing" ? "border-svj-crimson/40" : staticBorders[state];
  // Category-colored border for the primary card (runtime hex → inline style).
  const primaryBorder =
    isPrimary && state === "available" ? { borderColor: `${categoryHex}66` } : undefined;

  return (
    <article
      aria-label={`${challenge.title}${state === "locked" ? ", locked" : ""}${
        state === "completed" ? ", completed" : ""
      }`}
      className={`relative overflow-hidden rounded-2xl border bg-svj-surface px-4 py-3.5 ${borderClass} ${
        state === "completed" ? "opacity-80" : ""
      }`}
      style={primaryBorder}
    >
      {/* Single semantic color rail — category color, never decoration. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] rounded-r-full"
        style={{ backgroundColor: categoryHex }}
      />

      <div className="flex items-start gap-3 pl-1.5">
        {/* Primary action — 44px target; states are icon + label, never color-only. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={challenge.completed}
          aria-busy={pending}
          aria-label={`${challenge.completed ? "Uncomplete" : "Complete"} ${challenge.title}${
            state === "locked" ? " — locked" : ""
          }`}
          title={
            state === "locked"
              ? "This completion can't be undone — only today's tasks are reversible."
              : challenge.completed
                ? "Uncheck to undo today's completion"
                : undefined
          }
          disabled={pending || state === "locked"}
          onClick={() => onToggle(challenge)}
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
              challenge.completed
                ? "border-svj-crimson bg-svj-crimson text-white"
                : "border-white/25 hover:border-svj-crimson/70"
            }`}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/80" aria-hidden="true" />
            ) : challenge.completed ? (
              state === "locked" ? (
                <Lock className="h-3 w-3 text-white/80" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              )
            ) : null}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          {/* Category + difficulty — semantic color + compact chips. */}
          <div className="flex items-center gap-2">
            <span
              className="font-inter text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: categoryHex }}
            >
              {challenge.category}
            </span>
            <span
              className={`rounded border px-1.5 py-px font-inter text-[9px] font-semibold uppercase tracking-wide ${difficulty.tile} ${difficulty.text}`}
            >
              {difficulty.label}
            </span>
            {isPrimary && state === "available" && (
              <span className="rounded bg-svj-crimson px-1.5 py-px font-inter text-[9px] font-bold uppercase tracking-wide text-white">
                Today's focus
              </span>
            )}
          </div>

          <h3
            className={`mt-1 font-inter text-sm font-semibold leading-snug ${
              challenge.completed ? "text-svj-secondary" : "text-svj-text"
            }`}
          >
            {challenge.title}
          </h3>

          {challenge.description && (
            <p className="mt-0.5 line-clamp-1 font-inter text-xs leading-relaxed text-svj-secondary">
              {challenge.description}
            </p>
          )}

          {/* Meta row — duration + completion time left, XP + row actions right. */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 font-inter text-[11px] text-svj-secondary">
              {challenge.durationMinutes > 0 && (
                <span className="whitespace-nowrap tabular-nums">
                  ~{challenge.durationMinutes} min
                </span>
              )}
              {state === "completed" && completedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{completedAt}</span>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  challenge.completed
                    ? "bg-svj-crimson/10 text-svj-crimson"
                    : "bg-white/[0.04] text-svj-text"
                }`}
              >
                +{earned} XP
              </span>
              {onEdit && challenge.isCustom && (
                <button
                  type="button"
                  onClick={() => onEdit(challenge)}
                  aria-label={`Edit ${challenge.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-svj-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {onRemove && !challenge.isPersonalized && (
                <button
                  type="button"
                  onClick={() => onRemove(challenge)}
                  aria-label={`Remove ${challenge.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-svj-secondary transition-colors hover:bg-svj-crimson/10 hover:text-svj-crimson"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
