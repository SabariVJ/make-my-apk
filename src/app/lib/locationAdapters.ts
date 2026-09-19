// ============================================================================
// SVJ NATIVE ACTIVITY — location sources.
//
// Two adapters behind one interface:
//   • native  — the Android foreground service (survives lock/background)
//   • web     — the browser Geolocation API (preview builds, web installs)
//
// Both only run between an explicit start and an explicit stop: SVJ never
// collects location passively, and neither adapter retries forever after a
// fatal permission error.
// ============================================================================

import type { LocationAdapter, RawLocationSample } from "./gpsRecorder";
import {
  createNativeWorkoutLocationAdapter,
  workoutPlugin,
  workoutPluginAvailable,
} from "./nativeWorkout";

export function createWebLocationAdapter(
  nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined,
): LocationAdapter {
  let watchId: number | null = null;
  return {
    async start(onSample, onError) {
      if (!nav?.geolocation) {
        onError?.("This device does not expose location to the browser.");
        return;
      }
      watchId = nav.geolocation.watchPosition(
        (position) => {
          const sample: RawLocationSample = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
            elevation: position.coords.altitude ?? null,
            timestampMs: position.timestamp ?? Date.now(),
          };
          onSample(sample);
        },
        (error) => {
          onError?.(
            error.code === 1
              ? "Location permission was denied."
              : "Location is unavailable right now.",
          );
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
      );
    },
    async stop() {
      if (watchId != null && nav?.geolocation) {
        nav.geolocation.clearWatch(watchId);
      }
      watchId = null;
    },
  };
}

/**
 * Prefer the native foreground service; fall back to the browser API. The
 * caller never has to know which platform it is on.
 */
export function createDefaultLocationAdapter(): LocationAdapter {
  if (workoutPluginAvailable()) {
    return createNativeWorkoutLocationAdapter(workoutPlugin());
  }
  return createWebLocationAdapter();
}

export function isNativeRecordingAvailable(): boolean {
  return workoutPluginAvailable();
}
