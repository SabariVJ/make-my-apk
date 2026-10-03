import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let temporary;
let functions;

before(async () => {
  temporary = await mkdtemp(path.resolve(".support-server-test-"));
  const output = path.join(temporary, "functions.mjs");
  await build({
    entryPoints: ["src/lib/support.functions.ts"],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    plugins: [
      {
        name: "authenticated-server-boundary",
        setup(builder) {
          builder.onResolve({ filter: /^@tanstack\/react-start$/ }, () => ({
            path: "start",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^@\/integrations\/supabase\/auth-middleware$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            contents:
              target === "auth"
                ? "export const requireSupabaseAuth = {};"
                : `
            export function createServerFn() {
              const chain = { validator: () => chain, middleware: () => chain, handler: handler => handler };
              return chain;
            }
          `,
          }));
        },
      },
    ],
  });
  functions = await import(pathToFileURL(output).href);
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
});

function ticket(id, user_id, status, created_at) {
  return {
    id,
    user_id,
    status,
    created_at,
    updated_at: created_at,
    category: "bug",
    message: id,
    resolved_at: status === "resolved" ? created_at : null,
    admin_response: "Saved response",
    profiles: { username: user_id, email: `${user_id}@example.test` },
  };
}

// Model PostgREST filtering before ordering/limits, while recording the real query calls.
function database(rows, { admin = true, fail = false } = {}) {
  const queries = [];
  const supabase = {
    from(table) {
      const calls = [];
      queries.push({ table, calls });
      const filters = [];
      let maximum = Infinity;
      let patch;
      const query = {
        select(fields) {
          calls.push(["select", fields]);
          return query;
        },
        eq(field, value) {
          calls.push(["eq", field, value]);
          filters.push((row) => row[field] === value);
          return query;
        },
        neq(field, value) {
          calls.push(["neq", field, value]);
          filters.push((row) => row[field] !== value);
          return query;
        },
        order(field) {
          calls.push(["order", field]);
          return query;
        },
        limit(value) {
          calls.push(["limit", value]);
          maximum = value;
          return query;
        },
        update(value) {
          calls.push(["update", value]);
          patch = value;
          return query;
        },
        async maybeSingle() {
          return { data: admin ? { role: "admin" } : null };
        },
        then(resolve, reject) {
          let selected = rows.filter((row) => filters.every((filter) => filter(row)));
          if (patch && !fail) selected.forEach((row) => Object.assign(row, patch));
          selected = selected
            .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, maximum);
          return Promise.resolve({
            data: selected,
            error: fail ? { message: "Save failed" } : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { queries, context: { supabase, userId: "user-a" } };
}

function assertActiveFilterBeforeLimit(queries) {
  const { calls } = queries.find((query) => query.table === "support_tickets");
  const filter = calls.findIndex(
    ([method, field, value]) => method === "neq" && field === "status" && value === "resolved",
  );
  assert.ok(filter >= 0);
  assert.ok(filter < calls.findIndex(([method]) => method === "limit"));
}

describe("active support ticket server queries", () => {
  it("scopes My Tickets even for an admin and filters resolved rows before the 100-row limit", async () => {
    const rows = [
      ...Array.from({ length: 110 }, (_, i) =>
        ticket(`closed-${i}`, "user-a", "resolved", "2026-10-02"),
      ),
      ticket("other-user", "user-b", "open", "2026-10-01"),
      ticket("open", "user-a", "open", "2026-09-30"),
      ticket("working", "user-a", "in_progress", "2026-09-29"),
    ];
    const db = database(rows);
    const result = await functions.listMySupportTickets({ context: db.context });
    assert.deepEqual(
      result.map((row) => row.id),
      ["open", "working"],
    );
    assertActiveFilterBeforeLimit(db.queries);
    assert.ok(
      db.queries[0].calls.some((call) => JSON.stringify(call) === '["eq","user_id","user-a"]'),
    );
    assert.equal(rows.length, 113, "resolved history is retained");
  });

  it("admin All active ignores resolved rows before the limit and preserves reporter identity", async () => {
    const rows = [
      ticket("closed", "user-b", "resolved", "2026-10-02"),
      ticket("working", "user-b", "in_progress", "2026-10-01"),
      ticket("open", "user-a", "open", "2026-09-30"),
    ];
    const db = database(rows);
    const result = await functions.adminListSupportTickets({
      data: { status: "all", limit: 2 },
      context: db.context,
    });
    assert.deepEqual(
      result.map((row) => row.id),
      ["working", "open"],
    );
    assert.equal(result[0].reporter_email, "user-b@example.test");
    assertActiveFilterBeforeLimit(db.queries);
    for (const status of ["open", "in_progress", "resolved"]) {
      const filtered = await functions.adminListSupportTickets({
        data: { status },
        context: db.context,
      });
      assert.deepEqual(
        filtered.map((row) => row.id),
        status === "resolved" ? [] : [status === "open" ? "open" : "working"],
      );
    }
  });

  it("keeps the role boundary for all filters, including legacy resolved requests", async () => {
    const db = database([], { admin: false });
    await assert.rejects(
      functions.adminListSupportTickets({ data: { status: "resolved" }, context: db.context }),
      /Forbidden/,
    );
    await assert.rejects(
      functions.adminUpdateSupportTicket({
        data: { ticketId: "a".repeat(36), status: "resolved" },
        context: db.context,
      }),
      /Forbidden/,
    );
    assert.ok(db.queries.every((query) => query.table === "user_roles"));
  });

  it("resolution retains the record and response but removes it from subsequent lists", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const rows = [ticket(id, "user-a", "open", "2026-10-01")];
    const db = database(rows);
    await functions.adminUpdateSupportTicket({
      data: { ticketId: id, status: "resolved", adminResponse: "Fixed" },
      context: db.context,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].admin_response, "Fixed");
    assert.ok(rows[0].resolved_at);
    assert.deepEqual(await functions.listMySupportTickets({ context: db.context }), []);
    assert.deepEqual(
      await functions.adminListSupportTickets({ data: { status: "all" }, context: db.context }),
      [],
    );
  });
});
