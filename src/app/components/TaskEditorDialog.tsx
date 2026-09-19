import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHALLENGE_CATEGORIES, CHALLENGE_XP, type SaveResult } from "../lib/activity";
import type { DailyChallenge } from "../types";

type TaskFields = Pick<DailyChallenge, "title" | "category" | "difficulty">;

export function TaskEditorDialog({
  open,
  task,
  onOpenChange,
  onSave,
  returnFocus,
}: {
  open: boolean;
  task: DailyChallenge | null;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: TaskFields) => SaveResult;
  returnFocus: HTMLButtonElement | null;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DailyChallenge["category"]>("Physical");
  const [difficulty, setDifficulty] = useState<DailyChallenge["difficulty"]>("Medium");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setCategory(task?.category ?? "Physical");
    setDifficulty(task?.difficulty ?? "Medium");
    setError(null);
  }, [open, task]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = onSave({ title, category, difficulty });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
  };

  const triggerClass =
    "w-full min-w-0 h-11 rounded-xl border-white/10 bg-[#0B0B0C] text-[#F4F2ED] font-mono text-xs focus:ring-[#C81E3A]";
  const menuClass =
    "z-[80] rounded-xl border-white/15 bg-[#17171A] text-[#F4F2ED] shadow-2xl font-mono";
  const itemClass =
    "min-h-10 rounded-lg text-xs focus:bg-[#C81E3A]/20 focus:text-white data-[state=checked]:text-[#F4F2ED]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%_-_2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border-white/10 bg-[#17171A] p-6 text-[#F4F2ED] shadow-2xl"
        onCloseAutoFocus={(event) => {
          if (returnFocus?.isConnected) {
            event.preventDefault();
            returnFocus.focus();
          }
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-anton text-xl uppercase tracking-wide text-white">
            {task ? "Edit Task" : "Add Custom Task"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set the title, category and difficulty for your task.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="task-title"
              className="block text-xs font-mono text-[#A6A6AD] uppercase mb-1.5"
            >
              Task title
            </label>
            <input
              id="task-title"
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Read for 20 minutes"
              className="w-full rounded-xl border border-white/10 bg-[#0B0B0C] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#C81E3A]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor="task-category"
                className="block text-xs font-mono text-[#A6A6AD] uppercase mb-1.5"
              >
                Category
              </label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as DailyChallenge["category"])}
                disabled={task?.completed}
              >
                <SelectTrigger id="task-category" className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className={menuClass}>
                  {CHALLENGE_CATEGORIES.map((value) => (
                    <SelectItem className={itemClass} key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <label
                htmlFor="task-difficulty"
                className="block text-xs font-mono text-[#A6A6AD] uppercase mb-1.5"
              >
                Difficulty
              </label>
              <Select
                value={difficulty}
                onValueChange={(value) => setDifficulty(value as DailyChallenge["difficulty"])}
                disabled={task?.completed}
              >
                <SelectTrigger id="task-difficulty" className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className={menuClass}>
                  {Object.entries(CHALLENGE_XP).map(([value, xp]) => (
                    <SelectItem className={itemClass} key={value} value={value}>
                      {value} ({xp} XP)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {task?.completed && (
            <p className="text-xs leading-relaxed text-[#A6A6AD]">
              You can rename this completed task. Mark it incomplete first to change its category or
              difficulty.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-w-0 flex-1 rounded-xl bg-[#C81E3A] px-4 py-3 font-anton uppercase tracking-wider text-white hover:bg-[#A0182E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {task ? "Save Changes" : "Add Task to Mission"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
