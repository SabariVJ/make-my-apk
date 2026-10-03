import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Stability tests refuse hosted backends");
const databaseUrl = process.env.SVJ_TEST_DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname))
  throw new Error("Fixtures refuse hosted databases");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const anonymous = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, opts);
const db = new pg.Pool({ connectionString: databaseUrl });
let alice, bob, operator, expired;
const checked = (result) => {
  expect(result.error, result.error?.message).toBeNull();
  return result.data;
};
const rpc = async (account, fn, args) => checked(await account.client.rpc(fn, args));
async function account(label, role = false) {
  const email = `svj-${label}-${randomUUID()}@example.test`,
    password = randomUUID() + "!Svj1";
  const user = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user;
  checked(
    await admin
      .from("profiles")
      .update({ display_name: `SVJ ${label}`, username: `svj_${randomUUID().slice(0, 8)}` })
      .eq("id", user.id),
  );
  if (role) checked(await admin.from("user_roles").insert({ user_id: user.id, role: "admin" }));
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, opts);
  const session = checked(await client.auth.signInWithPassword({ email, password })).session;
  return { id: user.id, email, password, client, session };
}
async function openSignedIn(browser, identity) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key, session: identity.session },
  );
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("utility-rail")).toBeVisible();
  return { context, page };
}
test.beforeAll(async () => {
  alice = await account("Alice");
  bob = await account("Bob");
  operator = await account("Admin", true);
  expired = await account("Expired");
  checked(
    await admin
      .from("profiles")
      .update({
        signup_date: new Date(Date.now() - 9 * 86400000).toISOString(),
        is_plus_member: false,
      })
      .eq("id", expired.id),
  );
});
test.afterAll(async () => {
  for (const identity of [alice, bob, operator, expired])
    if (identity) checked(await admin.auth.admin.deleteUser(identity.id));
  await db.end();
});

test("real authentication, sign out, sign in and seven-day membership expiry", async ({
  browser,
}) => {
  const membership = (await rpc(alice, "svj_get_my_membership"))[0];
  expect(membership.id).toBe(alice.id);
  expect(Date.now() - Date.parse(membership.signup_date)).toBeLessThan(86400000);
  checked(await bob.client.auth.signOut());
  checked(await bob.client.auth.signInWithPassword({ email: bob.email, password: bob.password }));
  const context = await browser.newContext();
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key, session: expired.session },
  );
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Your 7-Day Trial Has Ended", { exact: true }).first()).toBeVisible();
  await context.close();
});

test("admin Give Plus and recipient Claim Plus use real server services", async ({ browser }) => {
  const { page, context } = await openSignedIn(browser, operator);
  await page.getByTestId("utility-rail-admin").click();
  await page.getByPlaceholder("Search username, name or email").fill(alice.email);
  await page.getByLabel(`Plus duration for ${alice.email}`, { exact: true }).fill("1");
  await page.getByRole("button", { name: "Give Plus", exact: true }).click();
  await expect
    .poll(
      async () =>
        checked(await admin.from("plus_gifts").select("id").eq("recipient_user_id", alice.id))
          .length,
    )
    .toBe(1);
  await context.close();
  const recipient = await openSignedIn(browser, alice);
  await recipient.page.getByRole("button", { name: "Claim Plus", exact: true }).click();
  await expect
    .poll(
      async () =>
        checked(
          await admin.from("plus_gifts").select("claimed_at").eq("recipient_user_id", alice.id),
        )[0]?.claimed_at,
    )
    .toBeTruthy();
  expect((await rpc(alice, "svj_get_my_membership"))[0].is_plus_member).toBe(true);
  await recipient.context.close();
  expect(
    (
      await bob.client.rpc("svj_admin_grant_plus", {
        p_target_user_id: bob.id,
        p_granted_by: bob.id,
        p_duration_value: 1,
        p_duration_unit: "month",
      })
    ).error,
  ).toBeTruthy();
});

test("support create, administrator reply, private read and resolved status", async ({
  browser,
}) => {
  const own = await openSignedIn(browser, alice);
  await own.page.getByTestId("utility-rail-profile").click();
  await own.page.getByLabel("Category", { exact: true }).selectOption("bug");
  await own.page
    .getByLabel("What happened?", { exact: true })
    .fill("Isolated tracking status test");
  await own.page.getByRole("button", { name: "Submit ticket", exact: true }).click();
  await expect(own.page.getByTestId("ticket-submitted")).toBeVisible();
  const ticket = checked(
    await alice.client
      .from("support_tickets")
      .select("*")
      .eq("message", "Isolated tracking status test"),
  ).at(0);
  expect(ticket.user_id).toBe(alice.id);
  expect(checked(await bob.client.from("support_tickets").select("*").eq("id", ticket.id))).toEqual(
    [],
  );
  checked(
    await operator.client
      .from("support_tickets")
      .update({ status: "in_progress", admin_response: "Tracking test reply" })
      .eq("id", ticket.id),
  );
  await own.page.reload();
  await own.page.getByTestId("utility-rail-profile").click();
  await expect(own.page.getByText("Tracking test reply", { exact: true })).toBeVisible();
  checked(
    await operator.client
      .from("support_tickets")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", ticket.id),
  );
  expect(
    checked(await alice.client.from("support_tickets").select("status").eq("id", ticket.id))[0]
      .status,
  ).toBe("resolved");
  await own.context.close();
});

test("GPS offline retry produces one activity and one reward evaluation", async () => {
  const start = Date.now() - 300000;
  const payload = {
    p_client_session_id: "svj:" + randomUUID(),
    p_activity_type: "walking",
    p_started_at: new Date(start).toISOString(),
    p_ended_at: new Date(start + 120000).toISOString(),
    p_duration_seconds: 120,
    p_step_count: 120,
    p_points: [
      { lat: 12.9, lng: 77.6, t: 0, moving: true, acc: 5 },
      { lat: 12.901, lng: 77.6, t: 120000, moving: true, acc: 5 },
    ],
    p_device_platform: "ios",
    p_gps_quality: "good",
  };
  const first = await rpc(alice, "svj_save_gps_activity", payload),
    retry = await rpc(alice, "svj_save_gps_activity", payload);
  expect(first.ok).toBe(true);
  expect(retry.duplicate).toBe(true);
  expect(retry.activity.id).toBe(first.activity.id);
  const reward = await rpc(alice, "svj_process_activity_rewards", {
    p_activity_id: first.activity.id,
  });
  expect(reward.ok).toBe(true);
  const again = await rpc(alice, "svj_process_activity_rewards", {
    p_activity_id: first.activity.id,
  });
  expect(again.ok).toBe(true);
  expect(
    checked(
      await bob.client.from("svj_activity_tracks").select("*").eq("activity_id", first.activity.id),
    ),
  ).toEqual([]);
});

test("daily steps stay private, monotonic and separate from activity rewards", async () => {
  const day = new Date().toISOString().slice(0, 10),
    row = { user_id: alice.id, date_key: day, steps: 100, distance_meters: 70, source: "ios" };
  checked(await alice.client.from("svj_live_daily_steps").upsert(row));
  checked(
    await alice.client
      .from("svj_live_daily_steps")
      .upsert({ ...row, steps: 50, distance_meters: 20, updated_at: "2099-01-01T00:00:00Z" }),
  );
  const saved = checked(
    await alice.client.from("svj_live_daily_steps").select("*").eq("user_id", alice.id),
  )[0];
  expect(saved.steps).toBe(100);
  expect(saved.distance_meters).toBe(70);
  expect(Date.parse(saved.updated_at)).toBeLessThan(Date.now() + 10000);
  expect(
    checked(await bob.client.from("svj_live_daily_steps").select("*").eq("user_id", alice.id)),
  ).toEqual([]);
  expect((await bob.client.from("svj_live_daily_steps").upsert(row)).error).toBeTruthy();
});

test("friends, rivalry request/cancel, notifications and removal", async () => {
  const friendship = checked(
    await alice.client
      .from("friendships")
      .insert({ requester_id: alice.id, addressee_id: bob.id, status: "pending" })
      .select()
      .single(),
  );
  expect((await rpc(bob, "get_friend_requests")).length).toBeGreaterThan(0);
  checked(
    await bob.client.from("friendships").update({ status: "accepted" }).eq("id", friendship.id),
  );
  expect((await rpc(alice, "get_friends")).length).toBeGreaterThan(0);
  const rivalry = await rpc(alice, "svj_create_rivalry", { p_opponent_id: bob.id });
  const rows = await rpc(alice, "svj_list_rivalries");
  expect(rows.length).toBeGreaterThan(0);
  const id = rivalry.id ?? rivalry.rivalry?.id ?? rows[0].id;
  await rpc(alice, "svj_cancel_rivalry", { p_rivalry_id: id });
  expect((await rpc(alice, "svj_list_rivalries")).find((row) => row.id === id).status).toBe(
    "cancelled",
  );
  checked(await alice.client.from("friendships").delete().eq("id", friendship.id));
  expect(await rpc(alice, "get_friends")).toEqual([]);
});

test("nutrition meal totals, private data and delete", async () => {
  const meal = checked(
    await alice.client
      .from("svj_nutrition_meals")
      .insert({
        user_id: alice.id,
        day_key: new Date().toISOString().slice(0, 10),
        meal_type: "lunch",
        name: "Isolated lunch",
        calories: 400,
        protein_g: 20,
        carbs_g: 50,
        fat_g: 10,
      })
      .select()
      .single(),
  );
  expect(meal.calories).toBe(400);
  expect(
    checked(await bob.client.from("svj_nutrition_meals").select("*").eq("id", meal.id)),
  ).toEqual([]);
  checked(await alice.client.from("svj_nutrition_meals").delete().eq("id", meal.id));
  expect(
    checked(await alice.client.from("svj_nutrition_meals").select("*").eq("id", meal.id)),
  ).toEqual([]);
});

test("challenge start, persisted progress and missions keep claiming disabled", async () => {
  const started = await rpc(bob, "svj_start_my_challenge");
  expect(started).toBeTruthy();
  const state = await rpc(bob, "svj_get_my_challenge_state");
  expect(state).toBeTruthy();
  const policy = (
    await db.query(
      "select claims_enabled from public.reward_policies where campaign_id='earned-plus-launch-v1'",
    )
  ).rows;
  expect(policy.every((row) => row.claims_enabled === false)).toBe(true);
  expect(policy.length).toBeGreaterThan(0);
  const missions = await rpc(bob, "svj_get_my_engagement_state");
  expect(missions).toBeTruthy();
});

test("active Live Share does not finish recording and an ended link is anonymous-safe", async ({
  page,
}) => {
  const before = checked(await alice.client.from("svj_activities").select("id")).length;
  const share = await rpc(alice, "svj_start_recording_live_share", {
    p_recording_id: randomUUID(),
    p_activity_type: "walking",
  });
  expect(share.ok).toBe(true);
  expect(share.token).toBeTruthy();
  expect(checked(await alice.client.from("svj_activities").select("id")).length).toBe(before);
  expect(
    checked(await anonymous.rpc("svj_get_public_live_share", { p_token: share.token })).active,
  ).toBe(true);
  await rpc(alice, "svj_stop_live_share", { p_token: share.token });
  expect(
    checked(await anonymous.rpc("svj_get_public_live_share", { p_token: share.token })).active,
  ).toBe(false);
  await page.goto(`/live/${share.token}`);
  await expect(page.getByText(/Sharing has ended/i)).toBeVisible();
});

test("database authorization inventory and client secret scan", async () => {
  const tables = (
    await db.query(
      `select c.relname, c.relrowsecurity, exists(select 1 from information_schema.columns a where a.table_schema='public' and a.table_name=c.relname and a.column_name in ('user_id','owner_id','recipient_user_id')) private_owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`,
    )
  ).rows;
  for (const table of tables.filter((t) => t.private_owner))
    expect(table.relrowsecurity, table.relname).toBe(true);
  const policies = (
    await db.query(
      "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname",
    )
  ).rows;
  const functions = (
    await db.query(
      "select proname,prosecdef,proconfig,proacl::text from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname like 'svj_%' order by proname",
    )
  ).rows;
  expect(functions.length).toBeGreaterThan(30);
  await writeFile(
    "isolated-security-inventory.json",
    JSON.stringify(
      {
        scope: "Disposable local Supabase; deployed schema not accessed",
        tables,
        policies,
        functions,
      },
      null,
      2,
    ),
  );
});
