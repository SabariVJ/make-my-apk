import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildActivityEventKey } from "../src/lib/activity-ledger";

const migration = readFileSync(
  new URL("../supabase/migrations/20260904010000_activity_ledger.sql", import.meta.url),
  "utf8",
);

test("activity event identity is stable and contains no reward amount", () => {
  const identity = {
    eventType: "meal_log" as const,
    sourceClass: "nutrition" as const,
    sourceId: "meal-123",
    requestId: "request-456",
  };
  assert.equal(buildActivityEventKey(identity), buildActivityEventKey(identity));
  assert.equal(buildActivityEventKey(identity), "meal_log:nutrition:meal-123:request-456");
});

test("activity event identity rejects missing or oversized IDs", () => {
  assert.throws(() =>
    buildActivityEventKey({
      eventType: "workout",
      sourceClass: "workout",
      sourceId: " ",
      requestId: "request-1",
    }),
  );
});

test("ledger migration is private, immutable, idempotent, and separates rewards", () => {
  assert.match(migration, /UNIQUE \(user_id, event_key\)/);
  assert.match(migration, /GRANT SELECT ON public\.activity_events TO authenticated/);
  assert.doesNotMatch(migration, /GRANT INSERT[^;]*authenticated/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /lifetime_xp_delta/);
  assert.match(migration, /qualifying_xp_delta/);
  assert.match(migration, /rivalry_xp_delta/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
});
