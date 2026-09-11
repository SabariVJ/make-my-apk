// Regression contracts for the automatic Activity (step counter) feature.
// Mirrors tests/android-features.test.mjs: assert real source so wiring cannot
// silently regress.
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFile(new URL("../" + rel, import.meta.url), "utf8");

const navigation = await read("src/app/components/Navigation.tsx");
const app = await read("src/app/App.tsx");
const challengesView = await read("src/app/views/ChallengesView.tsx");
const activityContext = await read("src/app/context/ActivityContext.tsx");
const activityView = await read("src/app/views/ActivityView.tsx");
const activitySummary = await read("src/app/components/ActivitySummaryCard.tsx");
const tracker = await read("src/app/lib/activityTracker.ts");
const pkg = JSON.parse(await read("package.json"));
const capBuild = await read("android/app/capacitor.build.gradle");
const capSettings = await read("android/capacitor.settings.gradle");
const vjPedometer = await read("src/app/lib/vj-pedometer.ts");
const vjPluginJava = await read("android/app/src/main/java/app/lovable/svj/VjPedometerPlugin.java");
const mainActivity = await read("android/app/src/main/java/app/lovable/svj/MainActivity.java");
const accelDetector = await read("android/app/src/main/java/app/lovable/svj/AccelStepDetector.java");

test("the Activity tab exists between Challenges and Train", () => {
  const items = [...navigation.matchAll(/id: "([a-z]+)", label: "(.+?)", icon/g)].map((m) => m[1]);
  const challengesIdx = items.indexOf("challenges");
  const activityIdx = items.indexOf("activity");
  const workoutsIdx = items.indexOf("workouts");
  assert.ok(challengesIdx > -1, "challenges tab missing");
  assert.ok(activityIdx > -1, "activity tab missing");
  assert.ok(workoutsIdx > -1, "workouts tab missing");
  assert.equal(activityIdx, challengesIdx + 1, "activity must directly follow challenges");
  assert.equal(workoutsIdx, activityIdx + 1, "train must directly follow activity");
  // The tab type includes the new route.
  assert.match(navigation, /\|\s*"activity"/);
});

test("the app routes the Activity tab and mounts the tracking provider", () => {
  assert.match(app, /import \{ ActivityView \} from "\.\/views\/ActivityView"/);
  assert.match(app, /import \{ ActivityProvider \} from "\.\/context\/ActivityContext"/);
  assert.match(app, /\{activeTab === "activity" && <ActivityView \/>\}/);
  assert.match(app, /<ActivityProvider userId=\{status\?\.userId \?\? null\}>/);
  // The app-local Android plugin is registered natively before the bridge is
  // created, and JS reaches it through Capacitor.registerPlugin (never through
  // the non-existent window.Capacitor.plugins global).
  assert.match(mainActivity, /registerPlugin\(VjPedometerPlugin\.class\)/);
  assert.ok(
    mainActivity.indexOf("registerPlugin(VjPedometerPlugin.class)") <
      mainActivity.indexOf("super.onCreate(savedInstanceState)"),
    "plugin registration must happen before super.onCreate()",
  );
  assert.match(vjPedometer, /registerPlugin<VjNativePlugin>\("VjPedometer"\)/);
  assert.match(vjPedometer, /Capacitor\.isPluginAvailable\("VjPedometer"\)/);
  assert.doesNotMatch(vjPedometer, /Capacitor\?\.plugins/);
});

test("the homepage shows a compact Activity card above the Character Hexagon Matrix", () => {
  assert.match(challengesView, /onOpenActivity/);
  assert.match(challengesView, /<ActivitySummaryCard onOpen=\{onOpenActivity\} \/>/);
  const cardIdx = challengesView.indexOf("ActivitySummaryCard");
  const hexagonIdx = challengesView.indexOf("Character Hexagon Matrix");
  assert.ok(cardIdx > -1 && hexagonIdx > -1);
  assert.ok(cardIdx < hexagonIdx, "activity card must render above the hexagon");
  assert.match(activitySummary, /% OF STEP GOAL/);
  assert.match(activitySummary, /KCAL/);
});

test("step tracking is native-sensor based with a graceful web fallback", () => {
  assert.match(pkg.dependencies["@capgo/capacitor-pedometer"], /\^8\./);
  assert.match(capBuild, /capgo-capacitor-pedometer/);
  assert.match(capSettings, /capgo-capacitor-pedometer/);
  // Runtime degrades safely when the native plugin is absent (published web
  // app runs before a new APK is built).
  assert.match(activityContext, /loadPedometer/);
  assert.match(activityContext, /['"]denied['"]|['"]unsupported['"]/);
  assert.match(activityContext, /requestPermissions/);
  assert.match(activityContext, /startMeasurementUpdates/);
  assert.match(activityContext, /startAndroidTracking/);
  // Universal Android sensor hierarchy: counter -> detector -> accelerometer.
  const counterIdx = vjPluginJava.indexOf("TYPE_STEP_COUNTER");
  const detectorIdx = vjPluginJava.indexOf("TYPE_STEP_DETECTOR");
  const accelIdx = vjPluginJava.indexOf("TYPE_ACCELEROMETER");
  assert.ok(counterIdx > -1 && detectorIdx > -1 && accelIdx > -1);
  assert.ok(counterIdx < detectorIdx && detectorIdx < accelIdx);
  assert.match(vjPluginJava, /registerListener\(this, selectedSensor/);
  assert.match(vjPluginJava, /accelDetector\.onSample/);
  assert.match(accelDetector, /MIN_STEP_INTERVAL_MS/);
  // Mode-aware status copy so the Activity screen never says only "Connecting…".
  assert.match(activityContext, /Step tracking active — hardware counter\./);
  assert.match(activityContext, /Step tracking active — motion estimate/);
  assert.match(activityContext, /No compatible step sensor found on this device\./);
  assert.match(activityView, /Estimated steps — accelerometer motion detection/);
});

test("daily counts persist and reset at midnight", () => {
  assert.match(tracker, /rollActivityDay/);
  assert.match(tracker, /ACTIVITY_HISTORY_CAP = 60/);
  assert.match(activityContext, /svj_activity_v1/);
  assert.match(activityContext, /rollActivityDay\(prev, now\)/);
  // Session-relative Android steps are merged on top of the persisted baseline
  // (sessionRefSteps/sessionLastSteps keep the live session anchored).
  assert.match(tracker, /sessionRefSteps/);
  assert.match(tracker, /sessionLastSteps/);
  assert.match(activityContext, /nativeState/);
  assert.match(activityContext, /STARTUP_WINDOW_MS/);
});

test("calories are labeled as estimates and split active vs total", () => {
  assert.match(activityView, /Active Calories/);
  assert.match(activityView, /Total Calories/);
  assert.match(activityView, /Estimate/);
  assert.match(activityView, /estimates calculated from steps, distance and your SVJ body profile/);
});

test("step-milestone XP cannot be double-awarded on the same day", () => {
  // Thresholds exactly as specified.
  assert.deepEqual(
    [...tracker.matchAll(/steps: (\d+), xp: (\d+)/g)].map((m) => Number(m[1])),
    [2500, 5000, 7500, 10000],
  );
  // Claim is persisted BEFORE the XP is granted, and the award loop runs in an
  // effect with a replay guard — never inside a state updater (StrictMode).
  const claimFirst =
    activityContext.indexOf("claimMilestone(prev") <
    activityContext.indexOf("awardXp(milestone.xp, { physical: 1 })");
  assert.ok(claimFirst, "milestone must be claimed before XP is granted");
  assert.match(activityContext, /paidMilestonesRef/);
  // Diagnostics stay on by default on Android and are switched off only by the
  // native release (non-debuggable) flag, never by import.meta.env.DEV.
  assert.match(activityContext, /showDiagnostics/);
  assert.match(activityContext, /info\.debug === false/);
});

test("activity XP flows through the existing SVJ XP system", () => {
  assert.match(activityContext, /awardXp\(milestone\.xp, \{ physical: 1 \}\)/);
  assert.match(activityContext, /addActivity\(/);
  assert.match(activityContext, /useSVJ\(\)/);
});

test("history provides 7-day and 30-day views with averages and best day", () => {
  assert.match(activityContext, /buildHistory\(state, new Date\(\), 7\)/);
  assert.match(activityContext, /buildHistory\(state, new Date\(\), 30\)/);
  assert.match(activityView, /Last 7 Days/);
  assert.match(activityView, /Last 30 Days/);
  assert.match(activityView, /Avg Steps/);
  assert.match(activityView, /Best Day/);
  assert.match(activityView, /Avg KCAL/);
  assert.match(activityView, /ANDROID PEDOMETER DEBUG/);
});
