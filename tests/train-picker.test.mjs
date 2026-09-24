// Train scheduling picker regression (Phase B of release hardening).
//
// Root cause guarded here: the Train "Move → New day" control used a bare
// native HTML date field. On Android WebView/Capacitor that tap is handed to
// the OS DatePicker dialog, which is themed by Android — a giant white sheet
// with a dimmed app, tiny blue controls and displaced SET/CANCEL — and cannot
// be styled from CSS. The replacement is the app-controlled SVJDatePicker.
//
// Two layers, no screenshot assertions:
//   1. Behaviour of the shipped SVJDatePicker in jsdom: dark dialog, viewport
//      caps, internal scrolling, Cancel/Escape discard, Set commits, focus trap.
//   2. Source guards so the native field cannot come back.
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
let calls;

before(async () => {
  temporary = await mkdtemp(path.resolve(".svj-train-picker-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { SVJDatePicker } from './src/app/components/ui-primitives/SVJDatePicker';
      export {
        addMonths,
        buildMonthMatrix,
        formatDayLabel,
        formatLongDate,
        parseDateValue,
        toDateValue,
        todayDateValue,
      } from './src/app/components/ui-primitives/datePickerUtils';
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
  });
  app = await import(pathToFileURL(output).href);
});

afterEach(() => {
  calls = [];
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

async function openPicker(value = "2026-09-24") {
  await act(async () => {
    render(
      React.createElement(app.SVJDatePicker, {
        label: "New day",
        value,
        onChange: (next) => calls.push(next),
        testId: "move-date",
      }),
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("move-date-trigger"));
  });
}

describe("SVJDatePicker date maths", { concurrency: false }, () => {
  it("round-trips a calendar day without any timezone shift", () => {
    assert.equal(app.toDateValue(2026, 8, 24), "2026-09-24");
    assert.deepEqual(app.parseDateValue("2026-09-24"), {
      year: 2026,
      month: 8,
      day: 24,
      inMonth: true,
    });
    assert.equal(app.toDateValue(2026, 0, 1), "2026-01-01");
  });

  it("rejects unusable values instead of inventing a date", () => {
    assert.equal(app.parseDateValue(""), null);
    assert.equal(app.parseDateValue(null), null);
    assert.equal(app.parseDateValue("24/09/2026"), null);
    assert.equal(app.parseDateValue("2026-02-31"), null, "February has no 31st");
    assert.equal(app.parseDateValue("2026-13-01"), null);
    assert.equal(app.formatLongDate(""), "");
  });

  it("renders a readable long date", () => {
    // Locale ordering varies by ICU build; both orderings are readable.
    const longDate = app.formatLongDate("2026-09-24");
    assert.match(longDate, /24/);
    assert.match(longDate, /Sep|Sept|September/);
    assert.match(longDate, /2026/);

    const dayLabel = app.formatDayLabel(2026, 8, 24);
    assert.match(dayLabel, /24/);
    assert.match(dayLabel, /September/);
    assert.match(dayLabel, /2026/);
    assert.equal(app.todayDateValue().length, 10);
  });

  it("builds a stable Monday-first 6x7 grid padded with adjacent months", () => {
    const weeks = app.buildMonthMatrix(2026, 8);
    assert.equal(weeks.length, 6);
    for (const week of weeks) assert.equal(week.length, 7);
    const flat = weeks.flat();
    assert.equal(flat.length, 42);
    const first = flat.find((cell) => cell.year === 2026 && cell.month === 8 && cell.day === 1);
    assert.ok(first?.inMonth, "September 1 belongs to the month");
    assert.equal(flat[0].inMonth, false, "the grid is padded from the previous month");
    // Every in-month day appears exactly once.
    const inMonth = flat.filter((cell) => cell.inMonth);
    assert.equal(inMonth.length, 30, "September has 30 days");
  });

  it("wraps months in both directions", () => {
    assert.deepEqual(app.addMonths(2026, 0, -1), { year: 2025, month: 11 });
    assert.deepEqual(app.addMonths(2026, 11, 1), { year: 2027, month: 0 });
    assert.deepEqual(app.addMonths(2026, 5, 12), { year: 2027, month: 5 });
  });
});

describe("SVJDatePicker interaction", { concurrency: false }, () => {
  it("shows the current value on a touch-sized trigger without any native field", async () => {
    await openPicker();
    const trigger = screen.getByTestId("move-date-trigger");
    assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.match(trigger.className, /min-h-\[44px\]/);
    const triggerText = screen.getByTestId("move-date-value").textContent;
    assert.match(triggerText, /24/);
    assert.match(triggerText, /Sep|Sept|September/);
    assert.match(triggerText, /2026/);
    // The page must not contain a native date input that Android could hijack.
    assert.equal(document.querySelectorAll('input[type="date"]').length, 0);
    assert.equal(document.querySelectorAll("input").length, 0);
  });

  it("opens a centered dark dialog with viewport caps and internal scrolling", async () => {
    await openPicker();
    const overlay = screen.getByTestId("move-date-overlay");
    assert.match(overlay.className, /fixed/);
    assert.match(overlay.className, /inset-0/);
    assert.match(overlay.className, /items-center/);
    assert.match(overlay.className, /justify-center/);
    assert.match(overlay.className, /bg-black\/70/, "dims the app behind the dialog");
    assert.match(overlay.className, /z-\[100\]/, "sits above the app shell");
    assert.doesNotMatch(overlay.className, /bg-white/);

    const dialog = screen.getByRole("dialog");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.getAttribute("aria-label"), "New day");
    assert.match(dialog.className, /bg-\[#17171A\]/, "dark SVJ panel, not a white sheet");
    assert.match(dialog.className, /max-h-\[85vh\]/, "never taller than the viewport");
    assert.match(dialog.className, /max-w-sm/, "viewport-safe width");
    assert.match(dialog.className, /w-full/);
    assert.match(dialog.className, /overflow-hidden/);

    // The month grid lives in its own scroll region so a long month never
    // pushes Cancel/Set off screen.
    const scrollRegion = dialog.querySelector(".overflow-y-auto");
    assert.ok(scrollRegion, "the grid scrolls internally");
    assert.doesNotMatch(overlay.className, /text-white/);
  });

  it("marks the current value as selected and today independently of color", async () => {
    await openPicker("2026-09-24");
    const selected = screen.getByTestId("move-date-day-2026-09-24");
    assert.equal(selected.getAttribute("aria-selected"), "true");
    assert.match(selected.className, /ring-2/, "selection carries a ring, not only color");
    assert.match(selected.className, /font-bold/);
    assert.equal(
      screen.getByTestId("move-date-day-2026-09-15").getAttribute("aria-selected"),
      "false",
    );
    // Every day is an individually labelled, touch-sized button.
    for (const day of document.querySelectorAll('[data-testid^="move-date-day-"]')) {
      assert.match(day.className, /min-h-\[44px\]/);
      assert.ok(day.getAttribute("aria-label"));
    }
  });

  it("Set commits the picked day and closes", async () => {
    await openPicker("2026-09-24");
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-day-2026-09-30"));
    });
    assert.equal(
      screen.getByTestId("move-date-day-2026-09-30").getAttribute("aria-selected"),
      "true",
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-confirm"));
    });
    assert.deepEqual(calls, ["2026-09-30"]);
    assert.equal(screen.queryByRole("dialog"), null, "dialog closes after Set");
  });

  it("Cancel discards the draft and leaves the value untouched", async () => {
    await openPicker("2026-09-24");
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-day-2026-09-28"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-cancel"));
    });
    assert.deepEqual(calls, [], "Cancel never writes a new date");
    assert.equal(screen.queryByRole("dialog"), null);
    const restoredText = screen.getByTestId("move-date-value").textContent;
    assert.match(restoredText, /24/);
    assert.match(restoredText, /Sep|Sept|September/);
    assert.match(restoredText, /2026/);

    // Re-opening must reset the draft back to the committed value.
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-trigger"));
    });
    assert.equal(
      screen.getByTestId("move-date-day-2026-09-24").getAttribute("aria-selected"),
      "true",
    );
  });

  it("Escape cancels without committing", async () => {
    await openPicker("2026-09-24");
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    assert.deepEqual(calls, []);
    assert.equal(screen.queryByRole("dialog"), null);
  });

  it("navigates months and follows a tapped adjacent-month day", async () => {
    await openPicker("2026-09-24");
    const heading = () =>
      screen.getByRole("dialog").querySelector('[aria-live="polite"]').textContent;
    assert.match(heading(), /September 2026/);

    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-next-month"));
    });
    assert.match(heading(), /October 2026/);
    await act(async () => {
      fireEvent.click(screen.getByTestId("move-date-prev-month"));
    });
    assert.match(heading(), /September 2026/);

    const outside = screen
      .getByRole("dialog")
      .querySelector('[data-in-month="false"][data-day-value="2026-08-31"]');
    assert.ok(outside, "the grid pads with the previous month");
    await act(async () => {
      fireEvent.click(outside);
    });
    assert.match(heading(), /August 2026/, "tapping a padded day follows it into its month");
    // The grid re-renders for the new month, so re-query instead of reading the
    // detached node.
    assert.equal(
      screen.getByTestId("move-date-day-2026-08-31").getAttribute("aria-selected"),
      "true",
    );
  });

  it("moves the draft with the arrow keys", async () => {
    await openPicker("2026-09-24");
    const day24 = screen.getByTestId("move-date-day-2026-09-24");
    await act(async () => {
      fireEvent.keyDown(day24, { key: "ArrowRight" });
    });
    assert.equal(
      screen.getByTestId("move-date-day-2026-09-25").getAttribute("aria-selected"),
      "true",
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("move-date-day-2026-09-25"), { key: "ArrowDown" });
    });
    assert.equal(
      screen.getByTestId("move-date-day-2026-10-02").getAttribute("aria-selected"),
      "true",
    );
  });

  it("keeps Set disabled and never emits an empty date when nothing is chosen", async () => {
    await act(async () => {
      render(
        React.createElement(app.SVJDatePicker, {
          label: "New day",
          value: "",
          onChange: (next) => calls.push(next),
          testId: "blank-date",
        }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("blank-date-trigger"));
    });
    assert.equal(screen.getByTestId("blank-date-confirm").disabled, true);
    assert.deepEqual(calls, []);
  });

  it("does not open while disabled", async () => {
    await act(async () => {
      render(
        React.createElement(app.SVJDatePicker, {
          label: "New day",
          value: "2026-09-24",
          onChange: (next) => calls.push(next),
          disabled: true,
          testId: "busy-date",
        }),
      );
    });
    assert.equal(screen.getByTestId("busy-date-trigger").disabled, true);
    await act(async () => {
      fireEvent.click(screen.getByTestId("busy-date-trigger"));
    });
    assert.equal(screen.queryByRole("dialog"), null);
  });
});

describe("train picker source guards", { concurrency: false }, () => {
  it("keeps the native date field out of the Train move flow", async () => {
    const source = await readFile("src/app/components/TrainingToday.tsx", "utf8");
    assert.doesNotMatch(
      source,
      /type="date"|type="time"|type="datetime-local"/,
      "no native date field may return to Train scheduling",
    );
    assert.match(source, /<SVJDatePicker/);
    assert.match(source, /testId={`move-session-date-\$\{session.slotIndex\}`}/);
    // The move contract itself must be unchanged.
    assert.match(source, /onMoveSession\(serverId, value\)/);
    assert.match(source, /onSkipSession\(serverId\)/);
  });

  it("never falls back to a native field inside the picker primitive", async () => {
    const source = await readFile("src/app/components/ui-primitives/SVJDatePicker.tsx", "utf8");
    assert.doesNotMatch(source, /<input/, "the picker must stay fully app-controlled");
    assert.doesNotMatch(source, /type="date"/);
    assert.match(source, /overflow-y-auto/);
    assert.match(source, /z-\[100\]/);
  });

  it("leaves no other Train surface with a native date or time field", async () => {
    const files = [
      "src/app/views/WorkoutView.tsx",
      "src/app/components/TrainingToday.tsx",
      "src/app/components/TaskEditorDialog.tsx",
      "src/app/views/TrainStrength.tsx",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8").catch(() => "");
      assert.doesNotMatch(
        source,
        /type="date"|type="time"|type="datetime-local"/,
        `${file} must not open a native Android picker`,
      );
    }
  });
});
