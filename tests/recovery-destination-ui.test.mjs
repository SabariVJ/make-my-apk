// Phase 1 Recovery destination — real component rendering (jsdom).
//
// Renders the actual Navigation and RecoveryView with a synthetic account so
// the founder-only rollout is verified behaviourally, not just by source
// assertions: six destinations for the founder, five (byte-identical set) for
// everyone else, and the six accessible Recovery sections.
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
  "HTMLButtonElement",
  "Element",
  "Node",
  "CustomEvent",
  "Event",
  "MutationObserver",
  "DocumentFragment",
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

const { render, cleanup, fireEvent, screen } = await import("@testing-library/react");
let temporary;
let app;

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { Navigation } from './src/app/components/Navigation';
      export { RecoveryView } from './src/app/components/RecoveryView';
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
        name: "isolated-recovery",
        setup(builder) {
          // The recovery rollout decision must come from the real founder gate,
          // which reads this provider — the mock only supplies the account.
          builder.onResolve({ filter: /^\.\.\/context\/SVJContext$/ }, () => ({
            path: "context",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^\.\.\/views\/TrainRecovery$/ }, () => ({
            path: "overview",
            namespace: "mock",
          }));
          // The Phase-3 data hook must stay out of this shell test — the real
          // one reads Supabase env config at mount. The widgets themselves are
          // covered by tests/recovery-insights-widgets.test.mjs.
          builder.onResolve({ filter: /^\.\.\/hooks\/useRecoveryInsights$/ }, () => ({
            path: "insights",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^motion\/react$/ }, () => ({
            path: "motion",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: {
              context: "export const useSVJ = () => globalThis.__svjRecoveryAccount;",
              insights:
                "export const useRecoveryInsights = () => ({ goals: [], trainingProfile: null, muscleRows: [], muscleAvailability: 'ready', loading: false, reload() {} });",
              overview:
                "import React from 'react'; export const TrainRecovery = () => React.createElement('div', { 'data-testid': 'train-recovery' }, 'readiness');",
              motion: `import React from 'react';const cache={};export const motion=new Proxy({}, {get:(_,tag)=>cache[tag]??=(props)=>{const {children,initial,animate,transition,whileHover,layoutId,...rest}=props;return React.createElement(tag,rest,children)}});`,
            }[target],
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjRecoveryAccount = { user: { isFounder: false }, profileLoaded: true };
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

const navButtons = () => screen.getAllByTestId(/^primary-nav-/);
const navDock = () => screen.getByTestId("primary-navigation").firstElementChild;

describe("founder-only Recovery destination", { concurrency: false }, () => {
  it("keeps exactly the current five destinations for ordinary users", async () => {
    await act(async () => {
      render(React.createElement(app.Navigation, { activeTab: "challenges", setActiveTab() {} }));
    });
    assert.deepEqual(
      navButtons().map((el) => el.dataset.testid),
      [
        "primary-nav-challenges",
        "primary-nav-activity",
        "primary-nav-workouts",
        "primary-nav-nutrition",
        "primary-nav-plus",
      ],
    );
    assert.equal(
      screen.queryByTestId("primary-nav-recovery"),
      null,
      "ordinary users must not see a Recovery destination",
    );
    assert.match(navDock().className, /grid-cols-5/);
    assert.doesNotMatch(navDock().className, /grid-cols-6/);
  });

  it("promotes Recovery directly after Train for the founder", async () => {
    globalThis.__svjRecoveryAccount = { user: { isFounder: true }, profileLoaded: true };
    await act(async () => {
      render(React.createElement(app.Navigation, { activeTab: "recovery", setActiveTab() {} }));
    });
    assert.deepEqual(
      navButtons().map((el) => el.dataset.testid),
      [
        "primary-nav-challenges",
        "primary-nav-activity",
        "primary-nav-workouts",
        "primary-nav-recovery",
        "primary-nav-nutrition",
        "primary-nav-plus",
      ],
    );
    assert.match(navDock().className, /grid-cols-6/);
    assert.equal(screen.getByTestId("primary-nav-recovery").getAttribute("aria-current"), "page");
  });

  it("never shows the founder destination before the real profile has loaded", async () => {
    globalThis.__svjRecoveryAccount = { user: { isFounder: true }, profileLoaded: false };
    await act(async () => {
      render(React.createElement(app.Navigation, { activeTab: "challenges", setActiveTab() {} }));
    });
    assert.equal(screen.queryByTestId("primary-nav-recovery"), null);
    assert.equal(navButtons().length, 5);
  });

  it("respects isOwner the same way", async () => {
    globalThis.__svjRecoveryAccount = { user: { isOwner: true }, profileLoaded: true };
    await act(async () => {
      render(React.createElement(app.Navigation, { activeTab: "challenges", setActiveTab() {} }));
    });
    assert.equal(navButtons().length, 6);
  });
});

describe("Recovery shell rendering", { concurrency: false }, () => {
  const renderShell = async () => {
    await act(async () => {
      render(React.createElement(app.RecoveryView));
    });
  };

  it("does not touch the account at all (the shell is gated by the caller)", async () => {
    globalThis.__svjRecoveryAccount = undefined;
    await renderShell();
    assert.ok(screen.getByTestId("recovery-view"));
  });

  it("renders the six sections in order starting on Overview", async () => {
    await renderShell();
    assert.deepEqual(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.replace("(selected)", "").trim()),
      ["Overview", "History", "Goals", "Records", "Progress", "Devices"],
    );
    assert.equal(screen.queryByRole("tab", { name: "Routes" }), null);
    assert.ok(screen.getByTestId("recovery-section-overview"));
    assert.ok(screen.getByTestId("train-recovery"), "Overview reuses the existing engine");
  });

  it("exposes proper tab semantics and switches panels on click", async () => {
    await renderShell();
    const history = screen.getByTestId("recovery-section-tab-history");
    assert.equal(history.getAttribute("aria-selected"), "false");
    assert.equal(history.getAttribute("tabindex"), "-1");
    await act(async () => {
      fireEvent.click(history);
    });
    assert.equal(history.getAttribute("aria-selected"), "true");
    assert.equal(history.getAttribute("tabindex"), "0");
    assert.equal(screen.queryByTestId("train-recovery"), null, "Overview panel is unmounted");
    const panel = screen.getByRole("tabpanel");
    assert.equal(panel.getAttribute("id"), "recovery-panel-history");
    assert.equal(panel.getAttribute("aria-labelledby"), "recovery-tab-history");
  });

  it("moves between sections with the arrow keys", async () => {
    await renderShell();
    const tablist = screen.getByTestId("recovery-sections");
    await act(async () => {
      fireEvent.keyDown(tablist, { key: "ArrowRight" });
    });
    assert.equal(screen.getByTestId("recovery-section-tab-history").getAttribute("tabindex"), "0");
    await act(async () => {
      fireEvent.keyDown(tablist, { key: "End" });
    });
    assert.equal(screen.getByTestId("recovery-section-tab-devices").getAttribute("tabindex"), "0");
    assert.ok(screen.getByTestId("recovery-devices-status"));
    await act(async () => {
      fireEvent.keyDown(tablist, { key: "Home" });
    });
    assert.ok(screen.getByTestId("train-recovery"));
  });

  it("states that no wearable is connected", async () => {
    await renderShell();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-section-tab-devices"));
    });
    assert.match(document.body.textContent, /No device is connected\./);
    assert.match(document.body.textContent, /Health Connect/);
  });
});
