import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Browser,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { addDays } from "@/lib/local-date";
import type { Database } from "@/types/database";
import {
  addTasksOn,
  apiAs,
  makeDuo,
  resetDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * Stage 9: try to break LOCKED IN. Alice (A) and Bruno (B) are a duo, Carla
 * (C) is an authenticated outsider; `anon` has the public key only. Every
 * attack uses real user tokens against the public API (never the service
 * role). Past data is prepared with the DEV fixtures (supabase/dev).
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let T: string;
const LIVE = 15_000;

const uid = async (api: Api) => (await api.auth.getUser()).data.user!.id;
const env = (k: string) => process.env[k]!;

function anonClient() {
  return createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await resetDuo(users.a, users.b, users.c);
  await makeDuo(A, B);
  T = (await A.rpc("my_today")).data!;
});

test.afterAll(async () => {
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  for (const api of [A, B]) {
    const me = await uid(api);
    await api
      .from("profiles")
      .update({ daily_standard_percent: 80 })
      .eq("id", me);
  }
  await A.from("profiles")
    .update({ display_name: "Alice" })
    .eq("id", await uid(A));
  await resetDuo(users.a, users.b, users.c);
});

type Traffic = {
  at: number;
  kind: "http" | "sent" | "received";
  data: string;
}[];

async function open(browser: Browser, user: TestUser, path = "/today") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const dialogs: string[] = [];
  const traffic: Traffic = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on("request", (r) =>
    traffic.push({
      at: Date.now(),
      kind: "http",
      data: `${r.method()} ${r.url()}`,
    }),
  );
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) =>
      traffic.push({ at: Date.now(), kind: "sent", data: String(f.payload) }),
    );
    ws.on("framereceived", (f) =>
      traffic.push({
        at: Date.now(),
        kind: "received",
        data: String(f.payload),
      }),
    );
  });
  await signInUI(page, user, path);
  return { context, page, errors, dialogs, traffic };
}

const tab = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name });
const activity = (page: Page) => page.getByRole("region", { name: "Activity" });
const duoJoins = (t: Traffic) =>
  t.filter(
    (x) =>
      x.kind === "sent" &&
      x.data.includes("phx_join") &&
      x.data.includes("realtime:duo:"),
  );

test("an outsider with stolen ids gets nothing through the API; anon gets nothing at all", async () => {
  // Real data of A / B: a completed task (feed event), B's reaction, a
  // routine, a finished focus session and a challenge.
  const run = await A.from("daily_tasks")
    .insert({ title: "Stolen run" })
    .select("id")
    .single();
  await A.from("daily_tasks")
    .update({ status: "completed" })
    .eq("id", run.data!.id);
  const event = (
    await A.from("activity_events")
      .select("id")
      .eq("target_id", run.data!.id)
      .single()
  ).data!;
  expect(
    (await B.rpc("set_reaction", { p_event_id: event.id, p_type: "fire" }))
      .error,
  ).toBeNull();
  const routine = (
    await A.rpc("create_routine_item", {
      p_title: "Stolen routine",
      p_days: [1, 2, 3, 4, 5, 6, 7],
    })
  ).data!;
  const session = (
    await A.rpc("start_focus_session", {
      p_title: "Stolen focus",
      p_planned_seconds: 600,
    })
  ).data![0];
  await A.rpc("complete_focus_session", { p_id: session.id });
  const challenge = await A.from("challenges")
    .insert({
      title: "Stolen challenge",
      challenge_type: "standard_days",
      target_value: 1,
      start_date: T,
      end_date: addDays(T, 1),
    })
    .select("id")
    .single();
  expect(challenge.error).toBeNull();
  const reaction = (
    await B.from("reactions")
      .select("id")
      .eq("activity_event_id", event.id)
      .single()
  ).data!;
  const duo = (await A.from("duo_members").select("duo_id").limit(1).single())
    .data!;
  const aId = await uid(A);

  const stolen: [keyof Database["public"]["Tables"], string, string][] = [
    ["profiles", "id", aId],
    ["duos", "id", duo.duo_id],
    ["duo_members", "duo_id", duo.duo_id],
    ["daily_tasks", "id", run.data!.id],
    ["routine_items", "id", routine],
    ["focus_sessions", "id", session.id],
    ["activity_events", "id", event.id],
    ["reactions", "id", reaction.id],
    ["challenges", "id", challenge.data!.id],
    ["user_settings", "user_id", aId],
  ];
  for (const [table, col, id] of stolen) {
    const read = await C.from(table).select("*").eq(col, id);
    expect(read.data ?? [], `C reads ${table}`).toEqual([]);
    const del = await C.from(table).delete().eq(col, id).select();
    expect(del.data ?? [], `C deletes ${table}`).toEqual([]);
  }
  const upd = await C.from("daily_tasks")
    .update({ status: "pending" })
    .eq("id", run.data!.id)
    .select();
  expect(upd.data ?? []).toEqual([]);

  // RPCs with stolen ids / hostile parameters.
  const refused = [
    await C.rpc("set_reaction", { p_event_id: event.id, p_type: "fire" }),
    await C.rpc("pause_focus_session", { p_id: session.id }),
    await C.rpc("complete_focus_session", { p_id: session.id }),
    await C.rpc("save_focus_reflection", {
      p_id: session.id,
      p_reflection: "x",
    }),
    await C.rpc("update_routine_item", {
      p_id: routine,
      p_title: "hacked",
      p_days: [1],
      p_category: "custom",
      p_time: null as unknown as string,
      p_visible: true,
      p_notes: "",
      p_reminder: false,
    }),
    await C.rpc("archive_routine_item", { p_id: routine }),
    await C.rpc("join_duo", { p_code: "" }),
    await C.rpc("join_duo", { p_code: "'; drop table duos; --" }),
    await C.rpc("set_reaction", {
      p_event_id: "00000000-0000-4000-8000-000000000000",
      p_type: "fire",
    }),
    await C.rpc("my_daily_progress", { p_from: "0001-01-01", p_to: T }),
    await C.rpc("start_focus_session", {
      p_title: "x",
      p_planned_seconds: 2_000_000_000,
    }),
  ];
  for (const r of refused) expect(r.error).not.toBeNull();
  await C.rpc("reorder_routine_items", { p_ids: [routine] });
  expect((await C.rpc("duo_challenges")).data).toEqual([]);
  expect((await C.rpc("partner_today")).data).toEqual([]);
  expect((await C.rpc("partner_current_focus")).data).toEqual([]);
  expect((await C.rpc("partner_progress_summary")).data).toEqual([]);
  const weeks = (await C.rpc("duo_weeks", { p_weeks: 1_000_000 })).data!;
  expect(weeks).toHaveLength(27);
  expect(weeks.every((w) => w.partner_planned === null)).toBe(true);

  // Nothing of A / B changed.
  expect(
    (await A.from("routine_items").select("title").eq("id", routine).single())
      .data!.title,
  ).toBe("Stolen routine");
  expect(
    (
      await A.from("daily_tasks")
        .select("status")
        .eq("id", run.data!.id)
        .single()
    ).data!.status,
  ).toBe("completed");
  expect(
    (
      await A.from("reactions")
        .select("reaction_type")
        .eq("id", reaction.id)
        .single()
    ).data!.reaction_type,
  ).toBe("fire");
  expect(
    (await A.from("challenges").select("id").eq("id", challenge.data!.id)).data,
  ).toHaveLength(1);

  // anon: every table refused or empty, every RPC refused.
  const anon = anonClient();
  for (const [table] of stolen) {
    const r = await anon.from(table).select("*").limit(1);
    expect(r.data ?? [], `anon reads ${table}`).toEqual([]);
  }
  for (const fn of [
    "my_today",
    "ensure_my_daily_tasks",
    "duo_weeks",
    "duo_challenges",
    "partner_today",
    "partner_current_focus",
    "partner_progress_summary",
    "my_progress_summary",
    "create_duo",
    "leave_duo",
    "server_now",
    "my_active_focus",
    "dev_fixture_reset_history",
  ] as const) {
    const r = await (
      anon.rpc as unknown as (f: string) => PromiseLike<{ error: unknown }>
    )(fn);
    expect(r.error, `anon calls ${fn}`).not.toBeNull();
  }
});

test("closed history cannot be rewritten through the API, the UI or a timezone change", async ({
  browser,
}) => {
  const lastWeek = addDays(
    T,
    -7 - ((new Date(`${T}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
  await addTasksOn(A, [
    { task_date: lastWeek, title: "A old 1", status: "completed" },
    { task_date: lastWeek, title: "A old 2", status: "completed" },
  ]);
  const [bOpen, bDone, b5] = await addTasksOn(B, [
    { task_date: lastWeek, title: "B old open", status: "pending" },
    { task_date: lastWeek, title: "B old done", status: "completed" },
    { task_date: addDays(T, -5), title: "B five days ago", status: "pending" },
  ]);
  // B's own side of last week (the duo formed today, so that week has no
  // partner side — Stage 7 rule); its numbers must not move.
  const week = async () =>
    (await B.rpc("duo_weeks", { p_weeks: 1 })).data!.find(
      (w) => w.week_start === lastWeek,
    );
  const summary = async () => (await B.rpc("my_progress_summary")).data![0];
  const weekBefore = await week();
  const summaryBefore = await summary();
  expect(weekBefore!.me_completed).toBe(1);
  expect(weekBefore!.me_planned).toBeGreaterThanOrEqual(2);

  const locked = (r: { error: { message: string } | null }) =>
    expect(r.error?.message).toContain("LI_HISTORY_LOCKED");
  locked(
    await B.from("daily_tasks").update({ status: "completed" }).eq("id", bOpen),
  );
  locked(
    await B.from("daily_tasks").update({ status: "pending" }).eq("id", bDone),
  );
  locked(
    await B.from("daily_tasks")
      .update({ status: "skipped", skip_reason: "Sick" })
      .eq("id", b5),
  );
  locked(
    await B.from("daily_tasks")
      .update({ visible_to_partner: false })
      .eq("id", bDone),
  );
  locked(await B.from("daily_tasks").delete().eq("id", bOpen));
  locked(
    await B.from("daily_tasks").insert({
      task_date: lastWeek,
      title: "Backdated",
      status: "completed",
    }),
  );
  locked(
    await B.from("routine_items").insert({
      title: "Past routine",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_date: addDays(T, -9),
    }),
  );
  expect(
    (
      await B.from("daily_tasks").insert({
        task_date: addDays(T, 1),
        title: "Tomorrow",
        status: "completed",
      })
    ).error?.message,
  ).toContain("LI_FUTURE_TASK");
  const fakeFocus = await B.from("focus_sessions").insert({
    title: "15 hours yesterday",
    planned_seconds: 43200,
    started_at: new Date(Date.now() - 86_400_000).toISOString(),
  } as never);
  expect(fakeFocus.error).not.toBeNull();

  // Timezone flip: moving west cannot reopen yesterday.
  const bId = await uid(B);
  await B.from("profiles")
    .update({ timezone: "Pacific/Pago_Pago" })
    .eq("id", bId);
  locked(
    await B.from("daily_tasks").update({ status: "completed" }).eq("id", b5),
  );
  await B.from("profiles")
    .update({ timezone: "America/Sao_Paulo" })
    .eq("id", bId);

  expect(await week()).toEqual(weekBefore);
  expect(await summary()).toEqual(summaryBefore);

  // The UI offers no edit on a closed day.
  const b = await open(browser, users.b, "/progress");
  const y = addDays(T, -5);
  if (y.slice(0, 7) !== T.slice(0, 7))
    await b.page.getByRole("button", { name: "Previous month" }).click();
  const mon = new Date(`${y}T12:00:00Z`).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  await b.page
    .getByRole("button", {
      name: new RegExp(`^${mon} ${Number(y.slice(8))}: `),
    })
    .click();
  const day = b.page.getByRole("dialog", { name: "Day detail" });
  await expect(day.getByText("B five days ago")).toBeVisible();
  await expect(day.getByRole("checkbox")).toHaveCount(0);
  await expect(
    day.getByRole("button", { name: /Options|Edit|Skip|Delete/ }),
  ).toHaveCount(0);
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("concurrency: every race ends in one consistent state", async () => {
  const A2 = await apiAs(users.a);

  // Complete / undo from two tabs at once, many times: the final status and
  // the feed agree (no orphan or duplicate event).
  const t = (
    await A.from("daily_tasks")
      .insert({ title: "Race task" })
      .select("id")
      .single()
  ).data!;
  for (let i = 0; i < 6; i++) {
    await Promise.all([
      A.from("daily_tasks").update({ status: "completed" }).eq("id", t.id),
      A2.from("daily_tasks")
        .update({ status: i % 2 ? "pending" : "completed" })
        .eq("id", t.id),
    ]);
  }
  const final = (
    await A.from("daily_tasks").select("status").eq("id", t.id).single()
  ).data!.status;
  const events = (
    await A.from("activity_events").select("id").eq("target_id", t.id)
  ).data!;
  expect(events).toHaveLength(final === "completed" ? 1 : 0);

  // Reactions changed quickly: one row, the last one wins.
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", t.id);
  const ev = (
    await A.from("activity_events").select("id").eq("target_id", t.id).single()
  ).data!;
  await Promise.all(
    (["fire", "salute", "lightning"] as const).map((p_type) =>
      B.rpc("set_reaction", { p_event_id: ev.id, p_type }),
    ),
  );
  expect(
    (await B.from("reactions").select("id").eq("activity_event_id", ev.id))
      .data,
  ).toHaveLength(1);
  for (const p_type of ["fire", "salute", "lightning"] as const)
    await B.rpc("set_reaction", { p_event_id: ev.id, p_type });
  expect(
    (
      await B.from("reactions")
        .select("reaction_type")
        .eq("activity_event_id", ev.id)
    ).data,
  ).toEqual([{ reaction_type: "lightning" }]);

  // LOCK IN on two devices at once: one session.
  const starts = await Promise.all([
    A.rpc("start_focus_session", {
      p_title: "Race focus",
      p_planned_seconds: 600,
    }),
    A2.rpc("start_focus_session", {
      p_title: "Race focus",
      p_planned_seconds: 600,
    }),
  ]);
  expect(starts.filter((s) => s.error === null)).toHaveLength(1);
  expect(starts.find((s) => s.error)!.error!.message).toContain(
    "LI_FOCUS_RUNNING",
  );
  const active = (await A.rpc("my_active_focus")).data!;
  expect(active).toHaveLength(1);
  await A.rpc("complete_focus_session", { p_id: active[0].id });

  // The same challenge submitted twice (both members at once): one row.
  const draft = {
    title: "Race challenge",
    challenge_type: "standard_days",
    target_value: 1,
    start_date: T,
    end_date: addDays(T, 2),
  };
  await Promise.all([
    A.from("challenges").insert(draft),
    B.from("challenges").insert(draft),
  ]);
  expect(
    (await A.from("challenges").select("id").eq("title", "Race challenge"))
      .data,
  ).toHaveLength(1);
  // Double delete before start: gone once, no error for the survivor state.
  const later = (
    await A.from("challenges")
      .insert({ ...draft, title: "Race later", start_date: addDays(T, 1) })
      .select("id")
      .single()
  ).data!;
  await Promise.all([
    A.from("challenges").delete().eq("id", later.id),
    B.from("challenges").delete().eq("id", later.id),
  ]);
  expect(
    (await A.from("challenges").select("id").eq("id", later.id)).data,
  ).toEqual([]);

  // Template applied three times at once: no duplicates.
  await Promise.all(
    [A, A2, A].map((x) =>
      x.rpc("add_routine_items", {
        p_titles: ["Race read", "Race gym"],
        p_categories: ["work_study", "body"],
      }),
    ),
  );
  const titles = (
    await A.from("routine_items")
      .select("title")
      .in("title", ["Race read", "Race gym"])
      .is("end_date", null)
  ).data!;
  expect(titles).toHaveLength(2);

  // Standard saved from two tabs: the last accepted write stands, nothing corrupt.
  const aId = await uid(A);
  await Promise.all([
    A.from("profiles").update({ daily_standard_percent: 50 }).eq("id", aId),
    A2.from("profiles").update({ daily_standard_percent: 90 }).eq("id", aId),
  ]);
  const std = (
    await A.from("profiles")
      .select("daily_standard_percent")
      .eq("id", aId)
      .single()
  ).data!.daily_standard_percent;
  expect([50, 90]).toContain(std);
  expect((await A.rpc("my_progress_summary")).data![0].standard).toBe(std);

  // Both end the duo at the same moment: it ends once, nobody is stuck.
  const ends = await Promise.all([A.rpc("leave_duo"), B.rpc("leave_duo")]);
  for (const e of ends)
    if (e.error) expect(e.error.message).toContain("LI_NOT_IN_DUO");
  expect((await A.from("duo_members").select("user_id")).data).toEqual([]);
  expect((await B.from("duo_members").select("user_id")).data).toEqual([]);
  expect((await A.rpc("create_duo")).error).toBeNull();
  await A.rpc("leave_duo");
  await makeDuo(A, B);
  await A2.auth.signOut({ scope: "local" });
});

test("after END DUO the old channel goes quiet: nothing of the new duo reaches the old partner", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const b = await open(browser, users.b, "/partner");
  await expect(
    b.page.getByRole("heading", { level: 1, name: /ALICE/ }),
  ).toBeVisible();
  const oldDuo = (
    await B.from("duo_members").select("duo_id").limit(1).single()
  ).data!.duo_id;
  await expect
    .poll(() => duoJoins(b.traffic).length, { timeout: LIVE })
    .toBeGreaterThan(0);

  await A.rpc("leave_duo");
  await expect(
    b.page.getByRole("heading", { name: "NO PARTNER YET" }),
  ).toBeVisible({ timeout: LIVE });
  // B's app left the old topic right away.
  await expect
    .poll(
      () =>
        b.traffic.some(
          (x) =>
            x.kind === "sent" &&
            x.data.includes("phx_leave") &&
            x.data.includes(oldDuo),
        ),
      { timeout: LIVE },
    )
    .toBe(true);

  const since = Date.now();
  await C.rpc("leave_duo");
  await makeDuo(A, C);
  const newDuo = (
    await C.from("duo_members").select("duo_id").limit(1).single()
  ).data!.duo_id;
  const cTask = (
    await C.from("daily_tasks")
      .insert({ title: "Carla new duo" })
      .select("id")
      .single()
  ).data!;
  await C.from("daily_tasks")
    .update({ status: "completed" })
    .eq("id", cTask.id);
  const cEvent = (
    await C.from("activity_events")
      .select("id")
      .eq("target_id", cTask.id)
      .single()
  ).data!;
  await A.rpc("set_reaction", { p_event_id: cEvent.id, p_type: "fire" });
  await b.page.waitForTimeout(4000);

  const received = b.traffic
    .filter((x) => x.kind === "received" && x.at >= since)
    .map((x) => x.data);
  expect(received.filter((d) => d.includes(newDuo))).toEqual([]);
  expect(
    received.filter(
      (d) => d.includes(oldDuo) && /activity|reaction|presence_diff/.test(d),
    ),
  ).toEqual([]);
  await expect(b.page.getByText("Carla new duo")).toHaveCount(0);
  // C (new partner) sees none of the old duo.
  expect(
    (await C.from("activity_events").select("id").eq("duo_id", oldDuo)).data,
  ).toEqual([]);
  expect(b.errors).toEqual([]);
  await b.context.close();

  await Promise.all([A.rpc("leave_duo"), C.rpc("leave_duo")]);
  await makeDuo(A, B);
});

test("one channel per duo, no polling, clean reconnect", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/today");
  await expect
    .poll(() => duoJoins(a.traffic).length, { timeout: LIVE })
    .toBe(1);

  for (let i = 0; i < 3; i++) {
    for (const name of [/PARTNER/, /FOCUS/, /PROGRESS/, /MORE/, /TODAY/]) {
      await tab(a.page, name).click();
      await a.page.waitForTimeout(250);
    }
  }
  expect(duoJoins(a.traffic)).toHaveLength(1);

  // Idle on Progress: no HTTP request, no client message except heartbeats.
  await tab(a.page, /PROGRESS/).click();
  await a.page.waitForTimeout(1500);
  const from = Date.now();
  await a.page.waitForTimeout(8000);
  const idle = a.traffic.filter((x) => x.at >= from);
  expect(idle.filter((x) => x.kind === "http")).toEqual([]);
  expect(
    idle.filter((x) => x.kind === "sent" && !x.data.includes("heartbeat")),
  ).toEqual([]);

  // Offline -> online: one rejoin, no duplicated feed lines.
  await tab(a.page, /PARTNER/).click();
  const lines = await activity(a.page).getByRole("listitem").count();
  await a.context.setOffline(true);
  await expect(
    a.page.getByRole("status").filter({ hasText: "Offline" }),
  ).toBeVisible({ timeout: LIVE });
  await a.context.setOffline(false);
  await expect(
    a.page.getByRole("status").filter({ hasText: /Offline|Reconnecting/ }),
  ).toHaveCount(0, { timeout: 30_000 });
  await a.page.waitForTimeout(2000);
  expect(await activity(a.page).getByRole("listitem").count()).toBe(lines);
  expect(duoJoins(a.traffic).length).toBeLessThanOrEqual(2);
  expect(
    a.errors.filter(
      (e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|WebSocket/.test(e),
    ),
  ).toEqual([]);
  await a.context.close();
});

async function bareRequest(request: APIRequestContext, path: string) {
  return request.get(path, { maxRedirects: 0 });
}

test("HTTP hardening: headers, private routes and redirects", async ({
  playwright,
  baseURL,
  browser,
}) => {
  const request = await playwright.request.newContext({ baseURL });
  const login = await bareRequest(request, "/login");
  const h = login.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();

  for (const path of [
    "/today",
    "/partner",
    "/focus",
    "/progress",
    "/more",
    "/settings",
    "/challenges",
    "/duo",
    "/routine",
  ]) {
    const r = await bareRequest(request, path);
    expect(r.status(), path).toBeGreaterThanOrEqual(300);
    expect(r.status(), path).toBeLessThan(400);
    expect(r.headers()["location"], path).toMatch(/^\/login\?next=/);
    expect(await r.text()).not.toMatch(/Alice|Bruno|Carla/);
  }
  const confirm = await bareRequest(
    request,
    "/auth/confirm?next=//evil.example",
  );
  expect(new URL(confirm.headers()["location"], baseURL).origin).toBe(
    new URL(baseURL!).origin,
  );
  await request.dispose();

  // Sign-in never follows an external or smuggled `next`.
  for (const next of [
    "https://evil.example",
    "//evil.example",
    "/\t/evil.example",
    "/\\evil.example",
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByPlaceholder("Email").fill(users.c.email());
    await page.getByPlaceholder("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/today$/);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    await context.close();
  }
});

test("user content is always text: no script runs, no SQL runs, layout holds", async ({
  browser,
}) => {
  const hostile = [
    "<img src=x onerror=alert(1)>",
    "'; DROP TABLE daily_tasks; --",
    "🔥 Ñandú — 漢字 ✓",
  ];
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  for (const title of hostile) {
    await a.page.getByRole("button", { name: "Add task" }).click();
    const add = a.page.getByRole("dialog", { name: "Add task" });
    await add.getByRole("textbox", { name: "Task name" }).fill(title);
    await add.getByRole("button", { name: "ADD", exact: true }).click();
    await expect(
      a.page.getByRole("checkbox", { name: title, exact: true }),
    ).toBeVisible();
  }
  await writes.idle();
  await A.from("profiles")
    .update({ display_name: "<b>Ali</b>" })
    .eq("id", await uid(A));
  await a.page.reload();
  for (const title of hostile)
    await expect(
      a.page.getByRole("checkbox", { name: title, exact: true }),
    ).toBeVisible();
  const overflow = await a.page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  const b = await open(browser, users.b, "/partner");
  await expect(
    b.page.getByRole("heading", { level: 1, name: "<B>ALI</B>" }),
  ).toBeVisible();
  await expect(b.page.getByText(hostile[1])).toBeVisible();
  expect(a.dialogs).toEqual([]);
  expect(b.dialogs).toEqual([]);
  // Stored verbatim (and the table is obviously still there).
  const stored = (
    await A.from("daily_tasks").select("title").eq("task_date", T)
  ).data!.map((r) => r.title);
  for (const title of hostile) expect(stored).toContain(title);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await A.from("profiles")
    .update({ display_name: "Alice" })
    .eq("id", await uid(A));
  await a.context.close();
  await b.context.close();
});

test("accessibility: no serious or critical axe violation on the main screens", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Real content on every screen: a done and an open task, a shared feed line.
  const done = (
    await A.from("daily_tasks")
      .insert({ title: "Axe done" })
      .select("id")
      .single()
  ).data!;
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", done.id);
  await A.from("daily_tasks").insert({ title: "Axe open" });
  const a = await open(browser, users.a, "/today");
  const report: string[] = [];
  for (const path of [
    "/today",
    "/partner",
    "/focus",
    "/progress",
    "/more",
    "/settings",
    "/challenges",
    "/duo",
    "/routine",
  ]) {
    await a.page.goto(path);
    await a.page.waitForLoadState("load");
    await a.page.waitForTimeout(800);
    const { violations } = await new AxeBuilder({ page: a.page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const v of violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ))
      report.push(
        `${path} ${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
      );
  }
  // The Focus overlay while a session runs.
  const run = (
    await A.rpc("start_focus_session", {
      p_title: "Axe focus",
      p_planned_seconds: 600,
    })
  ).data![0];
  await a.page.goto("/focus");
  await a.page.waitForTimeout(800);
  {
    const { violations } = await new AxeBuilder({ page: a.page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const v of violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ))
      report.push(
        `focus overlay ${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
      );
  }
  await A.rpc("complete_focus_session", { p_id: run.id });
  const guest = await browser.newContext();
  const login = await guest.newPage();
  await login.goto("/login");
  // The auth screen fades in (0.5 s): measure the settled page.
  await login.waitForTimeout(800);
  const { violations } = await new AxeBuilder({ page: login })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  for (const v of violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  ))
    report.push(
      `/login ${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
    );
  await guest.close();
  expect(report).toEqual([]);
  await a.context.close();
});

test("keyboard: sheets and the end-duo confirmation open, trap nothing and close with Escape", async ({
  browser,
}) => {
  await A.from("daily_tasks").insert({ title: "Keyboard task" });
  const a = await open(browser, users.a, "/today");
  const add = a.page.getByRole("button", { name: "Add task" });
  await add.focus();
  await a.page.keyboard.press("Enter");
  const sheet = a.page.getByRole("dialog", { name: "Add task" });
  await expect(sheet).toBeVisible();
  // Focus moved into the sheet, and Tab keeps moving (no trap on one element).
  await expect
    .poll(() => sheet.evaluate((d) => d.contains(document.activeElement)))
    .toBe(true);
  const before = await a.page.evaluate(() => document.activeElement?.outerHTML);
  await a.page.keyboard.press("Tab");
  expect(
    await a.page.evaluate(() => document.activeElement?.outerHTML),
  ).not.toBe(before);
  await a.page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(add).toBeFocused();

  await a.page.goto("/duo");
  await a.page.getByRole("button", { name: "Leave duo" }).click();
  const confirm = a.page.getByRole("alertdialog", { name: "End this duo?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Keep duo" })).toBeFocused();
  await a.page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(a.page.getByRole("button", { name: "Leave duo" })).toBeFocused();
  await expect(a.page.getByTestId("duo-partner-name")).toHaveText("Bruno");
  expect(a.errors).toEqual([]);
  await a.context.close();
});
