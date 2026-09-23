import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Check,
  Flame,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Sparkles,
  Target,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { BodyProfileView } from "./BodyProfileView";
import {
  analyzeMealPhoto,
  deleteNutritionMeal,
  getNutritionDashboard,
  saveNutritionMeal,
  saveNutritionTargets,
  type NutritionDashboard,
  type NutritionItemInput,
  type NutritionMeal,
  type NutritionMealType,
  type NutritionPhotoEstimate,
  type NutritionTargets,
} from "@/lib/nutrition.functions";

const MEAL_TYPES: NutritionMealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<NutritionMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function dayKeyLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inferMealType(date = new Date()): NutritionMealType {
  const hour = date.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function totals(items: NutritionItemInput[]) {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories || 0),
      proteinG: sum.proteinG + Number(item.proteinG || 0),
      carbsG: sum.carbsG + Number(item.carbsG || 0),
      fatG: sum.fatG + Number(item.fatG || 0),
      fiberG: sum.fiberG + Number(item.fiberG || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

async function compressMealPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be opened."));
      img.src = objectUrl;
    });

    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Photo processing is unavailable on this device.");
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function MacroCard({
  label,
  value,
  target,
  unit = "g",
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#101012] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]">{label}</span>
        <span className="text-[10px] font-mono text-[#8C8C90]">{pct}%</span>
      </div>
      <p className="mt-1 font-anton text-lg text-[#F4F2ED]">
        {Math.round(value)}
        <span className="ml-1 text-[10px] font-inter text-[#8C8C90]">/ {Math.round(target)} {unit}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/60">
        <div className="h-full rounded-full bg-[#C81E3A]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MealTypePicker({
  value,
  onChange,
}: {
  value: NutritionMealType;
  onChange: (value: NutritionMealType) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {MEAL_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`min-h-11 rounded-xl border px-1.5 py-2 text-[10px] font-inter font-semibold transition-colors ${
            value === type
              ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
              : "border-white/10 bg-black/30 text-[#8C8C90]"
          }`}
          aria-pressed={value === type}
        >
          {MEAL_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

export const NutritionView: React.FC = () => {
  const todayKey = dayKeyLocal();
  const [dashboard, setDashboard] = useState<NutritionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBodyProfile, setShowBodyProfile] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState<NutritionTargets | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [scanReview, setScanReview] = useState<NutritionPhotoEstimate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState<NutritionMealType>(() => inferMealType());
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  const callDashboard = useServerFn(getNutritionDashboard);
  const callSaveMeal = useServerFn(saveNutritionMeal);
  const callDeleteMeal = useServerFn(deleteNutritionMeal);
  const callSaveTargets = useServerFn(saveNutritionTargets);
  const callAnalyzePhoto = useServerFn(analyzeMealPhoto);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await callDashboard({ data: { dayKey: todayKey } });
      setDashboard(next);
      setTargetDraft(next.targets);
    } catch (error) {
      console.error("[SVJ nutrition] dashboard load failed", error);
      setLoadError("Nutrition could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [callDashboard, todayKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const daily = useMemo(() => {
    const meals = dashboard?.meals ?? [];
    return meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.calories,
        proteinG: sum.proteinG + meal.proteinG,
        carbsG: sum.carbsG + meal.carbsG,
        fatG: sum.fatG + meal.fatG,
        fiberG: sum.fiberG + meal.fiberG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    );
  }, [dashboard]);

  const caloriePct = dashboard
    ? Math.min(100, Math.round((daily.calories / Math.max(1, dashboard.targets.calories)) * 100))
    : 0;

  const grouped = useMemo(() => {
    const result: Record<NutritionMealType, NutritionMeal[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const meal of dashboard?.meals ?? []) result[meal.mealType].push(meal);
    return result;
  }, [dashboard]);

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setScanError(null);
    setScanReview(null);
    try {
      const dataUrl = await compressMealPhoto(file);
      setPhotoPreview(dataUrl);
      const result = await callAnalyzePhoto({
        data: {
          imageDataUrl: dataUrl,
          mealTypeHint: inferMealType(),
          dayKey: todayKey,
        },
      });
      setScanReview(result);
    } catch (error) {
      console.error("[SVJ nutrition] meal scan failed", error);
      setScanError(error instanceof Error ? error.message : "Meal scanning failed. Use manual logging.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const patchReviewItem = (index: number, patch: Partial<NutritionItemInput>) => {
    setScanReview((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          }
        : prev,
    );
  };

  const saveScannedMeal = async () => {
    if (!scanReview) return;
    setBusy(true);
    setScanError(null);
    try {
      await callSaveMeal({
        data: {
          dayKey: todayKey,
          eatenAt: new Date().toISOString(),
          mealType: scanReview.mealType,
          name: scanReview.mealName,
          source: "photo_ai",
          confidence: scanReview.confidence,
          notes: scanReview.note,
          items: scanReview.items,
        },
      });
      setScanReview(null);
      setPhotoPreview(null);
      await refresh();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not save this meal.");
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async (event: React.FormEvent) => {
    event.preventDefault();
    const calories = Number(manualCalories);
    if (!manualName.trim() || !Number.isFinite(calories) || calories <= 0) return;
    setBusy(true);
    setScanError(null);
    try {
      await callSaveMeal({
        data: {
          dayKey: todayKey,
          eatenAt: new Date().toISOString(),
          mealType: manualType,
          name: manualName.trim(),
          source: "manual",
          items: [
            {
              name: manualName.trim(),
              servingLabel: "manual entry",
              calories,
              proteinG: Number(manualProtein) || 0,
              carbsG: Number(manualCarbs) || 0,
              fatG: Number(manualFat) || 0,
              fiberG: 0,
              confidence: null,
            },
          ],
        },
      });
      setManualName("");
      setManualCalories("");
      setManualProtein("");
      setManualCarbs("");
      setManualFat("");
      setShowManual(false);
      await refresh();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not save this meal.");
    } finally {
      setBusy(false);
    }
  };

  const removeMeal = async (mealId: string) => {
    setBusy(true);
    try {
      await callDeleteMeal({ data: { mealId } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const repeatMeal = async (meal: NutritionMeal) => {
    setBusy(true);
    setScanError(null);
    try {
      await callSaveMeal({
        data: {
          dayKey: todayKey,
          eatenAt: new Date().toISOString(),
          mealType: meal.mealType,
          name: meal.name,
          source: "repeat",
          items: meal.items,
          notes: "Repeated from a previous saved meal.",
        },
      });
      await refresh();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not repeat this meal.");
    } finally {
      setBusy(false);
    }
  };

  const saveTargets = async () => {
    if (!targetDraft) return;
    setBusy(true);
    try {
      await callSaveTargets({
        data: {
          calories: targetDraft.calories,
          proteinG: targetDraft.proteinG,
          carbsG: targetDraft.carbsG,
          fatG: targetDraft.fatG,
          fiberG: targetDraft.fiberG,
          waterMl: targetDraft.waterMl,
        },
      });
      setEditingTargets(false);
      await refresh();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not save nutrition targets.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#8C8C90]">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading Fuel…
      </div>
    );
  }

  if (!dashboard || loadError) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#17171A] p-5 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-[#C81E3A]" />
        <p className="mt-2 font-anton text-sm uppercase text-white">Fuel needs a connection</p>
        <p className="mt-1 text-xs text-[#8C8C90]">{loadError ?? "Nutrition data is unavailable."}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          className="mt-4 rounded-xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const reviewedTotals = scanReview ? totals(scanReview.items) : null;

  return (
    <div className="space-y-4 pb-32">
      <header className="flex items-center justify-between gap-3 pt-1">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-inter uppercase tracking-[0.2em] text-[#C81E3A]">
            <Utensils className="h-3.5 w-3.5" /> Fuel
          </p>
          <h1 className="font-anton text-2xl uppercase text-[#F4F2ED]">Nutrition</h1>
          <p className="text-xs text-[#8C8C90]">Scan, review and track what you actually eat.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowBodyProfile(true)}
          className="rounded-xl border border-white/10 bg-[#17171A] p-2.5 text-[#B8B8C0]"
          aria-label="Body profile and nutrition goals"
        >
          <Scale className="h-5 w-5" />
        </button>
      </header>

      <section className="rounded-2xl border border-white/[0.06] bg-[#17171A] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]">Today</p>
            <p className="mt-1 font-anton text-4xl leading-none text-[#F4F2ED]">
              {Math.round(daily.calories).toLocaleString()}
              <span className="ml-1.5 text-sm font-inter text-[#8C8C90]">kcal</span>
            </p>
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={() => setEditingTargets((value) => !value)}
              className="inline-flex items-center gap-1.5 text-xs text-[#B8B8C0]"
            >
              <Target className="h-4 w-4" /> {dashboard.targets.calories.toLocaleString()} target
            </button>
            <p className="mt-1 text-[10px] text-[#8C8C90]">
              {Math.max(0, Math.round(dashboard.targets.calories - daily.calories)).toLocaleString()} kcal left
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${caloriePct}%` }}
            className="h-full rounded-full bg-gradient-to-r from-[#8C1327] to-[#C81E3A]"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MacroCard label="Protein" value={daily.proteinG} target={dashboard.targets.proteinG} />
          <MacroCard label="Carbs" value={daily.carbsG} target={dashboard.targets.carbsG} />
          <MacroCard label="Fat" value={daily.fatG} target={dashboard.targets.fatG} />
        </div>
      </section>

      {editingTargets && targetDraft && (
        <section className="rounded-2xl border border-[#C81E3A]/20 bg-[#17171A] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-anton text-sm uppercase text-white">Daily targets</p>
              <p className="text-[10px] text-[#8C8C90]">
                Starts from your Body Profile estimate; you can override it here.
              </p>
            </div>
            <button type="button" onClick={() => setEditingTargets(false)} aria-label="Close targets">
              <X className="h-4 w-4 text-[#8C8C90]" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["Calories", "calories"],
              ["Protein g", "proteinG"],
              ["Carbs g", "carbsG"],
              ["Fat g", "fatG"],
              ["Fiber g", "fiberG"],
              ["Water ml", "waterMl"],
            ].map(([label, key]) => (
              <label key={key} className="text-[10px] uppercase text-[#8C8C90]">
                {label}
                <input
                  type="number"
                  inputMode="decimal"
                  value={String(targetDraft[key as keyof NutritionTargets] ?? "")}
                  onChange={(e) =>
                    setTargetDraft((prev) =>
                      prev ? { ...prev, [key]: Number(e.target.value) || 0 } : prev,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#0B0B0C] px-3 text-sm text-white"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void saveTargets()}
            disabled={busy}
            className="mt-3 flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C81E3A] font-anton text-xs uppercase text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save targets
          </button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(event) => void handlePhoto(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#C81E3A] px-3 font-anton text-xs uppercase text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Scan meal
        </button>
        <button
          type="button"
          onClick={() => setShowManual((value) => !value)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#17171A] px-3 font-anton text-xs uppercase text-[#F4F2ED]"
        >
          <Plus className="h-4 w-4" /> Manual
        </button>
      </section>

      <p className="rounded-xl border border-white/[0.06] bg-[#101012] px-3 py-2 text-[10px] leading-relaxed text-[#8C8C90]">
        <Sparkles className="mr-1 inline h-3 w-3 text-[#C81E3A]" />
        Photo nutrition is an estimate, not an exact measurement. SVJ always shows a review step before saving.
        Free accounts receive 3 AI scans per day; Plus accounts receive 20. Manual logging stays available.
      </p>

      {scanError && (
        <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-950/20 p-3 text-xs text-rose-300">
          {scanError}
        </p>
      )}

      <AnimatePresence>
        {scanReview && reviewedTotals && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-[#C81E3A]/25 bg-[#17171A] p-4"
            data-testid="nutrition-scan-review"
          >
            <div className="flex items-start gap-3">
              {photoPreview ? (
                <img src={photoPreview} alt="Meal preview" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-black/30">
                  <ImageIcon className="h-5 w-5 text-[#8C8C90]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-[#C81E3A]">Review estimate</p>
                <input
                  value={scanReview.mealName}
                  onChange={(e) => setScanReview((prev) => (prev ? { ...prev, mealName: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0B0C] px-2 py-2 text-sm font-semibold text-white"
                />
                {scanReview.scanUsage && (
                  <p className="mt-1 text-[10px] text-[#8C8C90]">
                    Scan {scanReview.scanUsage.used}/{scanReview.scanUsage.limit} today
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <MealTypePicker
                value={scanReview.mealType}
                onChange={(mealType) => setScanReview((prev) => (prev ? { ...prev, mealType } : prev))}
              />
            </div>

            <div className="mt-3 space-y-2">
              {scanReview.items.map((item, index) => (
                <div key={`${index}-${item.name}`} className="rounded-xl border border-white/[0.06] bg-[#0B0B0C] p-3">
                  <div className="flex gap-2">
                    <input
                      aria-label={`Food item ${index + 1}`}
                      value={item.name}
                      onChange={(e) => patchReviewItem(index, { name: e.target.value })}
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        setScanReview((prev) =>
                          prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev,
                        )
                      }
                      className="p-1 text-[#8C8C90] hover:text-[#C81E3A]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={item.servingLabel ?? ""}
                    onChange={(e) => patchReviewItem(index, { servingLabel: e.target.value })}
                    placeholder="Portion / serving"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-[#B8B8C0]"
                  />
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {[
                      ["kcal", "calories"],
                      ["P g", "proteinG"],
                      ["C g", "carbsG"],
                      ["F g", "fatG"],
                    ].map(([label, key]) => (
                      <label key={key} className="text-[9px] uppercase text-[#8C8C90]">
                        {label}
                        <input
                          type="number"
                          inputMode="decimal"
                          value={String(item[key as keyof NutritionItemInput] ?? 0)}
                          onChange={(e) => patchReviewItem(index, { [key]: Number(e.target.value) || 0 })}
                          className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 text-xs text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-black/25 p-3 text-center">
              <div><p className="font-anton text-base text-white">{Math.round(reviewedTotals.calories)}</p><p className="text-[9px] text-[#8C8C90]">kcal</p></div>
              <div><p className="font-anton text-base text-white">{Math.round(reviewedTotals.proteinG)}</p><p className="text-[9px] text-[#8C8C90]">protein</p></div>
              <div><p className="font-anton text-base text-white">{Math.round(reviewedTotals.carbsG)}</p><p className="text-[9px] text-[#8C8C90]">carbs</p></div>
              <div><p className="font-anton text-base text-white">{Math.round(reviewedTotals.fatG)}</p><p className="text-[9px] text-[#8C8C90]">fat</p></div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#8C8C90]">{scanReview.note}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setScanReview(null);
                  setPhotoPreview(null);
                }}
                className="min-h-11 rounded-xl border border-white/10 bg-black/30 font-anton text-xs uppercase text-[#B8B8C0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveScannedMeal()}
                disabled={busy || scanReview.items.length === 0}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C81E3A] font-anton text-xs uppercase text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Save meal
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {showManual && (
        <form onSubmit={saveManual} className="rounded-2xl border border-white/[0.06] bg-[#17171A] p-4">
          <div className="flex items-center justify-between">
            <p className="font-anton text-sm uppercase text-white">Manual meal</p>
            <button type="button" onClick={() => setShowManual(false)} aria-label="Close manual meal">
              <X className="h-4 w-4 text-[#8C8C90]" />
            </button>
          </div>
          <div className="mt-3">
            <MealTypePicker value={manualType} onChange={setManualType} />
          </div>
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Meal name"
            className="mt-3 min-h-11 w-full rounded-xl px-3 py-2.5 border border-white/10 bg-[#0B0B0C] text-sm text-white"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["Calories", manualCalories, setManualCalories],
              ["Protein g", manualProtein, setManualProtein],
              ["Carbs g", manualCarbs, setManualCarbs],
              ["Fat g", manualFat, setManualFat],
            ].map(([label, value, setter]) => (
              <label key={String(label)} className="text-[10px] uppercase text-[#8C8C90]">
                {String(label)}
                <input
                  type="number"
                  inputMode="decimal"
                  value={String(value)}
                  onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#0B0B0C] px-3 text-sm text-white"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy || !manualName.trim() || !Number(manualCalories)}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] font-anton text-xs uppercase text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add meal
          </button>
        </form>
      )}

      <section className="space-y-3">
        <p className="text-[10px] font-inter uppercase tracking-[0.2em] text-[#8C8C90]">Today&apos;s meals</p>
        {MEAL_TYPES.map((type) => (
          <div key={type} className="rounded-2xl border border-white/[0.06] bg-[#17171A] p-4">
            <div className="flex items-center justify-between">
              <p className="font-anton text-sm uppercase text-white">{MEAL_LABELS[type]}</p>
              <span className="text-[10px] text-[#8C8C90]">
                {grouped[type].reduce((sum, meal) => sum + meal.calories, 0)} kcal
              </span>
            </div>
            {grouped[type].length === 0 ? (
              <p className="mt-2 text-xs text-[#5C5C60]">Nothing logged.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {grouped[type].map((meal) => (
                  <div key={meal.id} className="rounded-xl border border-white/[0.04] bg-[#0B0B0C] p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#F4F2ED]">{meal.name}</p>
                        <p className="mt-0.5 text-[10px] text-[#8C8C90]">
                          {meal.calories} kcal · P {Math.round(meal.proteinG)} · C {Math.round(meal.carbsG)} · F {Math.round(meal.fatG)}
                          {meal.aiEstimated ? " · AI estimate reviewed" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeMeal(meal.id)}
                        disabled={busy}
                        className="p-1.5 text-[#8C8C90] hover:text-[#C81E3A]"
                        aria-label={`Delete ${meal.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void repeatMeal(meal)}
                      disabled={busy}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[10px] uppercase tracking-wider text-[#8C8C90]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Log again
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[#17171A] p-4">
        <p className="flex items-center gap-1.5 font-anton text-sm uppercase text-white">
          <BarChart3 className="h-4 w-4 text-[#C81E3A]" /> Last 7 days
        </p>
        <div className="mt-4 flex h-28 items-end justify-between gap-2">
          {dashboard.history.map((day) => {
            const max = Math.max(dashboard.targets.calories, ...dashboard.history.map((row) => row.calories), 1);
            const height = Math.round((day.calories / max) * 100);
            return (
              <div key={day.dayKey} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div className="flex h-full w-full items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(day.mealCount > 0 ? 6 : 2, height)}%` }}
                    className={`w-full rounded-t-md ${
                      day.mealCount > 0 ? "bg-gradient-to-t from-[#8C1327] to-[#C81E3A]" : "bg-white/5"
                    }`}
                    title={`${day.dayKey}: ${day.calories} kcal, ${Math.round(day.proteinG)} g protein`}
                  />
                </div>
                <span className="text-[9px] text-[#8C8C90]">
                  {new Date(day.dayKey + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-[#8C8C90]">
          History uses saved meals only. SVJ does not infer meals you did not log.
        </p>
      </section>

      {showBodyProfile && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0B0C] px-4 pb-24 pt-14">
          <BodyProfileView />
          <button
            type="button"
            onClick={() => {
              setShowBodyProfile(false);
              void refresh();
            }}
            className="fixed right-4 top-4 z-50 rounded-full border border-white/10 bg-[#17171A] p-2 text-white"
            aria-label="Close body profile"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.05] bg-[#101012] p-3 text-[10px] leading-relaxed text-[#8C8C90]">
        <Flame className="mr-1 inline h-3 w-3 text-[#C81E3A]" />
        Nutrition targets and photo estimates are planning tools, not medical prescriptions. For medical dietary needs, use professional guidance.
      </div>
    </div>
  );
};
