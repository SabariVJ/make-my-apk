// Exercise the real provider and form components with synthetic accounts only.
// Only Supabase and decorative confetti are replaced; no live requests are made.
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://svj.test/" });
for (const key of [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLFormElement",
  "HTMLButtonElement",
  "NodeFilter",
  "PointerEvent",
  "SVGElement",
  "Element",
  "Node",
  "CustomEvent",
  "Event",
  "MutationObserver",
  "DocumentFragment",
  "HTMLSelectElement",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? dom.window : dom.window[key],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
dom.window.HTMLElement.prototype.setPointerCapture = () => {};
dom.window.HTMLElement.prototype.releasePointerCapture = () => {};
dom.window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

const { render, cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const realSet = dom.window.Storage.prototype.setItem;
let temporary;
let app;
let api;
let view;

before(async () => {
  temporary = await mkdtemp(path.resolve(".activity-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { SVJProvider, useSVJ } from './src/app/context/SVJContext';
      export { WorkoutView } from './src/app/views/WorkoutView';
      export { NutritionView } from './src/app/views/NutritionView';
      export { ChallengesView } from './src/app/views/ChallengesView';
      export { INITIAL_USER, INITIAL_CHALLENGES } from './src/app/data/initialData';
    `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    define: { "import.meta.env.DEV": "false" },
    plugins: [
      {
        name: "isolated-services",
        setup(builder) {
          builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^@\/lib\/challenge.functions$/ }, () => ({
            path: "challenge",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^@\/lib\/engagement.functions$/ }, () => ({
            path: "engagement",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^@tanstack\/react-start$/ }, () => ({
            path: "start",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^canvas-confetti$/ }, () => ({
            path: "confetti",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            contents: {
              auth: "export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};",
              challenge: "export const getChallengeState=async()=>null;",
              engagement:
                "export const getEngagementState=async()=>({ok:false,error:'not configured'}); export const claimDailyCheckin=getEngagementState; export const startDailyMission=getEngagementState; export const completeDailyMission=getEngagementState; export const redeemEarnedPlus=getEngagementState;",
              start:
                "export const useServerFn=fn=>fn; export const createServerFn=(opts)=>({middleware:()=>({handler:(h)=>h}),validator:()=>({middleware:()=>({handler:(h)=>h})})});",
              confetti: `export default function(){if(document.body.dataset.canvasFault==='throw')throw Error('Canvas unavailable');if(document.body.dataset.canvasFault==='reject')return Promise.reject(Error('Canvas failed'));return Promise.resolve();}`,
            }[target],
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});

beforeEach(() => {
  dom.window.Storage.prototype.setItem = realSet;
  localStorage.clear();
  delete document.body.dataset.canvasFault;
  for (const [suffix, value] of Object.entries({
    user: app.INITIAL_USER,
    challenges: app.INITIAL_CHALLENGES,
    feed: [],
    leaderboard: [],
    workouts: [],
    meals: [],
    rewards: [],
  })) {
    localStorage.setItem(`svj_app_state_v5_${suffix}`, JSON.stringify(value));
  }
});

afterEach(async () => {
  dom.window.Storage.prototype.setItem = realSet;
  await act(async () => cleanup());
});
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

async function mount(Component) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Capture() {
    api = app.useSVJ();
    return Component
      ? React.createElement(Component)
      : React.createElement("p", null, api.user.totalXP);
  }
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(app.SVJProvider, null, React.createElement(Capture)),
        ),
      ),
    );
  });
}

const exercise = [{ id: "qa-exercise", name: "Squats", sets: [{ reps: 8, weight: 20 }] }];

describe("real activity components", { concurrency: false }, () => {
  it("completes one task once under StrictMode and reverses the same XP on undo", async () => {
    await mount();
    const task = api.challenges[0];
    const before = api.user.totalXP;
    await act(async () => api.toggleChallenge(task.id));
    assert.equal(api.user.totalXP, before + task.xp);
    assert.equal(api.feed.length, 1);
    assert.equal(api.user.totalChallengesCompleted, 1);
    await act(async () => api.toggleChallenge(task.id));
    assert.equal(api.user.totalXP, before);
    assert.equal(api.user.totalChallengesCompleted, 0);
  });

  it("logs a workout and meal for a legacy profile missing XP history, and restores both", async () => {
    const legacy = { ...app.INITIAL_USER, totalXP: 100285, xpHistory: undefined };
    localStorage.setItem("svj_app_state_v5_user", JSON.stringify(legacy));
    await mount();
    await act(async () => assert.equal(api.logWorkout("Leg day", exercise).ok, true));
    await act(async () => assert.equal(api.logMeal("Lunch", 450, "Lunch").ok, true));
    assert.equal(api.user.totalXP, 100370);
    assert.equal(api.workouts.length, 1);
    assert.equal(api.meals.length, 1);
    await act(async () => view.unmount());
    await mount();
    assert.equal(api.user.totalXP, 100370);
    assert.equal(api.workouts[0].name, "Leg day");
    assert.equal(api.meals[0].name, "Lunch");
  });

  it("survives synchronous and asynchronous celebration failures", async () => {
    await mount();
    document.body.dataset.canvasFault = "throw";
    await act(async () => assert.equal(api.logWorkout("Leg day", exercise).ok, true));
    document.body.dataset.canvasFault = "reject";
    await act(async () => assert.equal(api.logMeal("Lunch", 450, "Lunch").ok, true));
    assert.equal(api.workouts.length, 1);
    assert.equal(api.meals.length, 1);
  });

  it("shows a tier change after a committed grant without render loops", async () => {
    localStorage.setItem(
      "svj_app_state_v5_user",
      JSON.stringify({ ...app.INITIAL_USER, totalXP: 2490 }),
    );
    await mount();
    await act(async () => api.logMeal("Lunch", 450, "Lunch"));
    assert.deepEqual(api.levelUpModalData, { oldTier: "Initiate", newTier: "Bronze" });
    assert.equal(api.user.totalXP, 2550);
  });

  it("keeps a failed meal form intact and can retry without duplicate XP", async () => {
    await mount(app.NutritionView);
    fireEvent.change(screen.getByPlaceholderText("e.g. Grilled chicken & rice"), {
      target: { value: "Test meal" },
    });
    fireEvent.change(screen.getByPlaceholderText("kcal"), { target: { value: "450" } });
    dom.window.Storage.prototype.setItem = () => {
      throw new dom.window.DOMException("Full", "QuotaExceededError");
    };
    fireEvent.click(screen.getByRole("button", { name: /Log meal/ }));
    assert.match(screen.getByRole("alert").textContent, /Could not save/);
    assert.equal(screen.getByPlaceholderText("kcal").value, "450");
    assert.equal(api.meals.length, 0);
    assert.equal(api.user.totalXP, 0);
    dom.window.Storage.prototype.setItem = realSet;
    fireEvent.click(screen.getByRole("button", { name: /Log meal/ }));
    assert.equal(api.meals.length, 1);
    assert.equal(api.user.totalXP, 60);
    assert.equal(screen.getByPlaceholderText("kcal").value, "");
  });

  it("keeps a failed workout form intact and moves to history only after saving", async () => {
    await mount(app.WorkoutView);
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Leg day" } });
    fireEvent.change(screen.getByLabelText("Exercise 1 name"), { target: { value: "Squats" } });
    dom.window.Storage.prototype.setItem = () => {
      throw new dom.window.DOMException("Full", "QuotaExceededError");
    };
    fireEvent.click(screen.getByRole("button", { name: "Log workout" }));
    assert.match(screen.getByRole("alert").textContent, /Could not save/);
    assert.equal(screen.getByLabelText("Session name").value, "Leg day");
    assert.equal(api.workouts.length, 0);
    assert.equal(api.user.totalXP, 0);
    dom.window.Storage.prototype.setItem = realSet;
    fireEvent.click(screen.getByRole("button", { name: "Log workout" }));
    await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Leg day" })));
    assert.equal(api.workouts.length, 1);
    assert.equal(api.user.totalXP, 25);
  });

  it("does not complete a task or grant XP when saving is refused", async () => {
    await mount(app.ChallengesView);
    dom.window.Storage.prototype.setItem = () => {
      throw new dom.window.DOMException("Full", "QuotaExceededError");
    };
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    assert.match(screen.getByRole("alert").textContent, /Could not save/);
    assert.equal(api.challenges[0].completed, false);
    assert.equal(api.user.totalXP, 0);
  });

  it("edits the same custom task, preserves earned XP on rename, and rejects reward changes after completion", async () => {
    await mount();
    await act(async () => api.addCustomChallenge("Read", "Mental", "Medium"));
    const id = api.challenges[0].id;
    await act(async () =>
      api.updateCustomChallenge(id, {
        title: "Read 20 pages",
        category: "Mental",
        difficulty: "Hard",
      }),
    );
    assert.equal(api.challenges[0].id, id);
    assert.equal(api.challenges[0].xp, 120);
    assert.equal(api.user.totalXP, 0);
    await act(async () => api.toggleChallenge(id));
    await act(async () =>
      api.updateCustomChallenge(id, {
        title: "Read a chapter",
        category: "Mental",
        difficulty: "Hard",
      }),
    );
    assert.equal(api.user.totalXP, 120);
    assert.equal(api.challenges[0].earnedXP, 120);
    await act(async () =>
      assert.equal(
        api.updateCustomChallenge(id, {
          title: "Read a chapter",
          category: "Mental",
          difficulty: "Elite",
        }).ok,
        false,
      ),
    );
    await act(async () => api.toggleChallenge(id));
    assert.equal(api.user.totalXP, 0);
  });

  it("offers labeled dark selectors, saves edits, and cancels without changing the task", async () => {
    await mount(app.ChallengesView);
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Read a book" } });
    assert.ok(screen.getByRole("combobox", { name: "Category" }));
    const difficulty = screen.getByRole("combobox", { name: "Difficulty" });
    fireEvent.keyDown(difficulty, { key: "ArrowDown" });
    const choice = await screen.findByRole("option", { name: "Hard (120 XP)" });
    assert.match(screen.getByRole("listbox").className, /bg-\[#17171A\]/);
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole("button", { name: "Add Task to Mission" }));
    assert.equal(api.challenges[0].title, "Read a book");
    assert.equal(api.challenges[0].xp, 120);
    fireEvent.click(screen.getByRole("button", { name: "Edit Read a book" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Read two books" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    assert.equal(api.challenges[0].title, "Read a book");
    fireEvent.click(screen.getByRole("button", { name: "Edit Read a book" }));
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Read one chapter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    assert.equal(api.challenges[0].title, "Read one chapter");
    assert.equal(api.user.totalXP, 0);
  });

  it("does not mint welcome XP on repeated profile setup", async () => {
    await mount();
    const profile = { name: "Test member", username: "test", bio: "", location: "", avatar: "" };
    await act(async () => api.completeOnboarding(profile));
    await act(async () => api.completeOnboarding(profile));
    assert.equal(api.user.totalXP, 0);
    assert.equal(api.user.weeklyXP, 0);
    assert.equal(api.user.monthlyXP, 0);
  });
});
