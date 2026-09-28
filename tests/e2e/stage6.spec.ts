import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  apiAs,
  finishFocus,
  makeDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * Stage 6: persistent focus sessions on the DEV project. Alice (A) focuses,
 * Bruno (B) is her partner, Carla (C) an outsider. Timers are never waited
 * out in real time: expiry uses a 2-second session created through the real
 * RPC. Watching pages are never reloaded.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
const LIVE = 15_000;

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await C.rpc("leave_duo");
  await makeDuo(A, B);
  const secret = await A.rpc("create_routine_item", {
    p_title: "Secret thesis",
    p_days: [1, 2, 3, 4, 5, 6, 7],
    p_visible: false,
  });
  if (secret.error) throw new Error(secret.error.message);
});

test.afterAll(async () => {
  await Promise.all([resetTasks(A), resetTasks(B)]);
  await Promise.all([A, B, C].map((x) => x.rpc("leave_duo")));
});

type Traffic = {
  at: number;
  kind: "http" | "ws-sent" | "ws-received";
  data: string;
}[];

/** Signed-in page that records its HTTP requests and websocket frames from the start. */
async function open(browser: Browser, user: TestUser, path = "/today") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const traffic: Traffic = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) =>
    traffic.push({
      at: Date.now(),
      kind: "http",
      data: `${r.method()} ${r.url()}`,
    }),
  );
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) =>
      traffic.push({
        at: Date.now(),
        kind: "ws-sent",
        data: String(f.payload),
      }),
    );
    ws.on("framereceived", (f) =>
      traffic.push({
        at: Date.now(),
        kind: "ws-received",
        data: String(f.payload),
      }),
    );
  });
  await signInUI(page, user, path);
  return { context, page, errors, traffic };
}

// Realtime frames: JSON arrays for control / presence, a compact binary
// format for broadcasts ("…realtime:duo:<id>focus{…}").
const FOCUS_FRAME = /realtime:duo:[0-9a-f-]{36}"?,?"?focus[{"]/;
const ANY_BROADCAST =
  /realtime:duo:[0-9a-f-]{36}"?,?"?(activity|activity_removed|tasks_changed|broadcast)[{"]/;

const during = (
  t: Traffic,
  from: number,
  to: number,
  kind: Traffic[number]["kind"],
) =>
  t
    .filter((x) => x.kind === kind && x.at >= from && x.at <= to)
    .map((x) => x.data);

const overlay = (page: Page) =>
  page.getByRole("dialog", { name: "Sessão de Foco" });
const clock = (page: Page) => page.getByTestId("focus-clock");
const toSeconds = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
};
const partnerCard = (page: Page, status: string) =>
  page.getByRole("link", { name: new RegExp(`^Alice: ${status},`) });

async function lockIn(page: Page, option: string, minutes: "25" | "50") {
  await page.goto("/focus");
  await page.getByRole("radio", { name: option }).first().click();
  await page.getByRole("radio", { name: `${minutes} minutos` }).click();
  await page.getByRole("button", { name: "LOCK IN" }).click();
  await expect(overlay(page)).toBeVisible();
}

test("a session survives refresh while running and while paused; ends early with a reflection", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await finishFocus(A);
  const a = await open(browser, users.a, "/focus");
  const writes = trackWrites(a.page);

  await lockIn(a.page, "Projeto", "25");
  await expect(clock(a.page)).toHaveText(/^2[45]:\d\d$/);
  const active = (await A.rpc("my_active_focus")).data!;
  expect(active).toHaveLength(1);
  expect(active[0]).toMatchObject({
    title: "Projeto",
    planned_seconds: 1500,
    status: "active",
  });

  // Refresh while running: restored, and the time kept running (not 25:00).
  await a.page.waitForTimeout(3000);
  await a.page.reload();
  await expect(overlay(a.page)).toBeVisible();
  await expect
    .poll(async () => toSeconds((await clock(a.page).textContent()) ?? ""))
    .toBeLessThan(1500 - 2);

  // Pause: the clock stops, and stays stopped across a refresh.
  await overlay(a.page).getByRole("button", { name: "PAUSAR" }).click();
  await expect(
    overlay(a.page).getByRole("button", { name: "RETOMAR" }),
  ).toBeVisible();
  await writes.idle();
  const pausedAt = toSeconds((await clock(a.page).textContent())!);
  await a.page.waitForTimeout(3000);
  expect(toSeconds((await clock(a.page).textContent())!)).toBe(pausedAt);
  await a.page.reload();
  await expect(
    overlay(a.page).getByRole("button", { name: "RETOMAR" }),
  ).toBeVisible();
  expect(
    Math.abs(toSeconds((await clock(a.page).textContent())!) - pausedAt),
  ).toBeLessThanOrEqual(1);
  expect((await A.rpc("my_active_focus")).data![0].status).toBe("paused");

  // Resume: running again.
  await overlay(a.page).getByRole("button", { name: "RETOMAR" }).click();
  await expect
    .poll(async () => toSeconds((await clock(a.page).textContent()) ?? ""), {
      timeout: 5000,
    })
    .toBeLessThan(pausedAt);
  await writes.idle();

  // End early: real duration, optional reflection, focus today updated.
  const note = `Outlined chapter ${Date.now()}.`;
  await overlay(a.page)
    .getByRole("button", { name: "Encerrar sessão" })
    .click();
  const done = a.page.getByRole("dialog", { name: "Sessão concluída" });
  await expect(done.getByText("MIN CONCLUÍDOS")).toBeVisible();
  await done.getByRole("textbox").fill(note);
  await done.getByRole("button", { name: "PRONTO" }).click();
  await expect(done).toBeHidden();
  await writes.idle();
  await expect(a.page.getByText(note)).toBeVisible();

  const { data: rows } = await A.from("focus_sessions")
    .select("*")
    .eq("id", active[0].id);
  expect(rows![0].status).toBe("completed");
  expect(rows![0].reflection).toBe(note);
  // ~6 s of focus with ≥ 3 s paused excluded.
  expect(rows![0].actual_focus_seconds).toBeGreaterThanOrEqual(3);
  expect(rows![0].actual_focus_seconds).toBeLessThan(30);
  expect(rows![0].accumulated_pause_seconds).toBeGreaterThanOrEqual(3);

  await a.page.reload();
  await expect(a.page.getByText(note)).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("a session that ran out while the app was closed is reconciled on open", async ({
  browser,
}) => {
  await finishFocus(A);
  const started = await A.rpc("start_focus_session", {
    p_title: "Expired sprint",
    p_planned_seconds: 2,
  });
  expect(started.error).toBeNull();
  const id = started.data![0].id;
  await new Promise((r) => setTimeout(r, 3500));

  const a = await open(browser, users.a, "/focus");
  await expect(overlay(a.page)).toHaveCount(0);
  const { data } = await A.from("focus_sessions").select("*").eq("id", id);
  expect(data![0]).toMatchObject({
    status: "completed",
    actual_focus_seconds: 2,
  });
  // Ended when the plan ended (start + 2 s), not when the app reopened.
  expect(Date.parse(data![0].ended_at!) - Date.parse(data![0].started_at)).toBe(
    2000,
  );
  const events = await B.from("activity_events")
    .select("event_type, duration_seconds")
    .eq("target_id", id);
  expect(events.data!.map((e) => e.event_type).sort()).toEqual([
    "focus_completed",
    "focus_started",
  ]);
  await a.context.close();
});

test("the partner sees focus live: start, pause, resume, end, app closed; private title hidden", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await finishFocus(A);
  const b = await open(browser, users.b, "/today");
  let a = await open(browser, users.a, "/focus");

  await expect(partnerCard(b.page, "online")).toBeVisible({ timeout: LIVE });

  // Start -> B: FOCUSING with the shared title and a running clock.
  await lockIn(a.page, "Projeto", "25");
  const focusing = partnerCard(b.page, "em foco");
  await expect(focusing).toBeVisible({ timeout: LIVE });
  await expect(focusing).toContainText(/Projeto · 2[45]:\d\d/);
  await expect(
    b.page.getByRole("status").getByText("Alice iniciou Foco — Projeto"),
  ).toBeVisible({ timeout: LIVE });

  // Pause / resume reach B without reload.
  await overlay(a.page).getByRole("button", { name: "PAUSAR" }).click();
  await expect(focusing).toContainText("pausado", { timeout: LIVE });
  await overlay(a.page).getByRole("button", { name: "RETOMAR" }).click();
  await expect(focusing).not.toContainText("pausado", { timeout: LIVE });

  // A closes the app mid-session: still FOCUSING for B (persistent, not presence).
  await a.context.close();
  await b.page.waitForTimeout(6000);
  await expect(partnerCard(b.page, "em foco")).toBeVisible();

  // A reopens: the session is restored; A ends it -> B sees ONLINE.
  a = await open(browser, users.a, "/today");
  await expect(overlay(a.page)).toBeVisible();
  await overlay(a.page)
    .getByRole("button", { name: "Encerrar sessão" })
    .click();
  const done = a.page.getByRole("dialog", { name: "Sessão concluída" });
  await done.getByRole("textbox").fill("private note for me");
  await done.getByRole("button", { name: "PRONTO" }).click();
  await expect(partnerCard(b.page, "online")).toBeVisible({ timeout: LIVE });
  await expect(
    b.page.getByText(/Alice concluiu (<1|\d+) min de Foco/).first(),
  ).toBeVisible({ timeout: LIVE });

  // Private: a session on a private task shows no title to B.
  await lockIn(a.page, "Secret thesis", "25");
  await expect(partnerCard(b.page, "em foco")).toBeVisible({ timeout: LIVE });
  await b.page.waitForTimeout(1500);
  await expect(b.page.getByText("Secret thesis")).toHaveCount(0);
  await expect(
    b.page.getByRole("status").getByText("Alice iniciou Foco", { exact: true }),
  ).toBeVisible();

  // Reflection is never readable by the partner.
  await expect(b.page.getByText("private note for me")).toHaveCount(0);
  const aIds = (await A.from("focus_sessions").select("id")).data!.map(
    (r) => r.id,
  );
  expect(aIds.length).toBeGreaterThan(0);
  expect(
    (await B.from("focus_sessions").select("id").in("id", aIds)).data,
  ).toEqual([]);
  const projection = (await B.rpc("partner_current_focus")).data!;
  expect(projection).toHaveLength(1);
  expect(projection[0].title).toBeNull();
  expect(Object.keys(projection[0])).not.toContain("reflection");

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
  await finishFocus(A);
});

test("second tab restores the session, cannot start another, and a pause there reaches the first tab", async ({
  browser,
}) => {
  await finishFocus(A);
  const a = await open(browser, users.a, "/focus");
  await lockIn(a.page, "Leitura", "50");

  const tab2 = await a.context.newPage();
  await tab2.goto("/focus");
  await expect(overlay(tab2)).toBeVisible(); // same session, not a new picker
  await expect(overlay(tab2).getByText("LEITURA")).toBeVisible();

  await overlay(tab2).getByRole("button", { name: "PAUSAR" }).click();
  await expect(
    overlay(a.page).getByRole("button", { name: "RETOMAR" }),
  ).toBeVisible({ timeout: LIVE });

  // A second device racing a start gets a friendly refusal; still one session.
  const second = await A.rpc("start_focus_session", {
    p_title: "Other device",
    p_planned_seconds: 600,
  });
  expect(second.error?.message).toContain("LI_FOCUS_RUNNING");
  expect((await A.rpc("my_active_focus")).data).toHaveLength(1);
  await a.context.close();
  await finishFocus(A);
});

test("double LOCK IN and concurrent starts create exactly one session", async ({
  browser,
}) => {
  await finishFocus(A);
  const [r1, r2] = await Promise.all([
    A.rpc("start_focus_session", { p_title: "Race 1", p_planned_seconds: 600 }),
    A.rpc("start_focus_session", { p_title: "Race 2", p_planned_seconds: 600 }),
  ]);
  expect([r1.error, r2.error].filter(Boolean)).toHaveLength(1);
  expect((await A.rpc("my_active_focus")).data).toHaveLength(1);
  await finishFocus(A);

  const a = await open(browser, users.a, "/focus");
  const before = (await A.from("focus_sessions").select("id")).data!.length;
  await a.page.getByRole("radio", { name: "Estudo" }).click();
  await a.page.getByRole("button", { name: "LOCK IN" }).dblclick();
  await expect(overlay(a.page)).toBeVisible();
  await a.page.waitForTimeout(1500);
  expect((await A.from("focus_sessions").select("id")).data!.length).toBe(
    before + 1,
  );
  await a.context.close();
  await finishFocus(A);
});

test("outsider has no access to A's focus", async () => {
  await finishFocus(A);
  const s = (
    await A.rpc("start_focus_session", {
      p_title: "Deep work",
      p_planned_seconds: 600,
    })
  ).data![0];
  expect(
    (await C.from("focus_sessions").select("id").eq("id", s.id)).data,
  ).toEqual([]);
  expect((await C.rpc("partner_current_focus")).data).toEqual([]);
  expect(
    (await C.rpc("pause_focus_session", { p_id: s.id })).error?.message,
  ).toContain("LI_NOT_FOUND");
  expect(
    (await C.rpc("complete_focus_session", { p_id: s.id })).error?.message,
  ).toContain("LI_NOT_FOUND");
  expect((await A.rpc("my_active_focus")).data![0].status).toBe("active");
  await finishFocus(A);
});

test("a running focus sends nothing per second: no writes, no broadcasts, no presence updates", async ({
  browser,
}) => {
  await finishFocus(A);
  const b = await open(browser, users.b, "/today");
  const a = await open(browser, users.a, "/focus");
  await lockIn(a.page, "Projeto", "25");
  await expect(partnerCard(b.page, "em foco")).toBeVisible({ timeout: LIVE });
  await a.page.waitForTimeout(1000);

  // Sanity: the recorders do see realtime traffic (the start itself reached B).
  expect(
    b.traffic.some((x) => x.kind === "ws-received" && FOCUS_FRAME.test(x.data)),
  ).toBe(true);

  // Measure 12 s of steady focus on both sides.
  const from = Date.now();
  const before = await clock(a.page).textContent();
  await a.page.waitForTimeout(12_000);
  const after = await clock(a.page).textContent();
  const to = Date.now();

  expect(toSeconds(before!) - toSeconds(after!)).toBeGreaterThanOrEqual(10); // the clock did run
  expect(during(a.traffic, from, to, "http")).toEqual([]); // no requests at all, so no writes
  // Only realtime heartbeats may cross the socket (~1 per 25 s), never focus data.
  expect(
    during(a.traffic, from, to, "ws-sent").filter(
      (f) => !f.includes("heartbeat"),
    ),
  ).toEqual([]);
  const received = during(b.traffic, from, to, "ws-received");
  expect(
    received.filter((f) => FOCUS_FRAME.test(f) || ANY_BROADCAST.test(f)),
  ).toEqual([]);
  // A sent no presence above. A joined the channel on each of its two page
  // loads (sign-in to /focus, then LOCK IN's goto), tracking "online" once per
  // join, and Realtime may deliver those joins to B late (replication between
  // nodes). So B may see up to two join-only diffs — never an update stream.
  const presence = received.filter((f) => /presence/.test(f));
  expect(presence.length).toBeLessThanOrEqual(2);
  for (const f of presence) {
    expect(f).toContain('"presence_diff"');
    expect(f).toContain('"leaves":{}');
  }

  await overlay(a.page)
    .getByRole("button", { name: "Encerrar sessão" })
    .click();
  await a.page
    .getByRole("dialog", { name: "Sessão concluída" })
    .getByRole("button", { name: "PRONTO" })
    .click();
  await a.context.close();
  await b.context.close();
});
