// Real ticket components and React Query caches; only authentication and server calls are isolated.
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://svj.test/",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MutationObserver",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? dom.window : dom.window[key],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent, screen, waitFor, within } =
  await import("@testing-library/react");
const { QueryClient, QueryClientProvider, focusManager, onlineManager } =
  await import("@tanstack/react-query");
let temporary;
let components;
let fixture;
let client;
let view;

before(async () => {
  temporary = await mkdtemp(path.resolve(".support-ui-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
        export { MyTicketsList, RaiseTicketForm } from './src/app/components/SupportTickets';
        export { AdminDashboardView } from './src/app/views/AdminDashboardView';
      `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    plugins: [
      {
        name: "synthetic-support-services",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/support.functions$/ }, () => ({
            path: "support",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^@\/lib\/admin.functions$/ }, () => ({
            path: "admin",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /hooks\/useWorkoutQueue$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            resolveDir: process.cwd(),
            contents: {
              support: `
              export const listMySupportTickets = (...args) => globalThis.supportFixture.mine(...args);
              export const adminListSupportTickets = (...args) => globalThis.supportFixture.admin(...args);
              export const adminUpdateSupportTicket = (...args) => globalThis.supportFixture.update(...args);
              export const createSupportTicket = (...args) => globalThis.supportFixture.create(...args);
            `,
              admin: `
              export const getAdminDashboardStats = () => globalThis.supportFixture.stats();
              export const adminListUsers = async () => ({ users: [], page: 1, hasMore: false });
              export const adminDeleteUser = async () => {};
              export const adminGrantPlus = async () => {};
              export const adminRevokePlus = async () => {};
            `,
              auth: `
              import { useSyncExternalStore } from 'react';
              export const useAuthUserId = () => useSyncExternalStore(
                globalThis.supportFixture.subscribe,
                () => globalThis.supportFixture.userId,
                () => null
              );
            `,
            }[target],
          }));
        },
      },
    ],
  });
  components = await import(pathToFileURL(output).href);
});

function ticket(id, status = "open", user_id = "user-a") {
  return {
    id,
    status,
    user_id,
    category: "bug",
    message: `Issue ${id}`,
    admin_response: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    resolved_at: null,
    reporter_username: user_id,
    reporter_email: `${user_id}@example.test`,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  const listeners = new Set();
  fixture = {
    userId: "user-a",
    rows: [ticket("open"), ticket("working", "in_progress"), ticket("closed", "resolved")],
    mineCalls: 0,
    adminCalls: 0,
    statsCalls: 0,
    submitted: [],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    changeUser(id) {
      this.userId = id;
      listeners.forEach((listener) => listener());
    },
    async mine() {
      this.mineCalls++;
      return this.rows
        .filter((row) => row.user_id === this.userId && row.status !== "resolved")
        .map((row) => ({ ...row }));
    },
    async admin({ data }) {
      this.adminCalls++;
      return this.rows
        .filter(
          (row) =>
            row.status !== "resolved" && (data.status === "all" || data.status === row.status),
        )
        .map((row) => ({ ...row }));
    },
    async update({ data }) {
      this.submitted.push(data);
      Object.assign(
        this.rows.find((row) => row.id === data.ticketId),
        { status: data.status },
      );
      return { ok: true };
    },
    async create({ data }) {
      this.rows.push({ ...ticket("new"), message: data.message });
      return { ok: true, id: "new" };
    },
    async stats() {
      this.statsCalls++;
      return {
        totalUsers: 2,
        totalPlusMembers: 1,
        newSignupsLast7Days: 0,
        openTickets: this.rows.filter((row) => row.status === "open").length,
      };
    },
  };
  globalThis.supportFixture = fixture;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

afterEach(async () => {
  await act(async () => cleanup());
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  delete globalThis.supportFixture;
});
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

async function mount(...names) {
  await act(async () => {
    view = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          React.Fragment,
          null,
          ...names.map((name) => React.createElement(components[name], { key: name })),
        ),
      ),
    );
  });
}

function adminSection() {
  return within(screen.getByTestId("admin-tickets-section"));
}
function openRow() {
  return within(adminSection().getByText("Issue open").closest("li"));
}
async function saveResolved() {
  fireEvent.change(openRow().getByLabelText("Ticket status"), { target: { value: "resolved" } });
  fireEvent.click(openRow().getByRole("button", { name: "Save" }));
}

describe("active support ticket UI", { concurrency: false }, () => {
  it("hides resolved cached rows in both views and keeps only active filters", async () => {
    const pending = deferred();
    fixture.mine = () => pending.promise;
    fixture.admin = () => pending.promise;
    client.setQueryData(["my-support-tickets", "user-a"], fixture.rows);
    client.setQueryData(["admin-tickets", "all"], fixture.rows);
    await mount("MyTicketsList", "AdminDashboardView");
    assert.ok(!screen.queryByText("Issue closed"));
    assert.equal(screen.getAllByText("Issue open").length, 2);
    assert.equal(screen.getAllByText("Issue working").length, 2);
    const filters = within(adminSection().getByRole("group", { name: "Filter tickets by status" }));
    assert.ok(filters.getByRole("button", { name: "All active" }));
    assert.ok(!filters.queryByRole("button", { name: "Resolved" }));
    assert.ok(
      within(openRow().getByLabelText("Ticket status")).getByRole("option", { name: "Resolved" }),
    );
    await act(async () => pending.resolve(fixture.rows));
    assert.ok(
      !screen.queryByText("Issue closed"),
      "older server responses cannot render resolved rows",
    );
  });

  it("uses the submitted status, evicts all list caches, and refreshes stats after successful resolution", async () => {
    for (const filter of ["open", "in_progress"])
      client.setQueryData(["admin-tickets", filter], fixture.rows);
    client.setQueryData(["my-support-tickets", "user-b"], [ticket("open", "open", "user-b")]);
    await mount("MyTicketsList", "AdminDashboardView");
    await waitFor(() => assert.equal(screen.getAllByText("Issue open").length, 2));
    const oldStatsCalls = fixture.statsCalls;
    const pending = deferred();
    fixture.update = ({ data }) => {
      fixture.submitted.push(data);
      return pending.promise;
    };
    await saveResolved();
    await waitFor(() => assert.equal(fixture.submitted.length, 1));
    fireEvent.change(openRow().getByLabelText("Ticket status"), { target: { value: "open" } });
    assert.equal(
      screen.getAllByText("Issue open").length,
      2,
      "nothing is removed before the server succeeds",
    );
    fixture.rows = fixture.rows.filter((row) => row.id !== "open");
    await act(async () => pending.resolve({ ok: true }));
    await waitFor(() => assert.ok(!screen.queryByText("Issue open")));
    assert.equal(fixture.submitted[0].status, "resolved");
    for (const prefix of ["admin-tickets", "my-support-tickets"]) {
      for (const [, rows] of client.getQueriesData({ queryKey: [prefix] }))
        assert.ok(rows.every((row) => row.id !== "open"));
    }
    await waitFor(() => assert.ok(fixture.statsCalls > oldStatsCalls));
  });

  it("failed resolution preserves the row and displays the error", async () => {
    fixture.update = async () => {
      throw new Error("Server rejected the save");
    };
    await mount("AdminDashboardView");
    await waitFor(() => assert.ok(adminSection().getByText("Issue open")));
    await saveResolved();
    await waitFor(() =>
      assert.match(adminSection().getByRole("alert").textContent, /Server rejected/),
    );
    assert.ok(adminSection().getByText("Issue open"));
    assert.ok(client.getQueryData(["admin-tickets", "all"]).some((row) => row.id === "open"));
  });

  it("cancels an older in-flight list so it cannot restore a successfully resolved ticket", async () => {
    await mount("AdminDashboardView");
    await waitFor(() => assert.ok(adminSection().getByText("Issue open")));
    const pending = deferred();
    const oldRows = fixture.rows.map((row) => ({ ...row }));
    const normalAdmin = fixture.admin.bind(fixture);
    fixture.admin = () => pending.promise;
    void client.refetchQueries({ queryKey: ["admin-tickets"] });
    await saveResolved();
    fixture.admin = normalAdmin;
    await waitFor(() => assert.ok(!adminSection().queryByText("Issue open")));
    await act(async () => pending.resolve(oldRows));
    assert.ok(!adminSection().queryByText("Issue open"));
  });

  it("isolates account caches and hides another account's tickets on switching or logout", async () => {
    fixture.rows.push(ticket("other", "open", "user-b"));
    await mount("MyTicketsList");
    await waitFor(() => assert.ok(screen.getByText("Issue open")));
    const pending = deferred();
    const normalMine = fixture.mine.bind(fixture);
    fixture.mine = () => pending.promise;
    await act(async () => fixture.changeUser("user-b"));
    assert.ok(!screen.queryByText("Issue open"));
    assert.ok(!screen.queryByText("Issue working"));
    await act(async () => pending.resolve(await normalMine()));
    await waitFor(() => assert.ok(screen.getByText("Issue other")));
    assert.ok(
      client.getQueryData(["my-support-tickets", "user-a"]).some((row) => row.id === "open"),
    );
    await act(async () => fixture.changeUser(null));
    assert.ok(!screen.queryByText("Issue other"));
    assert.match(screen.getByTestId("no-tickets").textContent, /No active tickets/);
  });

  it("polls both mounted lists every 15 seconds, pauses while hidden, and removes externally resolved tickets", async (context) => {
    context.mock.timers.enable({ apis: ["setInterval"] });
    await mount("MyTicketsList", "AdminDashboardView");
    await waitFor(() => assert.equal(screen.getAllByText("Issue open").length, 2));
    const calls = [fixture.mineCalls, fixture.adminCalls];
    fixture.rows.find((row) => row.id === "open").status = "resolved";
    await act(async () => context.mock.timers.tick(14_999));
    assert.deepEqual([fixture.mineCalls, fixture.adminCalls], calls);
    await act(async () => context.mock.timers.tick(1));
    await waitFor(() => assert.ok(!screen.queryByText("Issue open")));
    assert.deepEqual(
      [fixture.mineCalls, fixture.adminCalls],
      calls.map((count) => count + 1),
    );
    await act(async () => focusManager.setFocused(false));
    const hiddenCalls = [fixture.mineCalls, fixture.adminCalls];
    await act(async () => context.mock.timers.tick(15_000));
    assert.deepEqual([fixture.mineCalls, fixture.adminCalls], hiddenCalls);
    await act(async () => focusManager.setFocused(true));
    await waitFor(() =>
      assert.ok(fixture.mineCalls > hiddenCalls[0] && fixture.adminCalls > hiddenCalls[1]),
    );
    await act(async () => view.unmount());
    context.mock.timers.reset();
  });

  it("refreshes immediately on reopening, window focus and reconnection even when cached data is fresh", async () => {
    await mount("MyTicketsList", "AdminDashboardView");
    await waitFor(() => assert.equal(fixture.mineCalls, 1));
    await act(async () => view.unmount());
    await mount("MyTicketsList", "AdminDashboardView");
    await waitFor(() => assert.equal(fixture.mineCalls, 2));
    let calls = [fixture.mineCalls, fixture.adminCalls];
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => assert.ok(fixture.mineCalls > calls[0] && fixture.adminCalls > calls[1]));
    calls = [fixture.mineCalls, fixture.adminCalls];
    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => assert.ok(fixture.mineCalls > calls[0] && fixture.adminCalls > calls[1]));
  });

  it("ticket creation refreshes user/admin lists and statistics, and empty lists say No active tickets", async () => {
    fixture.rows = [ticket("closed", "resolved")];
    await mount("RaiseTicketForm", "MyTicketsList", "AdminDashboardView");
    await waitFor(() => {
      assert.equal(screen.getAllByText("No active tickets.", { exact: true }).length, 2);
    });
    const calls = [fixture.mineCalls, fixture.adminCalls, fixture.statsCalls];
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "New issue" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit ticket" }));
    await waitFor(() => assert.ok(screen.getByTestId("ticket-submitted")));
    await waitFor(() => assert.equal(screen.getAllByText("New issue").length, 2));
    assert.ok(
      fixture.mineCalls > calls[0] &&
        fixture.adminCalls > calls[1] &&
        fixture.statsCalls > calls[2],
    );
  });
});
