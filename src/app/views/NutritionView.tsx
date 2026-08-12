import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Apple, Plus, Trash2, Flame, Target, CalendarDays, Check } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { MealEntry } from "../types";

const MEAL_TYPES: MealEntry["mealType"][] = ["Breakfast", "Lunch", "Dinner", "Snack"];

export const NutritionView: React.FC = () => {
  const { meals, calorieGoal, logMeal, deleteMeal, setCalorieGoal } = useSVJ();

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [mealType, setMealType] = useState<MealEntry["mealType"]>("Breakfast");
  const [goalDraft, setGoalDraft] = useState(String(calorieGoal));
  const [editingGoal, setEditingGoal] = useState(false);

  const todayKey = new Date().toDateString();

  const todayMeals = useMemo(
    () => meals.filter((m) => new Date(m.date).toDateString() === todayKey),
    [meals, todayKey],
  );

  const todayTotal = todayMeals.reduce((sum, m) => sum + m.calories, 0);
  const pct = Math.min(100, Math.round((todayTotal / Math.max(1, calorieGoal)) * 100));
  const loggedToday = todayMeals.length > 0;

  // Last 7 days history (most recent first)
  const history = useMemo(() => {
    const days: { label: string; key: string; total: number; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const dayMeals = meals.filter((m) => new Date(m.date).toDateString() === key);
      days.push({
        label: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
        key,
        total: dayMeals.reduce((s, m) => s + m.calories, 0),
        count: dayMeals.length,
      });
    }
    return days;
  }, [meals]);

  const loggingStreak = useMemo(() => {
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const has = meals.some((m) => new Date(m.date).toDateString() === d.toDateString());
      if (has) streak++;
      else if (i > 0) break;
    }
    return streak;
  }, [meals]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || !kcal || kcal <= 0) return;
    logMeal(name, kcal, mealType);
    setName("");
    setCalories("");
  };

  const saveGoal = () => {
    setCalorieGoal(parseInt(goalDraft, 10));
    setEditingGoal(false);
  };

  return (
    <div className="pb-32 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 flex items-center justify-center">
          <Apple className="w-5 h-5 text-[#C81E3A]" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#F4F2ED]">Nutrition</h1>
          <p className="text-xs text-[#8C8C90]">Log your intake. Consistency earns XP.</p>
        </div>
      </div>

      {/* Daily total ring / bar */}
      <div className="rounded-2xl bg-[#141416] border border-white/10 p-5">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-[#8C8C90] mb-1">Today</p>
            <p className="text-4xl font-bold text-[#F4F2ED] leading-none">
              {todayTotal.toLocaleString()}
              <span className="text-sm font-medium text-[#8C8C90] ml-1.5">kcal</span>
            </p>
          </div>

          <div className="text-right">
            {editingGoal ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-24 bg-[#0B0B0C] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-[#F4F2ED] focus:outline-none focus:border-[#C81E3A]"
                />
                <button
                  onClick={saveGoal}
                  className="p-1.5 rounded-lg bg-[#C81E3A] text-white hover:bg-[#A8172F] transition-colors"
                  aria-label="Save calorie goal"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setGoalDraft(String(calorieGoal));
                  setEditingGoal(true);
                }}
                className="flex items-center gap-1.5 text-sm text-[#8C8C90] hover:text-[#F4F2ED] transition-colors"
              >
                <Target className="w-4 h-4" />
                Goal {calorieGoal.toLocaleString()}
              </button>
            )}
            <p className="text-[11px] text-[#8C8C90] mt-1">
              {Math.max(0, calorieGoal - todayTotal).toLocaleString()} kcal left
            </p>
          </div>
        </div>

        <div className="h-2.5 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`h-full rounded-full ${todayTotal > calorieGoal ? "bg-[#E4B44C]" : "bg-gradient-to-r from-[#8C1327] to-[#C81E3A]"}`}
          />
        </div>

        <div className="flex items-center justify-between mt-3 text-[11px] text-[#8C8C90]">
          <span>
            {todayMeals.length} item{todayMeals.length === 1 ? "" : "s"} logged
          </span>
          <span className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-[#C81E3A]" />
            {loggingStreak} day logging streak
          </span>
        </div>
      </div>

      {/* Add entry */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-[#141416] border border-white/10 p-5 space-y-3"
      >
        <p className="text-[11px] uppercase tracking-widest text-[#8C8C90]">Add food</p>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grilled chicken & rice"
            className="flex-1 bg-[#0B0B0C] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-[#F4F2ED] placeholder:text-[#5C5C60] focus:outline-none focus:border-[#C81E3A]"
          />
          <input
            type="number"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="kcal"
            className="w-24 bg-[#0B0B0C] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-[#F4F2ED] placeholder:text-[#5C5C60] focus:outline-none focus:border-[#C81E3A]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMealType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                mealType === t
                  ? "bg-[#C81E3A]/15 border-[#C81E3A]/50 text-[#F4F2ED]"
                  : "bg-transparent border-white/10 text-[#8C8C90] hover:text-[#F4F2ED]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C81E3A] hover:bg-[#A8172F] transition-colors py-3 text-sm font-semibold text-white disabled:opacity-40"
          disabled={!name.trim() || !parseInt(calories, 10)}
        >
          <Plus className="w-4 h-4" />
          Log meal {!loggedToday && <span className="text-white/80">· +60 XP</span>}
        </button>

        <p className="text-[11px] text-[#8C8C90] text-center">
          First log each day: <span className="text-[#C81E3A] font-medium">+60 XP</span>, Discipline
          +2, Physical +1. Extra entries +10 XP.
        </p>
      </form>

      {/* Today's entries */}
      <div className="rounded-2xl bg-[#141416] border border-white/10 p-5">
        <p className="text-[11px] uppercase tracking-widest text-[#8C8C90] mb-3">
          Today&apos;s log
        </p>

        {todayMeals.length === 0 ? (
          <p className="text-sm text-[#5C5C60] py-4 text-center">Nothing logged yet today.</p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {todayMeals.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 rounded-xl bg-[#0B0B0C] border border-white/10 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F4F2ED] truncate">{m.name}</p>
                    <p className="text-[11px] text-[#8C8C90]">
                      {m.mealType} ·{" "}
                      {new Date(m.date).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[#F4F2ED] whitespace-nowrap">
                    {m.calories.toLocaleString()}
                    <span className="text-[11px] text-[#8C8C90] ml-1">kcal</span>
                  </span>
                  <button
                    onClick={() => deleteMeal(m.id)}
                    className="p-1.5 rounded-lg text-[#8C8C90] hover:text-[#C81E3A] hover:bg-[#C81E3A]/10 transition-colors"
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 7-day history */}
      <div className="rounded-2xl bg-[#141416] border border-white/10 p-5">
        <p className="text-[11px] uppercase tracking-widest text-[#8C8C90] mb-4 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" /> Last 7 days
        </p>

        <div className="flex items-end justify-between gap-2 h-28">
          {[...history].reverse().map((day) => {
            const max = Math.max(calorieGoal, ...history.map((h) => h.total), 1);
            const h = Math.round((day.total / max) * 100);
            return (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex-1 flex items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(day.total > 0 ? 6 : 2, h)}%` }}
                    className={`w-full rounded-t-md ${
                      day.count > 0 ? "bg-gradient-to-t from-[#8C1327] to-[#C81E3A]" : "bg-white/5"
                    }`}
                  />
                </div>
                <span className="text-[10px] text-[#8C8C90]">{day.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
