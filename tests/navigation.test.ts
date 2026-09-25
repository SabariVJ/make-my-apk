// Navigation + information-architecture regression tests.
//
// These pin the shipped source so the hierarchy cannot silently drift back to
// the old nine-tab bottom bar, and they exercise the pure 60-Day summary so the
// Challenges card can never report progress the athlete has not earned.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TOTAL_MISSIONS,
  missionsForDays,
  summarizeSixtyDayProgram,
} from "../src/lib/challengeProgress";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

const navigation = await read("../src/app/components/Navigation.tsx");
const utilityNav = await read("../src/app/components/UtilityNav.tsx");
const utilityModel = await read("../src/app/lib/utilityNav.ts");
const app = await read("../src/app/App.tsx");
const header = await read("../src/app/components/Header.tsx");
const challenges = await read("../src/app/views/ChallengesView.tsx");
const sixtyCard = await read("../src/app/components/SixtyDayProgramCard.tsx");
const train = await read("../src/app/views/WorkoutView.tsx");
const strengthCard = await read("../src/app/components/StructuredStrengthCard.tsx");

/** Ids declared by a `{ id: "x", label: "Y", icon }` style nav list. */
function navIds(source: string): string[] {
  return [...source.matchAll(/id: "([a-z]+)", label: "/g)].map((m) => m[1]);
}

describe("primary navigation is five destinations", () => {
  it("lists exactly Challenges, Activity, Train, Fuel and Plus", () => {
    const primary = navIds(navigation);
    assert.deepEqual(
      primary.slice(0, 5),
      ["challenges", "activity", "workouts", "nutrition", "plus"],
      "the primary bottom navigation must be the five core destinations",
    );
  });

  it("drops 60 Day, Community, Leaderboard and Profile from the bottom bar", () => {
    const primary = navIds(navigation).slice(0, 5);
    for (const gone of ["sixty", "community", "leaderboard", "profile"]) {
      assert.ok(!primary.includes(gone), `${gone} must not be a bottom-nav tab`);
    }
    // "60 Day" survives ONLY as a destination of the post-trial restricted
    // shell, where it is one of the few unlocked surfaces.
    const sixtyLabels = [...navigation.matchAll(/label: "60 Day"/g)].length;
    assert.equal(sixtyLabels, 1, "60 Day must not be duplicated into the primary nav");
    const restrictedIdx = navigation.indexOf("restrictedNavItems");
    assert.ok(
      navigation.indexOf('label: "60 Day"') > restrictedIdx,
      "the only 60 Day entry must be the restricted shell's",
    );
  });

  it("keeps the bottom bar typography and background tokens intact", () => {
    assert.match(navigation, /fixed bottom-0 left-0 right-0/);
    assert.match(navigation, /bg-\[#0B0B0C\]\/95/);
  });
});

describe("60-Day program lives inside Challenges", () => {
  it("renders the program card on the Challenges screen", () => {
    assert.match(challenges, /<SixtyDayProgramCard/);
    assert.match(challenges, /import \{ SixtyDayProgramCard \}/);
  });

  it("drives the card from the existing server challenge state", () => {
    assert.match(challenges, /state=\{sixtyDayQuery\.data \?\? null\}/);
    assert.match(challenges, /onOpen=\{onOpenSixtyDay\}/);
  });

  it("opens the pre-existing 60-Day route instead of a new one", () => {
    assert.match(sixtyCard, /onClick=\{onOpen\}/);
    // Challenges still routes to the same tab App already renders.
    assert.match(app, /onOpenSixtyDay=\{\(\) => handleTabChange\("sixty"\)\}/);
    assert.match(app, /\{activeTab === "sixty" && <SixtyDayChallengeView \/>\}/);
  });

  it("shows all three program states without inventing progress", () => {
    assert.match(sixtyCard, /Start 60 Day/);
    assert.match(sixtyCard, /Continue program/);
    assert.match(sixtyCard, /View transformation/);
    assert.match(sixtyCard, /summary\.missionsCompleted/);
    assert.match(sixtyCard, /summary\.currentStreak/);
  });

  it("keeps Earn Plus above it in the hierarchy", () => {
    const earnIdx = challenges.indexOf("<EarnPlusCard");
    const sixtyIdx = challenges.indexOf("<SixtyDayProgramCard");
    assert.ok(earnIdx > -1 && sixtyIdx > -1, "both program cards must render");
    assert.ok(earnIdx < sixtyIdx, "Earn Plus must precede the 60-Day program card");
  });

  it("marks Challenges active while the athlete is inside 60-Day", () => {
    assert.match(navigation, /sixty: "challenges"/);
    assert.match(navigation, /CLUSTERED_TABS\[activeTab\] === item\.id/);
  });
});

describe("Structured Strength is promoted into Train", () => {
  it("mounts the existing logger from Train", () => {
    assert.match(train, /import \{ TrainStrength[^}]*\} from "\.\/TrainStrength"/);
    assert.match(train, /<TrainStrength\s+prescription=\{prescription\}\s+onExit=/);
    assert.match(train, /<StructuredStrengthCard/);
  });

  it("places the card above the existing training tools", () => {
    const cardIdx = train.indexOf("<StructuredStrengthCard");
    // The tab row keeps its `role="tablist"` contract; only its comment changed
    // during the responsive-density pass, so anchor on the role instead.
    const tabsIdx = train.indexOf('role="tablist"');
    assert.ok(cardIdx > -1 && tabsIdx > -1, "Train must render the card and its tools");
    assert.ok(cardIdx < tabsIdx, "Structured Strength must lead the Train screen");
  });

  it("opens the existing strength workflow from the CTA", () => {
    assert.match(strengthCard, /onClick=\{onStart\}/);
    // The CTA still opens the same structured logger; it now prefers the
    // planned session's targets when one exists.
    assert.match(train, /onStart=\{\(\) => \{/);
    assert.match(train, /setStrengthOpen\(true\)/);
  });

  it("reports only real last-session data", () => {
    assert.match(train, /source === "strength_log"/);
    assert.match(strengthCard, /No sessions logged yet/);
  });
});

describe("secondary destinations moved to the utility rail", () => {
  it("defines Community, Leaderboard and Profile in rail order", () => {
    const ids = navIds(utilityModel);
    assert.deepEqual(ids, ["community", "leaderboard", "profile"]);
  });

  it("keeps the Android Leaderboard rule in the shared utility model", () => {
    assert.match(utilityModel, /isAndroid && item\.id === "leaderboard"/);
  });

  it("renders a fixed right-side vertical rail", () => {
    assert.match(utilityNav, /data-testid="utility-rail"/);
    assert.match(utilityNav, /fixed right-0 top-1\/2/);
    assert.match(utilityNav, /hidden.*lg:flex/);
  });

  it("gives the active rail item the SVJ red state", () => {
    assert.match(utilityNav, /bg-\[#C81E3A\]\/15/);
    assert.match(utilityNav, /text-\[#C81E3A\]/);
  });

  it("routes every rail item through the existing tab handler", () => {
    assert.match(utilityNav, /onClick=\{\(\) => setActiveTab\(item\.id\)\}/);
    assert.match(app, /<UtilityRail activeTab=\{activeTab\} setActiveTab=\{handleTabChange\} \/>/);
  });

  it("keeps Community, Leaderboard and Profile rendering their existing views", () => {
    assert.match(app, /\{activeTab === "community" && <CommunityView \/>\}/);
    assert.match(app, /\{activeTab === "leaderboard" && <LeaderboardView \/>\}/);
    assert.match(app, /\{activeTab === "profile" && <ProfileView \/>\}/);
  });
});

describe("primary nav spacing is compact", () => {
  it("uses gap instead of full-width justify-around on desktop", () => {
    assert.doesNotMatch(navigation, /justify-around/);
    assert.doesNotMatch(navigation, /justify-between/);
    assert.doesNotMatch(navigation, /justify-evenly/);
  });

  it("does not use flex-1 on nav items", () => {
    assert.doesNotMatch(navigation, /\bflex-1\b/);
  });

  it("uses w-fit so the tab group stays compact instead of full-width", () => {
    assert.match(navigation, /w-fit/);
  });

  it("applies consistent gap between tabs", () => {
    assert.match(navigation, /gap-1/);
  });

  it("keeps a minimum touch target width on each tab", () => {
    assert.match(navigation, /min-w-\[/);
  });

  it("uses grid on mobile and flex at sm+ for the compact dock", () => {
    assert.match(navigation, /grid grid-cols-5/);
    assert.match(navigation, /sm:flex/);
  });
});

describe("mobile responsiveness", () => {
  it("renders the utility drawer for narrow screens", () => {
    assert.match(utilityNav, /UtilityDrawer/);
    assert.match(utilityNav, /data-testid=\{`utility-drawer-\$\{item\.id\}`\}/);
    assert.match(app, /<UtilityDrawer/);
  });

  it("exposes a header trigger that is hidden once the rail is available", () => {
    assert.match(header, /onOpenUtilityMenu/);
    assert.match(header, /data-testid="utility-menu-trigger"/);
    assert.match(header, /lg:hidden/);
    assert.match(app, /<Header onOpenUtilityMenu=\{\(\) => setUtilityMenuOpen\(true\)\} \/>/);
  });

  it("keeps the profile avatar opening the one existing Profile route", () => {
    assert.match(header, /setIsEditProfileOpen\(true\)/);
    assert.equal(
      [...app.matchAll(/<ProfileView \/>/g)].length,
      2,
      "Profile renders from one shared view in both shells",
    );
  });
});

describe("layout safety for the rail", () => {
  it("reserves right-side space so the rail cannot cover content", () => {
    // One shared container owns the page padding and the rail reservation, and
    // grows the desktop content box instead of pinning it to a phone width.
    assert.match(app, /const PAGE_CONTAINER =/);
    assert.match(app, /sm:px-6/);
    assert.match(app, /const PAGE_CONTAINER_DESKTOP = "lg:max-w-\[86rem\] lg:pr-28"/);
    assert.match(app, /\$\{PAGE_CONTAINER\} \$\{PAGE_CONTAINER_DESKTOP\}/);
  });

  it("keeps the rail out of document flow (no horizontal scroll)", () => {
    assert.match(utilityNav, /fixed right-0/);
    assert.doesNotMatch(utilityNav, /overflow-x-(scroll|auto)/);
    assert.doesNotMatch(app, /overflow-x-(scroll|auto)/);
  });
});

describe("60-Day progress summary reports real progress only", () => {
  it("derives the real mission total from the program definition", () => {
    assert.ok(TOTAL_MISSIONS > 0, "the program must define missions");
    assert.equal(missionsForDays(0), 0);
    assert.equal(missionsForDays(60), TOTAL_MISSIONS);
    assert.ok(missionsForDays(30) < TOTAL_MISSIONS);
  });

  it("treats unknown state as not started rather than in progress", () => {
    const summary = summarizeSixtyDayProgram(null);
    assert.equal(summary.status, "not_started");
    assert.equal(summary.daysCompleted, 0);
    assert.equal(summary.missionsCompleted, 0);
    assert.equal(summary.percent, 0);
  });

  it("reports in-progress days, missions, streak and percent faithfully", () => {
    const summary = summarizeSixtyDayProgram({
      status: "active",
      currentDay: 13,
      daysCompleted: 12,
      currentStreak: 5,
    });
    assert.equal(summary.status, "active");
    assert.equal(summary.currentDay, 13);
    assert.equal(summary.daysCompleted, 12);
    assert.equal(summary.missionsCompleted, missionsForDays(12));
    assert.equal(summary.currentStreak, 5);
    assert.equal(summary.totalDays, 60);
    assert.equal(summary.percent, 20);
  });

  it("clamps out-of-range values instead of inflating progress", () => {
    const summary = summarizeSixtyDayProgram({
      status: "active",
      currentDay: 999,
      daysCompleted: 999,
      currentStreak: -4,
    });
    assert.equal(summary.daysCompleted, 60);
    assert.equal(summary.currentDay, 60);
    assert.equal(summary.currentStreak, 0);
    assert.equal(summary.percent, 100);
  });

  it("never infers completion from progress alone", () => {
    const summary = summarizeSixtyDayProgram({
      status: "paused",
      currentDay: 60,
      daysCompleted: 59,
      currentStreak: 0,
    });
    assert.equal(summary.status, "paused");
  });
});
