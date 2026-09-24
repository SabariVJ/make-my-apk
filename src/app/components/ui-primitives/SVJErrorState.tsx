import React from "react";
import { TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ ErrorState — inline failure surface.
 *
 * In-app replacement for browser dialogs anywhere a request can fail.
 * Crimson iconography signals failure without shouting; one action slot for
 * the retry. Full-screen failures use the existing StatusScreen.
 */
export const SVJErrorState: React.FC<{
  icon?: LucideIcon;
  title: string;
  message: string;
  /** Retry / secondary action node (pass a Button or SVJActionCard). */
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}> = ({ icon: Icon = TriangleAlert, title, message, action, compact = false, className = "" }) => (
  <div
    role="alert"
    className={`rounded-2xl border border-svj-crimson/20 bg-svj-surface ${
      compact ? "p-3" : "p-5"
    } ${className}`}
  >
    <div className={`flex ${compact ? "gap-3 items-center" : "flex-col items-center text-center"}`}>
      <div
        className={`${
          compact ? "w-8 h-8" : "w-12 h-12 mb-3"
        } rounded-xl bg-svj-crimson/10 border border-svj-crimson/20 flex items-center justify-center shrink-0`}
      >
        <Icon
          className={compact ? "w-4 h-4" : "w-5 h-5"}
          aria-hidden="true"
          style={{ color: "#C81E3A" }}
        />
      </div>
      <div className={compact ? "min-w-0" : ""}>
        <h4 className={`svj-heading ${compact ? "text-xs" : "text-sm"} ${compact ? "" : "mb-1"}`}>
          {title}
        </h4>
        <p
          className={`text-xs text-svj-secondary leading-relaxed ${compact ? "mt-0.5" : "max-w-xs"}`}
        >
          {message}
        </p>
      </div>
    </div>
    {action && <div className={compact ? "mt-2.5" : "mt-4 flex justify-center"}>{action}</div>}
  </div>
);
