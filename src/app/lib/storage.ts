import type { SaveResult } from "./activity";

export const STORAGE_ERROR =
  "Could not save on this device. Storage may be full or unavailable. Free some space, then try again.";

/** Local storage can be unavailable, full, or contain data from an older app. */
export const appStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): SaveResult {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch {
      return { ok: false, error: STORAGE_ERROR };
    }
  },
  removeItem(key: string): SaveResult {
    try {
      localStorage.removeItem(key);
      return { ok: true };
    } catch {
      return { ok: false, error: STORAGE_ERROR };
    }
  },
};

export function readStoredJson<T>(key: string, fallback: T): T {
  const saved = appStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

export function readStoredArray<T>(key: string, fallback: T[]): T[] {
  const saved = readStoredJson<unknown>(key, fallback);
  return Array.isArray(saved) ? (saved.filter((item) => item != null) as T[]) : fallback;
}

export function writeStoredJson(key: string, value: unknown): SaveResult {
  try {
    return appStorage.setItem(key, JSON.stringify(value));
  } catch {
    return { ok: false, error: STORAGE_ERROR };
  }
}
