import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Calculator, Scale, Flame, Target, Apple, Loader2, ChevronRight, Info } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import {
  saveBodyProfile,
  getBodyProfile,
  type BodyProfileData,
} from "@/lib/personalization.functions";

// ── Food suggestions by diet + goal ───────────────────────────────────────

const FOOD_SUGGESTIONS: Record<string, Record<string, { label: string; items: string[] }>> = {
  vegetarian: {
    lose_fat: {
      label: "Low-calorie, high-protein vegetarian options",
      items: [
        "Moong dal",
        "Sprouts",
        "Curd/Raita",
        "Paneer tikka (grilled)",
        "Vegetable soup",
        "Fruits (papaya, apple)",
        "Buttermilk",
        " salads with paneer",
      ],
    },
    maintain: {
      label: "Balanced vegetarian options",
      items: [
        "Chapati + dal",
        "Rice + sambar",
        "Paneer curry",
        "Curd rice",
        "Vegetable pulao",
        "Idli + sambar",
        "Dosa",
        "Poha",
      ],
    },
    gain_muscle: {
      label: "High-protein vegetarian options",
      items: [
        "Paneer bhurji",
        "Soya chunks curry",
        "Paneer tikka",
        "Rajma + rice",
        "Chana masala",
        "Sprouts salad",
        "Dal makhani",
        "Milk + banana shake",
      ],
    },
    improve_fitness: {
      label: "Performance-focused vegetarian options",
      items: [
        "Oats + nuts",
        "Banana",
        "Peanut butter toast",
        "Moong dal chilla",
        "Fruit smoothie",
        "Trail mix",
        "Sweet potato",
        "Brown rice + dal",
      ],
    },
  },
  eggetarian: {
    lose_fat: {
      label: "Low-calorie, high-protein eggetarian options",
      items: [
        "Boiled eggs (2-3)",
        "Egg white omelette",
        "Curd",
        "Sprouts",
        "Vegetable soup",
        "Fruits",
        "Buttermilk",
        "Moong dal",
      ],
    },
    maintain: {
      label: "Balanced eggetarian options",
      items: [
        "Egg curry + roti",
        "Egg bhurji + chapati",
        "Rice + dal + egg",
        "Omelette + toast",
        "Idli + egg",
        "Dosa + egg",
        "Poha + egg",
        "Curd rice + egg",
      ],
    },
    gain_muscle: {
      label: "High-protein eggetarian options",
      items: [
        "4 egg whites + 2 yolks",
        "Egg bhurji (3 eggs)",
        "Paneer + egg combo",
        "Egg curry (2 eggs)",
        "Omelette (3 eggs)",
        "Boiled eggs + sprouts",
        "Egg + milk shake",
        "Rajma + egg",
      ],
    },
    improve_fitness: {
      label: "Performance-focused eggetarian options",
      items: [
        "Oats + boiled egg",
        "Banana + egg",
        "Peanut butter + egg toast",
        "Egg + fruit smoothie",
        "Trail mix + egg",
        "Sweet potato + egg",
        "Brown rice + egg curry",
        "Sprouts + egg",
      ],
    },
  },
  non_vegetarian: {
    lose_fat: {
      label: "Low-calorie, high-protein non-veg options",
      items: [
        "Grilled chicken breast",
        "Fish curry (light)",
        "Chicken soup",
        "Boiled eggs",
        "Tandoori chicken",
        "Fish tikka",
        "Chicken salad",
        "Egg white omelette",
      ],
    },
    maintain: {
      label: "Balanced non-veg options",
      items: [
        "Chicken curry + rice",
        "Fish fry + chapati",
        "Egg curry + roti",
        "Chicken biryani (moderate)",
        "Mutton soup",
        "Grilled fish + veggies",
        "Chicken tikka + salad",
        "Prawn curry + rice",
      ],
    },
    gain_muscle: {
      label: "High-protein non-veg options",
      items: [
        "Chicken breast (200g)",
        "Fish (200g)",
        "Eggs (4-5)",
        "Mutton curry",
        "Chicken keema",
        "Tuna salad",
        "Chicken + paneer combo",
        "Fish + egg combo",
      ],
    },
    improve_fitness: {
      label: "Performance-focused non-veg options",
      items: [
        "Grilled chicken + oats",
        "Fish + sweet potato",
        "Egg + banana shake",
        "Chicken wrap",
        "Fish + brown rice",
        "Egg + peanut butter",
        "Chicken + fruit salad",
        "Lean meat + veggies",
      ],
    },
  },
  vegan: {
    lose_fat: {
      label: "Low-calorie, high-protein vegan options",
      items: [
        "Moong dal",
        "Sprouts",
        "Tofu stir-fry",
        "Vegetable soup",
        "Fruits",
        "Soya chunks",
        "Chana salad",
        "Green smoothie",
      ],
    },
    maintain: {
      label: "Balanced vegan options",
      items: [
        "Rice + dal",
        "Chapati + sabzi",
        "Soya curry",
        "Poha",
        "Idli + sambar",
        "Vegetable pulao",
        "Chana curry",
        "Peanut chutney + dosa",
      ],
    },
    gain_muscle: {
      label: "High-protein vegan options",
      items: [
        "Soya chunks (100g)",
        "Tofu bhurji",
        "Rajma + rice",
        "Chana masala",
        "Moong dal + paneer alt",
        "Peanut butter + banana",
        "Sprouts salad",
        "Soya milk + oats",
      ],
    },
    improve_fitness: {
      label: "Performance-focused vegan options",
      items: [
        "Oats + banana + peanut butter",
        "Tofu scramble",
        "Fruit smoothie + nuts",
        "Sweet potato + dal",
        "Trail mix",
        "Banana + dates",
        "Brown rice + chana",
        "Soya milk shake",
      ],
    },
  },
};

// ── BMI category colors ───────────────────────────────────────────────────

function bmiCategoryColor(cat?: string): string {
  switch (cat) {
    case "Underweight":
      return "text-blue-400";
    case "Normal":
      return "text-emerald-400";
    case "Overweight":
      return "text-amber-400";
    case "Obese":
      return "text-rose-400";
    default:
      return "text-[#8C8C90]";
  }
}

export const BodyProfileView: React.FC = () => {
  const { user } = useSVJ();
  const [profile, setProfile] = useState<BodyProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activityLevel, setActivityLevel] = useState("moderate");
  const [bodyGoal, setBodyGoal] = useState("maintain");
  const [targetWeight, setTargetWeight] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getBodyProfile({ data: undefined });
        if (data) {
          setProfile(data);
          setDob(data.dateOfBirth || "");
          setSex(data.sex || "");
          setHeight(data.heightCm?.toString() || "");
          setWeight(data.weightKg?.toString() || "");
          setActivityLevel(data.activityLevel || "moderate");
          setBodyGoal(data.bodyGoal || "maintain");
          setTargetWeight(data.targetWeightKg?.toString() || "");
        }
      } catch (e) {
        console.error("Failed to load body profile:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveBodyProfile({
        data: {
          dateOfBirth: dob || undefined,
          sex: sex || undefined,
          heightCm: height ? parseFloat(height) : undefined,
          weightKg: weight ? parseFloat(weight) : undefined,
          activityLevel,
          bodyGoal,
          targetWeightKg: targetWeight ? parseFloat(targetWeight) : undefined,
        },
      });
      setProfile(result.profile);
    } catch (e) {
      console.error("Failed to save body profile:", e);
    } finally {
      setSaving(false);
    }
  };

  const dietaryPref = "non_vegetarian"; // Could come from assessment
  const foodSuggestions = FOOD_SUGGESTIONS[dietaryPref]?.[bodyGoal];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-xs font-mono font-bold">
          <Scale className="w-3.5 h-3.5" />
          <span>Body & Nutrition</span>
        </div>
        <h1 className="font-anton text-2xl text-white uppercase tracking-wide">
          Your Body Profile
        </h1>
        <p className="text-xs text-[#8C8C90] font-inter">
          Calculate BMI, calorie needs, and get food suggestions.
        </p>
      </div>

      {/* Input form */}
      <div className="p-5 rounded-3xl bg-[#17171A] border border-white/10 space-y-4">
        <h3 className="font-anton text-sm text-white uppercase tracking-wide">Your Details</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Sex</label>
            <div className="flex gap-1.5">
              {["male", "female"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    sex === s
                      ? "bg-[#C81E3A] text-white"
                      : "bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:border-white/20"
                  }`}
                >
                  {s === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Height (cm)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="170"
              className="w-full px-3 py-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Weight (kg)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="70"
              className="w-full px-3 py-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Activity Level</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "sedentary", label: "Sedentary" },
              { id: "light", label: "Light" },
              { id: "moderate", label: "Moderate" },
              { id: "active", label: "Active" },
              { id: "very_active", label: "Very Active" },
            ].map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => setActivityLevel(level.id)}
                className={`py-2 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  activityLevel === level.id
                    ? "bg-[#C81E3A] text-white"
                    : "bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:border-white/20"
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#8C8C90] uppercase">Body Goal</label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "lose_fat", label: "Lose Fat" },
              { id: "maintain", label: "Maintain" },
              { id: "gain_muscle", label: "Gain Muscle" },
              { id: "improve_fitness", label: "Improve Fitness" },
            ].map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => setBodyGoal(goal.id)}
                className={`py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  bodyGoal === goal.id
                    ? "bg-[#C81E3A] text-white"
                    : "bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:border-white/20"
                }`}
              >
                {goal.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#8C8C90] uppercase">
            Target Weight (kg, optional)
          </label>
          <input
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            placeholder="65"
            className="w-full px-3 py-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A]"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Calculator className="w-4 h-4" />
          )}
          {saving ? "Calculating..." : "Calculate & Save"}
        </button>
      </div>

      {/* Results */}
      {profile?.bmi && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-3xl bg-[#17171A] border border-white/10 space-y-4"
        >
          <h3 className="font-anton text-sm text-white uppercase tracking-wide">Your Results</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">BMI</div>
              <div
                className={`text-2xl font-mono font-bold ${bmiCategoryColor(profile.bmiCategory)}`}
              >
                {profile.bmi}
              </div>
              <div className={`text-[10px] font-mono ${bmiCategoryColor(profile.bmiCategory)}`}>
                {profile.bmiCategory}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">BMR</div>
              <div className="text-2xl font-mono font-bold text-[#C81E3A]">
                {Math.round(profile.bmr || 0)}
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90]">kcal/day</div>
            </div>
            <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">TDEE</div>
              <div className="text-2xl font-mono font-bold text-amber-400">
                {Math.round(profile.tdee || 0)}
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90]">kcal/day</div>
            </div>
            <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                Daily Target
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {Math.round(profile.dailyCalorieTarget || 0)}
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90]">kcal/day</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] font-mono text-amber-300/80 leading-relaxed">
              These are estimates based on the Mifflin-St Jeor equation. They are not medical
              prescriptions. Consult a healthcare professional for personalized dietary advice.
            </p>
          </div>
        </motion.div>
      )}

      {/* Food suggestions */}
      {foodSuggestions && (
        <div className="p-5 rounded-3xl bg-[#17171A] border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Apple className="w-4 h-4 text-[#C81E3A]" />
            <h3 className="font-anton text-sm text-white uppercase tracking-wide">
              Suggested Foods
            </h3>
          </div>
          <p className="text-[10px] font-mono text-[#8C8C90]">{foodSuggestions.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {foodSuggestions.items.map((food, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-xl bg-[#0B0B0C] border border-white/5 text-xs font-mono text-white"
              >
                {food}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
