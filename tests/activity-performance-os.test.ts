// Phase 3 — Activity as a performance telemetry console.
//
// Static source contracts. They pin the three things that matter on this
// screen: (1) the tracking engine stays in charge (the view never starts,
// stops, awards or persists anything itself), (2) only metrics the active
// tracking mode can really produce are rendered, and (3) the map/telemetry
// surfaces use the shared Performance OS primitives and project at the real
// container width.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

const view = await read("../src/app/views/ActivityView.tsx");
const map = await read("../src/app/components/ActivityMap.tsx");
const recorder = await read("../src/app/views/WorkoutRecorder.tsx");
const history = await read("../src/app/views/ActivityHistory.tsx");
const records = await read("../src/app/views/RecordsView.tsx");

describe("Activity telemetry console structure", () => {
  it("opens with the shared hero + metric primitives, not a second card system", () => {
    for (const primitive of [
      "SVJHeroCard",
      "SVJMetricCard",
      "SVJProgressMeter",
      "SVJScoreRing",
      "SVJStatusPill",
      "SVJSurface",
      "SVJSectionHeader",
      "SVJActionCard",
    ]) {
      assert.ok(view.includes(primitive), `ActivityView must use ${primitive}`);
    }
    // The hand-rolled neon ring is gone: one ring primitive app-wide.
    assert.doesNotMatch(view, /const ProgressRing/);
    assert.doesNotMatch(view, /drop-shadow\(0 0 8px/);
  });

  it("keeps the nine internal sections out of the bottom navigation", () => {
    assert.match(view, /data-testid="train-sections"/);
    const items = view.slice(view.indexOf("const SECTION_ITEMS"));
    const ids = [...items.matchAll(/\{ id: "([a-z]+)", label: "([A-Za-z ]+)" \}/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(ids, [
      "activity",
      "record",
      "history",
      "routes",
      "records",
      "devices",
      "goals",
      "progress",
      "recovery",
    ]);
    // 44px touch targets on every section control.
    assert.match(view, /min-h-11 text-\[11px\] font-inter font-semibold uppercase/);
  });

  it("labels every real tracking state instead of inventing one", () => {
    for (const status of [
      "stopped",
      "starting",
      "tracking",
      "stopping",
      "denied",
      "unsupported",
      "error",
      '"update-required"',
    ]) {
      assert.ok(view.includes(`${status}:`), `STATUS_COPY is missing ${status}`);
    }
    // CTA copy stays bound to the provider state machine.
    for (const label of ["APP UPDATE REQUIRED", "RETRY STOP", "STOP TRACKING", "START TRACKING"]) {
      assert.ok(view.includes(label), `missing CTA state ${label}`);
    }
    // An unknown status degrades instead of crashing the screen.
    assert.match(view, /STATUS_COPY\[trackingStatus\] \?\? STATUS_COPY\.stopped/);
  });

  it("renders only metrics step mode can really produce", () => {
    // Steps + calories (+ server XP) only: no fabricated GPS telemetry.
    for (const label of ["Steps", "Active Calories", "Total Calories", "Step XP today"]) {
      assert.ok(view.includes(label), `telemetry grid is missing ${label}`);
    }
    for (const fake of ["Heart rate", "Current pace", "Elevation", "GPS accuracy", "bpm"]) {
      assert.ok(
        !view.includes(fake),
        `step-mode telemetry must not show ${fake} (it belongs to the GPS recorder)`,
      );
    }
    assert.match(view, /Estimates from steps, distance and your body profile/);
  });

  it("keeps the sensor source honest", () => {
    assert.match(view, /Estimated steps — accelerometer motion detection/);
    assert.match(view, /Source: step detector/);
    assert.match(view, /Source: hardware step counter/);
  });

  it("leaves tracking authority with the provider and the server", () => {
    // The view may only call the provider's own controls.
    assert.match(view, /void startTracking\(\)/);
    assert.match(view, /void stopTracking\(\)/);
    // No direct backend, XP or persistence access from the presentation layer.
    assert.doesNotMatch(view, /supabase/);
    assert.doesNotMatch(view, /\.rpc\(/);
    assert.doesNotMatch(view, /awardXp/);
    assert.doesNotMatch(view, /localStorage/);
    // Diagnostics stay opt-in.
    assert.match(view, /showDiagnostics && debugInfo/);
    assert.match(view, /ANDROID PEDOMETER DEBUG/);
  });

  it("mounts the GPS recorder exactly once, from its own section", () => {
    assert.equal(view.match(/<WorkoutRecorder/g)?.length, 1);
    assert.match(view, /\{section === "record" && \(/);
    // The overview only navigates to it — it never renders a second recorder.
    assert.match(view, /onClick=\{\(\) => setSection\("record"\)\}/);
  });
});

describe("Activity map projects at the real container width", () => {
  it("measures the container instead of assuming a 400px canvas", () => {
    assert.match(map, /useElementWidth<HTMLDivElement>\(400, fullscreen\)/);
    assert.doesNotMatch(map, /const width = 400;/);
    assert.match(map, /viewBox=\{`0 0 \$\{width\} \$\{viewportHeight\}`\}/);
    // Tiles and geometry share the measured width, so the route stays on the map.
    assert.match(map, /createTileViewport\(mapPoints, width, viewportHeight\)/);
    assert.match(map, /\[mapPoints, width, viewportHeight\]/);
  });

  it("keeps the real OSM basemap, attribution and route geometry", () => {
    assert.match(map, /tile\.openstreetmap\.org/);
    assert.match(map, /© OpenStreetMap contributors/);
    assert.match(map, /data-testid="map-route"/);
    assert.match(map, /data-testid="map-start"/);
    assert.match(map, /data-testid="map-finish"/);
    // No blur filter repainted on every GPS tick; depth comes from the casing.
    assert.doesNotMatch(map, /feGaussianBlur/);
    assert.match(map, /BRAND_COLORS\.crimson/);
  });

  it("exposes zoom + recenter to pointer and keyboard users and Escape to exit fullscreen", () => {
    assert.match(map, /data-testid="map-zoom-in"/);
    assert.match(map, /data-testid="map-zoom-out"/);
    assert.match(map, /aria-label="Zoom map in"/);
    assert.match(map, /data-testid="map-recenter"/);
    assert.match(map, /event\.key === "Escape"/);
    assert.match(map, /aria-modal="true"/);
  });

  it("keeps the heatmap on the geographic basemap at the measured width", () => {
    assert.match(records, /createTileViewport/);
    assert.match(records, /SVJ_STREET_TILES/);
    assert.match(records, /useElementWidth<HTMLDivElement>\(400\)/);
    assert.doesNotMatch(records, /projectPoints/);
    assert.match(records, /data-testid="heatmap-empty"/);
  });

  it("never fabricates heart rate in the recorder", () => {
    assert.match(recorder, /No sensor connected/);
    assert.match(recorder, /liveHeartRate\s*\?/);
    // Splits/elevation only render when the session actually reported them.
    assert.match(recorder, /summary\?\.elevationGainMeters != null/);
  });
});

describe("Activity history stays server-sourced", () => {
  it("reads the canonical list RPC and renders only stored fields", () => {
    assert.match(history, /client\.rpc\("svj_list_activities", \{ p_limit: 100 \}\)/);
    assert.match(history, /item\.distanceMeters != null && item\.distanceMeters > 0/);
    assert.match(history, /item\.caloriesEstimate != null && item\.caloriesEstimate > 0/);
    assert.match(history, /item\.stepCount > 0/);
    // Nothing invented per row.
    assert.doesNotMatch(history, /heartRate/);
    assert.doesNotMatch(history, /elevationGain/);
  });

  it("uses the shared states for loading, failure and empty", () => {
    assert.match(history, /<SVJSkeleton/);
    assert.match(history, /<SVJErrorState/);
    assert.match(history, /<SVJEmptyState/);
    assert.match(history, /aria-busy="true"/);
    assert.doesNotMatch(history, /window\.alert/);
  });
});
