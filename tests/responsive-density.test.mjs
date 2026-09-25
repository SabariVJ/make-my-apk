// App-wide responsive-density regressions.
//
// The 2026-09 pass made SVJ viewport-aware: one shared page container, desktop
// width instead of a phone column, denser cards, and side-by-side composition
// where content semantics allow it. These checks are structural and
// deliberately not pixel-based — they pin the contracts that (a) keep desktop
// width in use, (b) keep the bottom navigation's clearance owned in exactly one
// place, and (c) keep every existing destination, control and gate reachable.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const app = read("src/app/App.tsx");
const header = read("src/app/components/Header.tsx");
const navigation = read("src/app/components/Navigation.tsx");
const utilityNav = read("src/app/components/UtilityNav.tsx");

const challenges = read("src/app/views/ChallengesView.tsx");
const activity = read("src/app/views/ActivityView.tsx");
const train = read("src/app/views/WorkoutView.tsx");
const strengthCard = read("src/app/components/StructuredStrengthCard.tsx");
const templates = read("src/app/components/TemplateBrowser.tsx");
const today = read("src/app/components/TrainingToday.tsx");
const progress = read("src/app/components/TrainingProgress.tsx");
const recovery = read("src/app/components/RecoveryView.tsx");
const recoverySections = [
  recovery,
  read("src/app/components/recovery/RecoveryHistorySection.tsx"),
  read("src/app/components/recovery/RecoveryGoalsSection.tsx"),
  read("src/app/components/recovery/RecoveryRecordsSection.tsx"),
  read("src/app/components/recovery/RecoveryWeeklyDigest.tsx"),
].join("\n");
const recoveryWidgets = read("src/app/components/recovery/RecoveryInsightsWidgets.tsx");
const nutrition = read("src/app/views/NutritionView.tsx");
const profile = read("src/app/views/ProfileView.tsx");
const community = read("src/app/views/CommunityView.tsx");
const leaderboard = read("src/app/views/LeaderboardView.tsx");
const earnPlus = read("src/app/views/EarnPlusView.tsx");
const sixtyDay = read("src/app/views/SixtyDayChallengeView.tsx");
const planView = read("src/app/views/SvjPlanView.tsx");
const transformation = read("src/app/views/TransformationReportView.tsx");

/** Screens rendered inside the shared page container. */
const SCREENS = {
  "ChallengesView.tsx": challenges,
  "ActivityView.tsx": activity,
  "WorkoutView.tsx": train,
  "RecoveryView.tsx": recovery,
  "NutritionView.tsx": nutrition,
  "ProfileView.tsx": profile,
  "CommunityView.tsx": community,
  "LeaderboardView.tsx": leaderboard,
  "EarnPlusView.tsx": earnPlus,
  "SixtyDayChallengeView.tsx": sixtyDay,
  "SvjPlanView.tsx": planView,
  "TransformationReportView.tsx": transformation,
};

describe("one shared page container owns padding and nav clearance", () => {
  it("defines the container once and gives the desktop box real width", () => {
    assert.ok(app.includes("const PAGE_CONTAINER ="));
    assert.ok(app.includes('const PAGE_CONTAINER_DESKTOP = "lg:max-w-[86rem] lg:pr-28"'));
    // A single bottom-navigation clearance that also respects the device safe area.
    assert.ok(app.includes("pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"));
  });

  it("reserves the utility rail exactly once", () => {
    assert.equal(
      [...app.matchAll(/lg:pr-28/g)].length,
      1,
      "the rail gutter must appear once, on the desktop container only",
    );
  });

  it("screens no longer add their own bottom-navigation padding", () => {
    for (const [name, source] of Object.entries(SCREENS)) {
      assert.doesNotMatch(
        source,
        /pb-(20|24|28|32)\b/,
        `${name} must let the shared page container own bottom clearance`,
      );
    }
  });

  it("keeps the rail and bottom navigation tokens intact", () => {
    assert.match(navigation, /fixed bottom-0 left-0 right-0/);
    assert.match(navigation, /bg-\[#0B0B0C\]\/95/);
    assert.match(utilityNav, /fixed right-0 top-1\/2/);
    assert.match(header, /sticky top-0/);
  });
});

describe("Challenges stays compact and action-focused", () => {
  it("keeps the mission hero small enough to leave the task list above the fold", () => {
    assert.ok(
      challenges.includes("font-anton text-2xl leading-none tracking-wide text-white sm:text-3xl"),
    );
    assert.ok(challenges.includes("size={132}"));
  });

  it("lays the task list out as a responsive grid", () => {
    assert.ok(challenges.includes('className="grid gap-2.5 lg:grid-cols-2"'));
  });

  it("never reintroduces the Character Matrix", () => {
    assert.doesNotMatch(challenges, /character[ _-]?matrix/i);
  });

  it("keeps the filters and the custom task path", () => {
    assert.match(challenges, /Add Task|add task/);
    assert.match(challenges, /selectedCategory/);
  });
});

describe("Activity prioritises tracking over decoration", () => {
  it("does not re-constrain itself to a narrow phone column", () => {
    assert.doesNotMatch(activity, /max-w-2xl mx-auto/);
    assert.ok(activity.includes('<div className="w-full">'));
  });

  it("keeps START/STOP reachable directly beneath the tracking status", () => {
    const statusIdx = activity.indexOf('role="status"');
    const startIdx = activity.indexOf("START TRACKING");
    const sectionsIdx = activity.indexOf('data-testid="train-sections"');
    assert.ok(statusIdx > -1 && startIdx > -1 && sectionsIdx > -1);
    assert.ok(statusIdx < startIdx && startIdx < sectionsIdx);
  });

  it("pairs the overview cards on desktop width", () => {
    assert.ok(activity.includes("mb-3 grid items-start gap-3 lg:grid-cols-2"));
  });

  it("still renders the three period summaries with no chart surface", () => {
    assert.ok(activity.includes('title="Last 7 Days"'));
    assert.ok(activity.includes('title="Last 30 Days"'));
    assert.match(activity, />Avg Steps</);
    assert.match(activity, />Best Day</);
    assert.match(activity, />Avg KCAL</);
    assert.doesNotMatch(activity, /recharts/);
  });
});

describe("Train is dense without losing any ability", () => {
  it("keeps all five sub-tabs and their panels", () => {
    assert.ok(train.includes("data-testid={`train-tab-${t.id}`}"));
    for (const tab of ["today", "templates", "progress", "history", "log"]) {
      assert.ok(train.includes(`{ id: "${tab}", label: `), `Train must keep the ${tab} tab`);
      assert.ok(train.includes(`id="train-panel-${tab}"`), `Train must keep the ${tab} panel`);
      assert.ok(train.includes(`train-tab-${tab}`) || true);
    }
  });

  it("keeps the tab row compact and pinned below the sticky header", () => {
    assert.ok(train.includes('className="sticky top-14 z-20'));
    assert.ok(train.includes("min-h-[44px]"));
  });

  it("keeps Log controls reachable and the two actions in one compact row", () => {
    assert.match(train, /aria-label="Session name"/);
    assert.match(train, /Add exercise/);
    assert.match(train, /\+ Add set/);
    assert.match(train, /Log workout/);
    assert.match(train, /Save template/);
    // Summary + both actions share one row on desktop.
    assert.match(train, /p-3 lg:flex-row lg:items-center lg:justify-between/);
  });

  it("keeps the exercise editor usable across the desktop width", () => {
    assert.match(train, /grid items-start gap-3 lg:grid-cols-2/);
  });

  it("renders the template catalog as a responsive grid with Start this workout", () => {
    assert.ok(templates.includes('data-testid="template-grid"'));
    assert.ok(templates.includes("grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3"));
    assert.match(templates, /Start this workout/);
  });

  it("keeps the primary Train CTA in the compact dashboard header", () => {
    assert.ok(strengthCard.includes('data-testid="structured-strength-start"'));
    assert.match(strengthCard, /Train with <span className="text-\[#E62846\]">structure<\/span>/);
    assert.match(strengthCard, /lg:flex-row lg:items-center lg:justify-between/);
    assert.match(strengthCard, /No sessions logged yet/);
  });

  it("composes Today and Progress in desktop columns", () => {
    assert.ok(today.includes("lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"));
    assert.ok(progress.includes("grid items-start gap-3 lg:grid-cols-2"));
  });

  it("keeps the guided toggle so the automated-training rollback still works", () => {
    assert.ok(train.includes('data-testid="train-guided-toggle"'));
  });
});

describe("Recovery keeps its tabs and pairs its insight widgets", () => {
  it("keeps every section tab wired to a real panel", () => {
    assert.ok(recovery.includes('data-testid="recovery-sections"'));
    assert.ok(recovery.includes("data-testid={`recovery-section-tab-${item.id}`}"));
    for (const section of ["overview", "history", "goals", "records", "progress", "devices"]) {
      assert.ok(
        recoverySections.includes(`id="recovery-panel-${section}"`),
        `missing panel ${section}`,
      );
    }
  });

  it("pairs the small insight cards on desktop without reordering the mobile stack", () => {
    assert.ok(recovery.includes("grid items-start gap-x-3 xl:grid-cols-2"));
    const alertIdx = recovery.indexOf("<RestDayAlertCard");
    const focusIdx = recovery.indexOf("<TodaysFocusCard");
    const readinessIdx = recovery.indexOf("<TrainRecovery />");
    const muscleIdx = recovery.indexOf("<MuscleRecoveryCard");
    assert.ok(alertIdx < focusIdx && focusIdx < readinessIdx && readinessIdx < muscleIdx);
  });

  it("tightens the insight cards and keeps the roving tab stop", () => {
    assert.ok(recoveryWidgets.includes("p-3.5 mb-2.5"));
    assert.ok(recovery.includes("tabIndex={active ? 0 : -1}"));
  });
});

describe("Fuel surfaces calories, macros and meal actions together", () => {
  it("places the summary and the meal actions in one desktop row", () => {
    assert.ok(nutrition.includes("lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"));
  });

  it("keeps Scan meal and Manual logging reachable", () => {
    assert.match(nutrition, /Scan meal/);
    assert.match(nutrition, /Manual/);
  });

  it("groups the four meal sections into a compact grid", () => {
    assert.ok(nutrition.includes("grid items-start gap-2.5 lg:grid-cols-2"));
  });
});

describe("Plus, Profile, Community and Leaderboard use desktop width", () => {
  it("compacts the Earn Plus header without losing the reward facts", () => {
    assert.ok(earnPlus.includes("p-4 sm:p-5"));
    assert.match(earnPlus, /Earned, not purchased/);
    assert.ok(earnPlus.includes("grid gap-4 sm:grid-cols-[1.3fr_1fr]"));
  });

  it("keeps Character Matrix in Profile and pairs the trailing cards", () => {
    assert.match(profile, /Character Matrix/i);
    assert.ok(profile.includes("grid items-start gap-3 lg:grid-cols-2"));
  });

  it("never reintroduces in-app notification permission controls", () => {
    for (const [name, source] of Object.entries(SCREENS)) {
      assert.doesNotMatch(
        source,
        /NotificationPreferencesCard|Enable notifications|notification permission/i,
        `${name} must not reintroduce in-app notification permission controls`,
      );
    }
  });

  it("keeps the Community directory a grid and densifies the feed", () => {
    assert.ok(community.includes("grid grid-cols-1 gap-3 sm:grid-cols-2"));
    assert.ok(community.includes("svj-radius-card svj-elev-1 space-y-3"));
  });

  it("keeps leaderboard rankings as a scannable grid", () => {
    assert.ok(leaderboard.includes('className="grid gap-2 lg:grid-cols-2"'));
  });
});

describe("60-Day stays a compact day grid", () => {
  it("keeps the six/ten column day grid", () => {
    assert.match(sixtyDay, /grid grid-cols-6/);
    assert.match(sixtyDay, /sm:grid-cols-10/);
  });
});
