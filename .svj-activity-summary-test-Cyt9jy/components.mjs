// src/app/views/ActivityView.tsx
import { useEffect as useEffect3, useRef as useRef2, useState as useState3 } from "react";

// mock:motion
import React from "react";
var cache = {};
var motion = new Proxy({}, { get: (_, tag) => cache[tag] ??= (props) => {
  const { children, initial, animate, transition, whileHover, whileTap, layoutId, ...rest } = props;
  return React.createElement(tag, rest, children);
} });

// src/app/views/ActivityView.tsx
import {
  Activity as ActivityIcon,
  Footprints,
  Flame,
  TrendingUp,
  Trophy,
  Watch,
  ActivitySquare,
  BarChart3
} from "lucide-react";

// mock:context
var useActivityOptional = () => globalThis.__svjActivity;

// mock:activityhistory
var ActivityHistory = () => null;
var CompletedSessionCard = () => null;

// mock:traingoals
var TrainGoals = () => null;
var TrainProgress = () => null;

// mock:trainrecovery
var TrainRecovery = () => null;

// mock:routelibrary
var RouteLibrary = () => null;

// mock:recordsview
var RecordsView = () => null;

// mock:connecteddevicesview
var ConnectedDevicesView = () => null;

// mock:workoutrecorder
var WorkoutRecorder = () => null;

// src/components/ScreenHero.tsx
import { useEffect, useRef, useState } from "react";

// src/lib/heroAssets.ts
var HERO_ASSETS = {
  activity: {
    src: "/assets/svj-premium/activity/hero.webp",
    alt: "Cyclist riding through the city at night",
    focal: "50% 40%"
  },
  challenges: {
    src: "/assets/svj-premium/challenges/hero.webp",
    alt: "Hiker overlooking a mountain lake at sunset",
    focal: "50% 32%"
  },
  onboarding: {
    src: "/assets/svj-premium/onboarding/hero.webp",
    alt: "Dark engraved hexagon texture",
    focal: "50% 50%"
  },
  plus: {
    src: "/assets/svj-premium/plus/hero.webp",
    alt: "SVJ Plus premium hero",
    focal: "70% 16%"
  },
  profile: {
    src: "/assets/svj-premium/profile/hero.webp",
    alt: "Athlete at rest in a dark gym",
    focal: "30% 35%"
  },
  rivalry: {
    src: "/assets/svj-premium/rivalry/hero.webp",
    alt: "Two athletes facing off in a dark training space",
    focal: "50% 35%"
  },
  train: {
    src: "/assets/svj-premium/train/hero.webp",
    alt: "Athlete and barbell in a dark gym",
    focal: "22% 40%"
  },
  transformation: {
    src: "/assets/svj-premium/transformation/hero.webp",
    alt: "Athlete recovering after a hard session",
    focal: "26% 38%"
  },
  fuel: {
    src: "/assets/svj-premium/fuel/hero.webp",
    alt: "Plated high-protein meal on a dark table",
    focal: "26% 42%"
  }
};

// src/components/ScreenHero.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var HEIGHT_CLASSES = {
  sm: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-40 sm:max-h-48 lg:max-h-56",
  md: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-52 sm:max-h-64 lg:max-h-80",
  lg: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-64 sm:max-h-80 lg:max-h-96"
};
var ScreenHero = ({
  screen,
  title,
  subtitle,
  height = "md",
  priority = false,
  safeArea = false
}) => {
  const asset = HERO_ASSETS[screen];
  const imgRef = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    const node = imgRef.current;
    if (!node?.complete) return;
    setState(node.naturalWidth > 0 ? "ready" : "failed");
  }, []);
  const decorative = !title && !subtitle;
  if (decorative && state === "failed") return null;
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "data-testid": "screen-hero-" + screen,
      "aria-hidden": decorative ? "true" : void 0,
      style: safeArea ? { marginTop: "env(safe-area-inset-top)" } : void 0,
      className: "relative z-0 w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0B0B0C] " + HEIGHT_CLASSES[height],
      children: [
        state === "failed" ? /* @__PURE__ */ jsx(
          "div",
          {
            "aria-hidden": "true",
            className: "pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2A0E14] via-[#0B0B0C] to-[#0B0B0C]",
            children: /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-[radial-gradient(120%_140%_at_20%_0%,rgba(200,30,58,0.35),transparent_62%)]" })
          }
        ) : /* @__PURE__ */ jsx(
          "img",
          {
            ref: imgRef,
            src: asset.src,
            alt: decorative ? asset.alt : "",
            style: { objectPosition: asset.focal },
            loading: priority ? "eager" : "lazy",
            decoding: priority ? "sync" : "async",
            fetchPriority: priority ? "high" : "auto",
            onLoad: () => setState("ready"),
            onError: () => setState("failed"),
            className: "block h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-700 " + (state === "ready" ? "opacity-100" : "opacity-0")
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/55 to-[#0B0B0C]/5" }),
        /* @__PURE__ */ jsx("div", { className: "pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/55 via-transparent to-[#0B0B0C]/35" }),
        (title || subtitle) && /* @__PURE__ */ jsxs("div", { className: "absolute inset-x-0 bottom-0 p-4 sm:p-5", children: [
          title && /* @__PURE__ */ jsx("h2", { className: "font-anton text-2xl tracking-wide text-white sm:text-3xl", children: title }),
          subtitle && /* @__PURE__ */ jsx("p", { className: "mt-1.5 max-w-xl font-inter text-sm leading-relaxed text-[#C4C4CC]", children: subtitle })
        ] })
      ]
    }
  );
};

// src/app/components/ui-primitives/SVJScoreRing.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SVJScoreRing = ({
  value,
  max = 100,
  display,
  label,
  sublabel,
  size = 168,
  thickness = 12,
  tone = "crimson",
  className = ""
}) => {
  const tones = {
    crimson: "#C81E3A",
    premium: "#C9A227",
    physical: "#10B981",
    ambition: "#A855F7",
    intellect: "#F59E0B",
    mental: "#EAB308",
    social: "#3B82F6",
    discipline: "#F43F5E"
  };
  const color = tones[tone];
  const hasData = value !== null && Number.isFinite(value);
  const safeMax = max > 0 ? max : 100;
  const ratio = hasData ? Math.max(0, Math.min(1, value / safeMax)) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const center = size / 2;
  const [drawn, setDrawn] = useState2(false);
  useEffect2(() => {
    const id = window.setTimeout(() => setDrawn(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const numeral = hasData ? display ?? String(Math.round(value)) : "\u2014";
  return /* @__PURE__ */ jsxs2("div", { className: `flex flex-col items-center ${className}`, children: [
    /* @__PURE__ */ jsxs2("div", { className: "relative", style: { width: size, height: size }, children: [
      /* @__PURE__ */ jsxs2(
        "svg",
        {
          width: size,
          height: size,
          viewBox: `0 0 ${size} ${size}`,
          role: "img",
          "aria-label": hasData ? `${label}: ${numeral} out of ${safeMax}` : `${label}: no data recorded yet`,
          className: "-rotate-90",
          children: [
            /* @__PURE__ */ jsx2("defs", { children: /* @__PURE__ */ jsxs2("linearGradient", { id: `svj-ring-${tone}`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
              /* @__PURE__ */ jsx2("stop", { offset: "0%", stopColor: color, stopOpacity: "0.55" }),
              /* @__PURE__ */ jsx2("stop", { offset: "100%", stopColor: color, stopOpacity: "1" })
            ] }) }),
            /* @__PURE__ */ jsx2(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(255,255,255,0.055)",
                strokeWidth: thickness
              }
            ),
            /* @__PURE__ */ jsx2(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(0,0,0,0.45)",
                strokeWidth: Math.max(1, thickness - 6)
              }
            ),
            hasData ? /* @__PURE__ */ jsx2(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: `url(#svj-ring-${tone})`,
                strokeWidth: thickness,
                strokeLinecap: "round",
                strokeDasharray: circumference,
                strokeDashoffset: drawn ? dashOffset : circumference,
                style: { transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)" }
              }
            ) : /* @__PURE__ */ jsx2(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(255,255,255,0.14)",
                strokeWidth: thickness,
                strokeLinecap: "round",
                strokeDasharray: "2 8"
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ jsx2(
          "span",
          {
            className: "font-anton leading-none tracking-tight text-[#F4F2ED]",
            style: { fontSize: Math.round(size * 0.26) },
            children: numeral
          }
        ),
        /* @__PURE__ */ jsx2("span", { className: "mt-1 max-w-[80%] text-center text-[10px] font-inter font-semibold uppercase tracking-[0.14em] text-[#8C8C90]", children: label })
      ] })
    ] }),
    sublabel && /* @__PURE__ */ jsx2("p", { className: "mt-2 max-w-[220px] text-center text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: sublabel })
  ] });
};

// src/app/components/ui-primitives/SVJSectionHeader.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var SVJSectionHeader = ({ title, icon: Icon, eyebrow, trailing, variant = "default", className = "" }) => /* @__PURE__ */ jsxs3("div", { className: `flex items-end justify-between gap-3 ${className}`, children: [
  /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
    eyebrow && /* @__PURE__ */ jsx3("p", { className: "mb-0.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]", children: eyebrow }),
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
      variant === "default" ? /* @__PURE__ */ jsx3("span", { "aria-hidden": true, className: "h-3.5 w-1 shrink-0 rounded-full bg-[#C81E3A]" }) : Icon && /* @__PURE__ */ jsx3(Icon, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#C9A227]" }),
      /* @__PURE__ */ jsx3(
        "h3",
        {
          className: variant === "badge" ? "font-anton text-sm uppercase tracking-wider text-[#F4F2ED]" : "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]",
          children: title
        }
      ),
      variant === "default" && Icon && /* @__PURE__ */ jsx3(Icon, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" })
    ] })
  ] }),
  trailing && /* @__PURE__ */ jsx3("div", { className: "shrink-0", children: trailing })
] });

// src/app/views/ActivityView.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var LiveNumber = ({ value, className }) => {
  const [bump, setBump] = useState3(false);
  const prev = useRef2(value);
  useEffect3(() => {
    if (value <= prev.current) {
      prev.current = value;
      return;
    }
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 450);
    prev.current = value;
    return () => window.clearTimeout(t);
  }, [value]);
  return /* @__PURE__ */ jsx4(
    motion.span,
    {
      initial: bump ? { scale: 1.12 } : false,
      animate: { scale: 1 },
      transition: { type: "spring", stiffness: 400, damping: 18 },
      className: `inline-block ${className ?? ""}`,
      children: value.toLocaleString()
    },
    value
  );
};
var HistoryPanel = ({ title, summary }) => /* @__PURE__ */ jsxs4(
  "div",
  {
    "data-testid": "activity-period-summary",
    className: "svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] p-4 mb-3",
    children: [
      /* @__PURE__ */ jsx4(SVJSectionHeader, { title, icon: BarChart3, className: "mb-3" }),
      /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxs4("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx4("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Avg Steps" }),
          /* @__PURE__ */ jsx4("div", { className: "font-mono text-sm font-bold text-white", children: summary.averageSteps.toLocaleString() })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx4("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Best Day" }),
          /* @__PURE__ */ jsx4("div", { className: "font-mono text-sm font-bold text-[#C81E3A]", children: summary.bestDay ? summary.bestDay.steps.toLocaleString() : "\u2014" }),
          summary.bestDay && /* @__PURE__ */ jsx4("div", { className: "text-[10px] font-inter text-[#8C8C90]", children: summary.bestDay.label })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx4("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Avg KCAL" }),
          /* @__PURE__ */ jsx4("div", { className: "font-mono text-sm font-bold text-gold", children: summary.averageActiveKcal.toLocaleString() })
        ] })
      ] })
    ]
  }
);
var ActivityView = ({
  hideRecoverySection = false
}) => {
  const activity = useActivityOptional();
  if (!activity) {
    return /* @__PURE__ */ jsxs4("div", { className: "rounded-2xl bg-[#17171A] border border-white/[0.06] p-4 text-center space-y-2", children: [
      /* @__PURE__ */ jsx4("p", { className: "font-anton text-lg tracking-wide text-white", children: "Activity Unavailable" }),
      /* @__PURE__ */ jsx4("p", { className: "text-xs font-inter text-[#8C8C90]", children: "Reload the app to reconnect step tracking." })
    ] });
  }
  return /* @__PURE__ */ jsx4(ActivityViewContent, { activity, hideRecoverySection });
};
var ActivityViewContent = ({ activity, hideRecoverySection = false }) => {
  const {
    todaySteps,
    milestoneSteps,
    stepGoal,
    stepPercent,
    remainingSteps,
    activeKcal,
    totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
    trackingRequested,
    trackingActive,
    startTracking,
    stopTracking,
    statusMessage,
    stepSource,
    summary7,
    summary30
  } = activity;
  useEffect3(
    () => () => {
      void stopTracking();
    },
    [stopTracking]
  );
  const [section, setSection] = useState3("activity");
  const [plannedRoute, setPlannedRoute] = useState3(null);
  const nextMilestone = [2500, 5e3, 7500, 1e4].find((m) => milestoneSteps < m) ?? 1e4;
  return /* @__PURE__ */ jsxs4("div", { className: "w-full", children: [
    /* @__PURE__ */ jsx4(ScreenHero, { screen: "activity", height: "md", priority: true }),
    /* @__PURE__ */ jsxs4("div", { className: "mb-3 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx4("div", { className: "w-9 h-9 rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 flex items-center justify-center", children: /* @__PURE__ */ jsx4(ActivityIcon, { className: "w-5 h-5 text-[#E62846]" }) }),
        /* @__PURE__ */ jsx4("h1", { className: "font-anton text-2xl tracking-wide text-white", children: "Activity" })
      ] }),
      /* @__PURE__ */ jsxs4(
        "div",
        {
          className: `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-inter font-medium ${trackingStatus === "tracking" ? "bg-emerald-500/10 text-emerald-400" : trackingStatus === "starting" ? "bg-gold/10 text-gold" : "bg-white/[0.04] text-[#8C8C90]"}`,
          children: [
            trackingStatus === "tracking" ? /* @__PURE__ */ jsx4(Watch, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsx4(ActivitySquare, { className: "w-3.5 h-3.5" }),
            trackingActive ? "Tracking active" : "Tracking stopped"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx4(
      "p",
      {
        role: "status",
        className: "mb-3 rounded-lg bg-[#0b0b0c] border border-white/[0.04] px-3 py-2 text-[11px] font-inter text-[#8C8C90]",
        children: statusMessage
      }
    ),
    /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        disabled: trackingStatus === "stopping" || trackingStatus === "update-required",
        onClick: () => {
          if (trackingRequested || trackingActive || trackingStatus === "error")
            void stopTracking();
          else void startTracking();
        },
        className: "mb-3 w-full rounded-xl bg-[#C81E3A] px-4 py-3 text-xs font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50 svj-press",
        children: trackingStatus === "update-required" ? "APP UPDATE REQUIRED" : trackingStatus === "error" ? "RETRY STOP" : trackingRequested || trackingActive ? "STOP TRACKING" : "START TRACKING"
      }
    ),
    /* @__PURE__ */ jsx4("div", { className: "mb-3 flex gap-2 overflow-x-auto pb-1", "data-testid": "train-sections", children: [
      { id: "activity", label: "Overview" },
      { id: "record", label: "Record" },
      { id: "history", label: "History" },
      { id: "routes", label: "Routes" },
      { id: "records", label: "Records" },
      { id: "devices", label: "Devices" },
      { id: "goals", label: "Goals" },
      { id: "progress", label: "Progress" },
      { id: "recovery", label: "Recovery" }
    ].filter((s) => !hideRecoverySection || s.id !== "recovery").map((s) => /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        onClick: () => setSection(s.id),
        className: `shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-inter font-medium transition-colors ${section === s.id ? "bg-[#C81E3A]/15 text-white" : "bg-white/[0.04] text-[#8C8C90] hover:text-white"}`,
        children: s.label
      },
      s.id
    )) }),
    section === "goals" && /* @__PURE__ */ jsx4(TrainGoals, {}),
    section === "progress" && /* @__PURE__ */ jsx4(TrainProgress, {}),
    section === "recovery" && /* @__PURE__ */ jsx4(TrainRecovery, {}),
    section === "record" && /* @__PURE__ */ jsx4(
      WorkoutRecorder,
      {
        plannedRoute,
        onClearPlannedRoute: () => setPlannedRoute(null)
      }
    ),
    section === "routes" && /* @__PURE__ */ jsx4(
      RouteLibrary,
      {
        onStartRoute: (route) => {
          setPlannedRoute(route);
          setSection("record");
        }
      }
    ),
    section === "records" && /* @__PURE__ */ jsx4(RecordsView, {}),
    section === "devices" && /* @__PURE__ */ jsx4(ConnectedDevicesView, {}),
    section === "activity" && /* @__PURE__ */ jsxs4("div", { className: "mb-3 grid items-start gap-3 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxs4("div", { className: "svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5", children: [
        /* @__PURE__ */ jsx4(SVJSectionHeader, { title: "Today's activity", icon: Footprints, className: "mb-1" }),
        /* @__PURE__ */ jsxs4("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx4(
            SVJScoreRing,
            {
              value: todaySteps,
              max: stepGoal,
              display: todaySteps.toLocaleString(),
              label: "Steps",
              sublabel: remainingSteps > 0 ? `of ${stepGoal.toLocaleString()} steps (${stepPercent}%) \u2014 ${remainingSteps.toLocaleString()} to go` : `of ${stepGoal.toLocaleString()} steps \u2014 daily goal complete`
            }
          ),
          stepSource === "accelerometer" && /* @__PURE__ */ jsx4("div", { className: "mt-2 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-gold", children: "Estimated steps \u2014 accelerometer motion detection" }),
          stepSource === "detector" && /* @__PURE__ */ jsx4("div", { className: "mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Source: step detector" }),
          stepSource === "counter" && /* @__PURE__ */ jsx4("div", { className: "mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Source: hardware step counter" }),
          /* @__PURE__ */ jsxs4("div", { className: "mt-3 text-[10px] font-mono text-[#8C8C90] text-center", children: [
            "Next milestone:",
            " ",
            /* @__PURE__ */ jsxs4("span", { className: "text-white", children: [
              nextMilestone.toLocaleString(),
              " steps"
            ] }),
            " \u2014 XP awarded automatically at 2.5K / 5K / 7.5K / 10K"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5", children: [
        /* @__PURE__ */ jsx4(
          SVJSectionHeader,
          {
            title: "Calories burned",
            icon: Flame,
            trailing: /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-inter text-[#8C8C90]", children: "Estimate" }),
            className: "mb-1"
          }
        ),
        /* @__PURE__ */ jsxs4("div", { className: "flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8", children: [
          /* @__PURE__ */ jsx4(
            SVJScoreRing,
            {
              value: activeKcal,
              max: kcalGoal,
              display: activeKcal.toLocaleString(),
              label: "Active kcal",
              tone: "premium",
              size: 148,
              sublabel: `of ${kcalGoal.toLocaleString()} active kcal goal (${kcalPercent}%)`
            }
          ),
          /* @__PURE__ */ jsxs4("div", { className: "grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-1", children: [
            /* @__PURE__ */ jsxs4("div", { className: "svj-stat p-3", children: [
              /* @__PURE__ */ jsx4("div", { className: "text-[11px] font-inter text-[#8C8C90]", children: "Active Calories" }),
              /* @__PURE__ */ jsx4(
                LiveNumber,
                {
                  value: activeKcal,
                  className: "font-mono text-xl font-bold text-[#C9A227]"
                }
              ),
              /* @__PURE__ */ jsx4("div", { className: "text-[10px] font-inter text-[#8C8C90] mt-0.5", children: "From movement" })
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "svj-stat p-3", children: [
              /* @__PURE__ */ jsx4("div", { className: "text-[11px] font-inter text-[#8C8C90]", children: "Total Calories" }),
              /* @__PURE__ */ jsx4(
                LiveNumber,
                {
                  value: totalKcal,
                  className: "font-mono text-xl font-bold text-white"
                }
              ),
              /* @__PURE__ */ jsx4("div", { className: "text-[10px] font-inter text-[#8C8C90] mt-0.5", children: "Including resting burn" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx4("p", { className: "mt-3 text-[10px] font-inter leading-relaxed text-[#8C8C90]", children: "Estimates from steps, distance and your body profile \u2014 not medical measurements." })
      ] })
    ] }),
    /* @__PURE__ */ jsx4(CompletedSessionCard, {}),
    section === "history" && /* @__PURE__ */ jsx4(ActivityHistory, {}),
    section === "activity" && /* @__PURE__ */ jsxs4("div", { className: "grid items-start gap-3 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsx4(HistoryPanel, { title: "Last 7 Days", summary: summary7 }),
      /* @__PURE__ */ jsx4(HistoryPanel, { title: "Last 30 Days", summary: summary30 })
    ] }),
    section === "activity" && /* @__PURE__ */ jsxs4("div", { className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-3.5 mb-3", children: [
      /* @__PURE__ */ jsx4(SVJSectionHeader, { title: "Step XP milestones", icon: Trophy, className: "mb-3" }),
      /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-4 gap-2", children: [
        { steps: 2500, xp: 40 },
        { steps: 5e3, xp: 60 },
        { steps: 7500, xp: 80 },
        { steps: 1e4, xp: 120 }
      ].map((m) => {
        const reached = milestoneSteps >= m.steps;
        return /* @__PURE__ */ jsxs4(
          "div",
          {
            className: `rounded-lg p-2 text-center ${reached ? "bg-[#C81E3A]/10" : "bg-[#0b0b0c]"}`,
            children: [
              /* @__PURE__ */ jsxs4(
                "div",
                {
                  className: `font-mono text-sm font-bold ${reached ? "text-[#C81E3A]" : "text-[#8C8C90]"}`,
                  children: [
                    (m.steps / 1e3).toFixed(1),
                    "K"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs4(
                "div",
                {
                  className: `text-[10px] font-inter ${reached ? "text-emerald-400" : "text-[#8C8C90]"}`,
                  children: [
                    "+",
                    m.xp,
                    " XP"
                  ]
                }
              )
            ]
          },
          m.steps
        );
      }) }),
      /* @__PURE__ */ jsxs4("div", { className: "mt-3 flex items-center gap-1.5 text-[10px] font-inter text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx4(TrendingUp, { className: "w-3 h-3" }),
        "XP is granted once per milestone per day and counts toward your streak."
      ] })
    ] })
  ] });
};
export {
  ActivityView
};
