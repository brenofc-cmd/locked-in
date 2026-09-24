import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "@/types/database";
import { DESIGN_DAY } from "../fixtures/design-day";

/** Loaded by playwright.config.ts from .env.local and .env.test.local (git-ignored). */
function env(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is missing. See docs/DATABASE.md → "Test users".`);
  return v;
}

export const users = {
  brendon: { email: () => env("E2E_BRENDON_EMAIL"), name: "Brendon" },
  lucas: { email: () => env("E2E_LUCAS_EMAIL"), name: "Lucas" },
  a: { email: () => env("E2E_A_EMAIL"), name: "Alice" },
  b: { email: () => env("E2E_B_EMAIL"), name: "Bruno" },
  c: { email: () => env("E2E_C_EMAIL"), name: "Carla" },
  desk: { email: () => env("E2E_DESK_EMAIL"), name: "Brendon" },
  lucas2: { email: () => env("E2E_LUCAS2_EMAIL"), name: "Lucas" },
  layout: { email: () => env("E2E_LAYOUT_EMAIL"), name: "Brendon" },
};
export type TestUser = (typeof users)[keyof typeof users];

export const password = () => env("E2E_PASSWORD");

/** A Supabase client signed in as a test user, using only the public key (RLS applies). */
export async function apiAs(user: TestUser) {
  const client = createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: user.email(),
    password: password(),
  });
  if (error)
    throw new Error(`Sign-in failed for ${user.email()}: ${error.code}`);
  return client;
}

/** Leaves any duo (ignores "not in a duo"). */
export async function resetDuo(...users: TestUser[]) {
  for (const u of users) {
    const c = await apiAs(u);
    await c.rpc("leave_duo");
    // "local": a global sign-out would revoke the user's browser sessions too.
    await c.auth.signOut({ scope: "local" });
  }
}

export type Api = Awaited<ReturnType<typeof apiAs>>;

/**
 * Test users only: archive every routine item and delete every task, so a
 * run starts from an empty day. (Archived routine rows stay; see
 * supabase/dev/reset_test_users.sql for a full DEV cleanup.)
 */
export async function resetTasks(api: Api) {
  await finishFocus(api);
  const { data: me } = await api.auth.getUser();
  const id = me.user!.id;
  const active = await api
    .from("routine_items")
    .select("id, end_date")
    .eq("owner_id", id);
  const today = (await api.rpc("my_today")).data!;
  for (const r of active.data ?? []) {
    if (r.end_date === null || r.end_date >= today) {
      await api.rpc("archive_routine_item", { p_id: r.id });
    }
  }
  const del = await api.from("daily_tasks").delete().eq("owner_id", id);
  if (del.error) throw new Error(`reset failed: ${del.error.message}`);
}

export const isoWeekday = (dateISO: string) => {
  const d = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Seeds the approved design's Today (12 tasks, 8 done = 67%) as real data. */
export async function seedDesignDay(api: Api) {
  await resetTasks(api);
  const today = (await api.rpc("my_today")).data!;
  const restDay = (isoWeekday(today) % 7) + 1; // "Long run" rests today
  for (const item of DESIGN_DAY) {
    const { error } = await api.rpc("create_routine_item", {
      p_title: item.name,
      p_days: item.today === false ? [restDay] : [1, 2, 3, 4, 5, 6, 7],
      p_category: item.category,
      p_time: item.time || undefined,
      p_notes: item.notes,
    });
    if (error) throw new Error(`seed failed: ${error.message}`);
  }
  const done = DESIGN_DAY.filter((d) => d.done).map((d) => d.name);
  const upd = await api
    .from("daily_tasks")
    .update({ status: "completed" })
    .eq("task_date", today)
    .in("title", done);
  if (upd.error) throw new Error(`seed failed: ${upd.error.message}`);
}

/**
 * The partner's real day for the UI suite: a few shared items, "Reading" and
 * then "Morning Run" completed (so the latest activity is Morning Run). Run
 * after makeDuo: completions only become duo activity inside a duo.
 */
export async function seedPartnerDay(api: Api) {
  await resetTasks(api);
  const today = (await api.rpc("my_today")).data!;
  for (const title of [
    "Wake up at 06:30",
    "Reading",
    "Morning Run",
    "Gym",
    "Study Mathematics",
  ]) {
    const { error } = await api.rpc("create_routine_item", {
      p_title: title,
      p_days: [1, 2, 3, 4, 5, 6, 7],
    });
    if (error) throw new Error(`seed failed: ${error.message}`);
  }
  for (const title of ["Wake up at 06:30", "Reading", "Morning Run"]) {
    const upd = await api
      .from("daily_tasks")
      .update({ status: "completed" })
      .eq("task_date", today)
      .eq("title", title);
    if (upd.error) throw new Error(`seed failed: ${upd.error.message}`);
  }
}

/** Completes the user's unfinished focus session, if any (clean slate for tests). */
export async function finishFocus(api: Api) {
  const { data } = await api.rpc("my_active_focus");
  for (const s of data ?? [])
    await api.rpc("complete_focus_session", { p_id: s.id });
}

/** Two users form a fresh duo through the real RPCs. */
export async function makeDuo(a: Api, b: Api) {
  await a.rpc("leave_duo");
  await b.rpc("leave_duo");
  const { data, error } = await a.rpc("create_duo");
  if (error || !data?.[0])
    throw new Error(`create_duo failed: ${error?.message}`);
  const joined = await b.rpc("join_duo", { p_code: data[0].invite_code });
  if (joined.error) throw new Error(`join_duo failed: ${joined.error.message}`);
}

/**
 * Tracks Server Action requests (POSTs) on a page. `idle()` resolves once
 * every write started so far has finished, i.e. it is in the database.
 */
export function trackWrites(page: Page) {
  let pending = 0;
  const done = (r: { method(): string }) => {
    if (r.method() === "POST") pending--;
  };
  page.on("request", (r) => {
    if (r.method() === "POST") pending++;
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return {
    idle: () => expect.poll(() => pending, { timeout: 15_000 }).toBe(0),
  };
}

export async function signInUI(page: Page, user: TestUser, next = "/today") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByPlaceholder("Email").fill(user.email());
  await page.getByPlaceholder("Password").fill(password());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}
