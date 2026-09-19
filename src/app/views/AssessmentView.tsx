import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Users,
  Shield,
  Brain,
  Clock,
  Dumbbell,
  Moon,
  Apple,
  Target,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { getPersonalization, savePersonalization } from "@/lib/personalization.functions";
import { useServerFn } from "@tanstack/react-start";

// ── Goal options ──────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { id: "build_muscle", label: "Build Muscle", icon: "💪" },
  { id: "lose_fat", label: "Lose Fat", icon: "🔥" },
  { id: "improve_fitness", label: "Improve Fitness", icon: "🏃" },
  { id: "become_disciplined", label: "Become More Disciplined", icon: "⏰" },
  { id: "become_confident", label: "Become More Confident", icon: "🦁" },
  { id: "become_social", label: "Become More Social", icon: "🤝" },
  { id: "improve_focus", label: "Improve Focus", icon: "🎯" },
  { id: "study_consistently", label: "Study Consistently", icon: "📚" },
  { id: "reduce_procrastination", label: "Reduce Procrastination", icon: "⚡" },
  { id: "improve_productivity", label: "Improve Productivity", icon: "📈" },
  { id: "improve_sleep", label: "Improve Sleep", icon: "😴" },
  { id: "build_better_habits", label: "Build Better Habits", icon: "🔄" },
  { id: "improve_nutrition", label: "Improve Nutrition", icon: "🥗" },
  { id: "become_consistent", label: "Become More Consistent", icon: "📅" },
];

const SCALE_LABELS_5 = ["", "Very Low", "Low", "Moderate", "High", "Very High"];

interface AssessmentAnswers {
  goals: string[];
  // Social
  socialComfortNewPeople: number;
  socialComfortConversations: number;
  socialComfortGroups: number;
  socialAvoidanceFrequency: number;
  socialSelfDescription: string;
  // Confidence
  confidenceGeneral: number;
  confidenceInitiative: number;
  confidenceUnfamiliar: number;
  confidenceSetbacks: number;
  confidenceSpeakingUp: number;
  confidenceGoals: number;
  // Discipline
  disciplineTaskCompletion: number;
  disciplineProcrastination: number;
  disciplineRoutine: number;
  disciplineCommitments: number;
  disciplineDistractibility: number;
  disciplineHabits: number;
  // Focus
  focusPhoneResistance: number;
  focusStudyConsistency: number;
  focusTimeManagement: number;
  focusDeepWork: number;
  focusDistractionFrequency: number;
  focusPlannedCompletion: number;
  // Fitness
  fitnessActivityLevel: string;
  fitnessDaysPerWeek: number;
  fitnessConfidence: number;
  fitnessPrimaryGoal: string;
  fitnessConsistency: number;
  // Recovery
  recoverySleepHours: number;
  recoverySleepConsistency: number;
  recoveryMorningEnergy: number;
  recoveryPerception: number;
  // Nutrition
  nutritionDietaryPreference: string;
  nutritionAllergies: string[];
  nutritionEatingSchedule: number;
  nutritionFoodQuality: number;
  nutritionProteinConsistency: number;
}

const INITIAL_ANSWERS: AssessmentAnswers = {
  goals: [],
  socialComfortNewPeople: 3,
  socialComfortConversations: 3,
  socialComfortGroups: 3,
  socialAvoidanceFrequency: 3,
  socialSelfDescription: "balanced",
  confidenceGeneral: 3,
  confidenceInitiative: 3,
  confidenceUnfamiliar: 3,
  confidenceSetbacks: 3,
  confidenceSpeakingUp: 3,
  confidenceGoals: 3,
  disciplineTaskCompletion: 3,
  disciplineProcrastination: 3,
  disciplineRoutine: 3,
  disciplineCommitments: 3,
  disciplineDistractibility: 3,
  disciplineHabits: 3,
  focusPhoneResistance: 3,
  focusStudyConsistency: 3,
  focusTimeManagement: 3,
  focusDeepWork: 3,
  focusDistractionFrequency: 3,
  focusPlannedCompletion: 3,
  fitnessActivityLevel: "moderate",
  fitnessDaysPerWeek: 3,
  fitnessConfidence: 3,
  fitnessPrimaryGoal: "improve_fitness",
  fitnessConsistency: 3,
  recoverySleepHours: 7,
  recoverySleepConsistency: 3,
  recoveryMorningEnergy: 3,
  recoveryPerception: 3,
  nutritionDietaryPreference: "non_vegetarian",
  nutritionAllergies: [],
  nutritionEatingSchedule: 3,
  nutritionFoodQuality: 3,
  nutritionProteinConsistency: 3,
};

// ── Step definitions ──────────────────────────────────────────────────────

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  section:
    | "goals"
    | "social"
    | "confidence"
    | "discipline"
    | "focus"
    | "fitness"
    | "recovery"
    | "nutrition";
}

const STEPS: Step[] = [
  {
    id: "goals",
    title: "Your Goals",
    subtitle: "What do you want SVJ to help you improve?",
    icon: Target,
    section: "goals",
  },
  {
    id: "social",
    title: "Social Assessment",
    subtitle: "How comfortable are you in social situations?",
    icon: Users,
    section: "social",
  },
  {
    id: "confidence",
    title: "Confidence Assessment",
    subtitle: "How confident do you feel in daily life?",
    icon: Shield,
    section: "confidence",
  },
  {
    id: "discipline",
    title: "Discipline Assessment",
    subtitle: "How consistent are you with routines and commitments?",
    icon: Clock,
    section: "discipline",
  },
  {
    id: "focus",
    title: "Focus & Productivity",
    subtitle: "How well can you concentrate and manage time?",
    icon: Brain,
    section: "focus",
  },
  {
    id: "fitness",
    title: "Fitness Assessment",
    subtitle: "What is your current activity level?",
    icon: Dumbbell,
    section: "fitness",
  },
  {
    id: "recovery",
    title: "Recovery Assessment",
    subtitle: "How well do you sleep and recover?",
    icon: Moon,
    section: "recovery",
  },
  {
    id: "nutrition",
    title: "Nutrition Assessment",
    subtitle: "Tell us about your eating habits.",
    icon: Apple,
    section: "nutrition",
  },
];

// ── Scale slider component ────────────────────────────────────────────────

function ScaleSlider({
  value,
  onChange,
  labels = SCALE_LABELS_5,
}: {
  value: number;
  onChange: (v: number) => void;
  labels?: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-mono text-[#8C8C90]">
        <span>{labels[1]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 h-10 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
              value === v
                ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/30"
                : "bg-[#17171A] border border-white/10 text-[#8C8C90] hover:border-white/20"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export const AssessmentView: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { user } = useSVJ();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswers>(INITIAL_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callGetPersonalization = useServerFn(getPersonalization);
  const callSavePersonalization = useServerFn(savePersonalization);

  React.useEffect(() => {
    let active = true;
    void callGetPersonalization({})
      .then((saved) => {
        if (!active || !saved) return;
        setAnswers((previous) => ({ ...previous, ...saved }));
        if (!saved.assessmentCompleted && saved.assessmentStep) {
          setCurrentStep(Math.min(saved.assessmentStep, STEPS.length - 1));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [callGetPersonalization]);

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const updateAnswer = useCallback(
    <K extends keyof AssessmentAnswers>(key: K, value: AssessmentAnswers[K]) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleGoal = useCallback((goalId: string) => {
    setAnswers((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  }, []);

  const canProceed = (): boolean => {
    if (step.section === "goals") return answers.goals.length > 0;
    return true; // All other steps have defaults
  };

  const handleNext = async () => {
    if (isLast) {
      await handleSubmit();
    } else {
      const nextStep = currentStep + 1;
      setSaving(true);
      setError(null);
      try {
        await callSavePersonalization({
          data: {
            ...answers,
            assessmentCompleted: false,
            goalsSelected: answers.goals.length > 0,
            assessmentStep: nextStep,
            assessmentVersion: 1,
          },
        });
        setCurrentStep(nextStep);
      } catch {
        setError("We couldn't save this step. Your answers are still here—try again.");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await callSavePersonalization({
        data: {
          ...answers,
          assessmentCompleted: true,
          goalsSelected: true,
          assessmentStep: STEPS.length - 1,
          assessmentVersion: 1,
        },
      });
      if (!result.ok) throw new Error("Assessment was not saved.");
      onComplete();
    } catch (e) {
      setError("Failed to save assessment. Please try again.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] font-inter antialiased">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-[#8C8C90] uppercase tracking-wider">
              Step {currentStep + 1} of {STEPS.length}
            </span>
            <span className="text-[10px] font-mono text-[#C81E3A] font-bold">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#17171A] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#C81E3A]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Step header */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-xs font-mono font-bold">
                <step.icon className="w-3.5 h-3.5" />
                <span>{step.title}</span>
              </div>
              <h2 className="font-anton text-2xl text-white uppercase tracking-wide">
                {step.subtitle}
              </h2>
            </div>

            {/* Step body */}
            {step.section === "goals" && (
              <div className="grid grid-cols-2 gap-2">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => toggleGoal(goal.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      answers.goals.includes(goal.id)
                        ? "bg-[#C81E3A]/20 border-[#C81E3A] text-white"
                        : "bg-[#17171A] border-white/10 text-[#8C8C90] hover:border-white/20"
                    }`}
                  >
                    <span className="text-lg mr-2">{goal.icon}</span>
                    <span className="text-xs font-mono font-semibold">{goal.label}</span>
                  </button>
                ))}
              </div>
            )}

            {step.section === "social" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How comfortable are you meeting new people?
                  </label>
                  <ScaleSlider
                    value={answers.socialComfortNewPeople}
                    onChange={(v) => updateAnswer("socialComfortNewPeople", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How comfortable are you starting conversations?
                  </label>
                  <ScaleSlider
                    value={answers.socialComfortConversations}
                    onChange={(v) => updateAnswer("socialComfortConversations", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How comfortable are you speaking in groups?
                  </label>
                  <ScaleSlider
                    value={answers.socialComfortGroups}
                    onChange={(v) => updateAnswer("socialComfortGroups", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How often do you avoid social situations you want?
                  </label>
                  <ScaleSlider
                    value={answers.socialAvoidanceFrequency}
                    onChange={(v) => updateAnswer("socialAvoidanceFrequency", v)}
                    labels={["", "Never", "Rarely", "Sometimes", "Often", "Very Often"]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white">
                    How would you describe yourself?
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      "very_introverted",
                      "introverted",
                      "balanced",
                      "extroverted",
                      "very_extroverted",
                    ].map((desc) => (
                      <button
                        key={desc}
                        type="button"
                        onClick={() => updateAnswer("socialSelfDescription", desc)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                          answers.socialSelfDescription === desc
                            ? "bg-[#C81E3A] text-white"
                            : "bg-[#17171A] border border-white/10 text-[#8C8C90] hover:border-white/20"
                        }`}
                      >
                        {desc.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step.section === "confidence" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">General self-confidence</label>
                  <ScaleSlider
                    value={answers.confidenceGeneral}
                    onChange={(v) => updateAnswer("confidenceGeneral", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Comfort taking initiative</label>
                  <ScaleSlider
                    value={answers.confidenceInitiative}
                    onChange={(v) => updateAnswer("confidenceInitiative", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Comfort trying unfamiliar things
                  </label>
                  <ScaleSlider
                    value={answers.confidenceUnfamiliar}
                    onChange={(v) => updateAnswer("confidenceUnfamiliar", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Ability to handle setbacks</label>
                  <ScaleSlider
                    value={answers.confidenceSetbacks}
                    onChange={(v) => updateAnswer("confidenceSetbacks", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Comfort speaking up</label>
                  <ScaleSlider
                    value={answers.confidenceSpeakingUp}
                    onChange={(v) => updateAnswer("confidenceSpeakingUp", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Confidence in achieving personal goals
                  </label>
                  <ScaleSlider
                    value={answers.confidenceGoals}
                    onChange={(v) => updateAnswer("confidenceGoals", v)}
                  />
                </div>
              </div>
            )}

            {step.section === "discipline" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Task completion consistency
                  </label>
                  <ScaleSlider
                    value={answers.disciplineTaskCompletion}
                    onChange={(v) => updateAnswer("disciplineTaskCompletion", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How often do you procrastinate?
                  </label>
                  <ScaleSlider
                    value={answers.disciplineProcrastination}
                    onChange={(v) => updateAnswer("disciplineProcrastination", v)}
                    labels={["", "Never", "Rarely", "Sometimes", "Often", "Very Often"]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Routine consistency</label>
                  <ScaleSlider
                    value={answers.disciplineRoutine}
                    onChange={(v) => updateAnswer("disciplineRoutine", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Ability to follow commitments
                  </label>
                  <ScaleSlider
                    value={answers.disciplineCommitments}
                    onChange={(v) => updateAnswer("disciplineCommitments", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How easily distracted are you?
                  </label>
                  <ScaleSlider
                    value={answers.disciplineDistractibility}
                    onChange={(v) => updateAnswer("disciplineDistractibility", v)}
                    labels={["", "Never", "Rarely", "Sometimes", "Often", "Very Often"]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Habit consistency</label>
                  <ScaleSlider
                    value={answers.disciplineHabits}
                    onChange={(v) => updateAnswer("disciplineHabits", v)}
                  />
                </div>
              </div>
            )}

            {step.section === "focus" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Ability to focus without checking phone
                  </label>
                  <ScaleSlider
                    value={answers.focusPhoneResistance}
                    onChange={(v) => updateAnswer("focusPhoneResistance", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Study/work consistency</label>
                  <ScaleSlider
                    value={answers.focusStudyConsistency}
                    onChange={(v) => updateAnswer("focusStudyConsistency", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Time management</label>
                  <ScaleSlider
                    value={answers.focusTimeManagement}
                    onChange={(v) => updateAnswer("focusTimeManagement", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Deep-work ability</label>
                  <ScaleSlider
                    value={answers.focusDeepWork}
                    onChange={(v) => updateAnswer("focusDeepWork", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    How frequently are you distracted?
                  </label>
                  <ScaleSlider
                    value={answers.focusDistractionFrequency}
                    onChange={(v) => updateAnswer("focusDistractionFrequency", v)}
                    labels={["", "Never", "Rarely", "Sometimes", "Often", "Very Often"]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Ability to complete planned work
                  </label>
                  <ScaleSlider
                    value={answers.focusPlannedCompletion}
                    onChange={(v) => updateAnswer("focusPlannedCompletion", v)}
                  />
                </div>
              </div>
            )}

            {step.section === "fitness" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white">Current activity level</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "sedentary", label: "Sedentary", desc: "Little to no exercise" },
                      { id: "light", label: "Light", desc: "1-2 days/week" },
                      { id: "moderate", label: "Moderate", desc: "3-4 days/week" },
                      { id: "active", label: "Active", desc: "5-6 days/week" },
                      { id: "very_active", label: "Very Active", desc: "Daily intense training" },
                    ].map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => updateAnswer("fitnessActivityLevel", level.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          answers.fitnessActivityLevel === level.id
                            ? "bg-[#C81E3A]/20 border-[#C81E3A] text-white"
                            : "bg-[#17171A] border-white/10 text-[#8C8C90] hover:border-white/20"
                        }`}
                      >
                        <div className="text-xs font-mono font-bold">{level.label}</div>
                        <div className="text-[10px] font-mono text-[#8C8C90]">{level.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Workout days per week</label>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => updateAnswer("fitnessDaysPerWeek", d)}
                        className={`flex-1 h-10 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                          answers.fitnessDaysPerWeek === d
                            ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/30"
                            : "bg-[#17171A] border border-white/10 text-[#8C8C90] hover:border-white/20"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Fitness confidence</label>
                  <ScaleSlider
                    value={answers.fitnessConfidence}
                    onChange={(v) => updateAnswer("fitnessConfidence", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Training consistency</label>
                  <ScaleSlider
                    value={answers.fitnessConsistency}
                    onChange={(v) => updateAnswer("fitnessConsistency", v)}
                  />
                </div>
              </div>
            )}

            {step.section === "recovery" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white">
                    Typical sleep duration (hours)
                  </label>
                  <div className="flex gap-1.5">
                    {[5, 6, 7, 8, 9, 10].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => updateAnswer("recoverySleepHours", h)}
                        className={`flex-1 h-10 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                          answers.recoverySleepHours === h
                            ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/30"
                            : "bg-[#17171A] border border-white/10 text-[#8C8C90] hover:border-white/20"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Sleep consistency</label>
                  <ScaleSlider
                    value={answers.recoverySleepConsistency}
                    onChange={(v) => updateAnswer("recoverySleepConsistency", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Morning energy level</label>
                  <ScaleSlider
                    value={answers.recoveryMorningEnergy}
                    onChange={(v) => updateAnswer("recoveryMorningEnergy", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Recovery perception</label>
                  <ScaleSlider
                    value={answers.recoveryPerception}
                    onChange={(v) => updateAnswer("recoveryPerception", v)}
                  />
                </div>
              </div>
            )}

            {step.section === "nutrition" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-white">Dietary preference</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "vegetarian", label: "Vegetarian" },
                      { id: "eggetarian", label: "Eggetarian" },
                      { id: "non_vegetarian", label: "Non-Vegetarian" },
                      { id: "vegan", label: "Vegan" },
                    ].map((pref) => (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => updateAnswer("nutritionDietaryPreference", pref.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          answers.nutritionDietaryPreference === pref.id
                            ? "bg-[#C81E3A]/20 border-[#C81E3A] text-white"
                            : "bg-[#17171A] border border-white/10 text-[#8C8C90] hover:border-white/20"
                        }`}
                      >
                        <span className="text-xs font-mono font-bold">{pref.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">
                    Eating schedule consistency
                  </label>
                  <ScaleSlider
                    value={answers.nutritionEatingSchedule}
                    onChange={(v) => updateAnswer("nutritionEatingSchedule", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">General food quality</label>
                  <ScaleSlider
                    value={answers.nutritionFoodQuality}
                    onChange={(v) => updateAnswer("nutritionFoodQuality", v)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-white">Protein-food consistency</label>
                  <ScaleSlider
                    value={answers.nutritionProteinConsistency}
                    onChange={(v) => updateAnswer("nutritionProteinConsistency", v)}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-xl border border-rose-400/30 bg-rose-950/30 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3 mt-8">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s - 1)}
              className="px-4 py-3 rounded-xl border border-white/10 text-[#8C8C90] hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || saving}
            className="flex-1 py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLast ? (
              <>
                <Check className="w-4 h-4" />
                Complete Assessment
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
