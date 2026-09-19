import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { appStorage, readStoredArray, readStoredJson, writeStoredJson } from "./storage";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
function storage(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
}

describe("device-cache failure handling", () => {
  it("returns a visible save failure when the browser quota is full", () => {
    storage({
      setItem() {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
    const result = writeStoredJson("workouts", [{ name: "Test" }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Could not save/);
  });

  it("handles browsers which reject access to localStorage itself", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Denied");
      },
    });
    assert.equal(appStorage.getItem("user"), null);
    assert.equal(appStorage.setItem("user", "{}").ok, false);
    assert.equal(appStorage.removeItem("user").ok, false);
  });

  it("handles damaged or incorrectly shaped cached JSON", () => {
    storage({ getItem: () => "{broken" });
    assert.deepEqual(readStoredJson("user", { totalXP: 0 }), { totalXP: 0 });
    storage({ getItem: () => '{"unexpected":true}' });
    assert.deepEqual(readStoredArray("workouts", []), []);
  });

  it("preserves valid existing records", () => {
    storage({ getItem: () => '[{"id":"saved"}]' });
    assert.deepEqual(readStoredArray("meals", []), [{ id: "saved" }]);
  });
});
