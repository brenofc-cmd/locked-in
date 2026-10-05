import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { addDays } from "@/lib/local-date";
import {
  apiAs,
  finishFocus,
  makeDuo,
  resetTasks,
  signInUI,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * V2 Phase 2 — Partner Presence 2.0 / last seen and the school planner, with
 * real browsers and real sockets on the DEV project. Alice (A) and Bruno (B)
 * are a duo, Carla (C) the outsider and later A's new partner. Runs after
 * the Phase 1 projects (same shared users).
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let T: string;
let aId: string;
const LIVE = 15_000;

/** "/" → the restored route loads the whole app layout (remote DEV). */
const RESTORE = 15_000;

type Opened = { context: BrowserContext; page: Page; errors: string[] };
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function launch(browser: Browser, storageState?: State): Promise<Opened> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
    storageState,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

async function open(browser: Browser, user: TestUser, path: string) {
  const app = await launch(browser);
  await signInUI(app.page, user, path);
  return app;
}

/** Wait for the duo channel: the browser reads partner_today after SUBSCRIBED. */
async function connected(page: Page, path: string) {
  const joined = page.waitForResponse((r) =>
    r.url().includes("/rest/v1/rpc/partner_today"),
  );
  await page.goto(path);
  await joined;
  await page.waitForTimeout(2000);
}

const sheet = (page: Page) =>
  page.getByRole("dialog", { name: t.sheetLabels.planner });
const upcoming = (page: Page) => page.getByRole("main");

async function createEvent(
  page: Page,
  e: {
    title: string;
    subject?: string;
    type?: keyof typeof t.planner.types;
    date: string;
    time?: string;
    shared?: boolean;
  },
) {
  await page
    .getByRole("button", { name: t.planner.addAria, exact: true })
    .click();
  const s = sheet(page);
  await s
    .getByRole("radio", { name: t.planner.types[e.type ?? "exam"] })
    .click();
  await s.getByRole("textbox", { name: t.planner.fields.title }).fill(e.title);
  if (e.subject)
    await s
      .getByRole("textbox", { name: t.planner.fields.subject })
      .fill(e.subject);
  await s.getByLabel(t.planner.fields.date).fill(e.date);
  if (e.time) await s.getByLabel(t.planner.fields.time).fill(e.time);
  const share = s.getByRole("switch", { name: t.planner.fields.share });
  if ((await share.getAttribute("aria-checked")) !== String(!!e.shared))
    await share.click();
  await s.getByRole("button", { name: t.planner.save }).click();
  await expect(s).toHaveCount(0);
}

async function eventsOf(api: Api, owner: string) {
  const { data } = await api
    .from("planner_events")
    .select("id, title, shared_with_partner")
    .eq("owner_id", owner);
  return data ?? [];
}

async function clearPlanner(api: Api) {
  const { data } = await api.auth.getUser();
  await api.from("planner_events").delete().eq("owner_id", data.user!.id);
}

test.beforeAll(async () => {
  test.setTimeout(120_000); // resets several DEV users
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  aId = (await A.auth.getUser()).data.user!.id;
  for (const api of [A, B, C]) {
    await resetTasks(api);
    await clearPlanner(api);
    await api.rpc("leave_duo");
  }
  await makeDuo(A, B);
  T = (await A.rpc("my_today")).data!;
});

test.afterAll(async () => {
  for (const api of [A, B, C]) {
    await finishFocus(api);
    await clearPlanner(api);
  }
});

// ================================================ PARTNER PRESENCE 2.0 ===

test("presence: ONLINE → last seen when A leaves → ONLINE again → EM FOCO wins", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const b = await open(browser, users.b, "/partner");
  const status = b.page.getByTestId("partner-status");

  let a = await open(browser, users.a, "/today");
  await connected(a.page, "/today");
  await expect(status).toHaveText(t.partnerStatus.onlineWord, {
    timeout: LIVE,
  });

  // A closes the app: presence drops, B shows when A was last seen.
  await a.context.close();
  await expect(status).toHaveText(/^Visto por último (agora|há \d+ min)$/, {
    timeout: 60_000,
  });
  // Today (phone): the header chip says OFFLINE with the last seen.
  await b.page
    .getByRole("link", { name: /LOCKED IN/ })
    .first()
    .click();
  await expect(
    b.page.getByRole("link", { name: /^Alice: offline,.*Visto/ }),
  ).toBeVisible();

  // A comes back: ONLINE (never from last seen, from presence).
  a = await open(browser, users.a, "/today");
  await connected(a.page, "/today");
  await expect(
    b.page.getByRole("link", { name: /^Alice: online,/ }),
  ).toBeVisible({ timeout: LIVE });
  await expect(
    b.page.getByRole("link", { name: /^Alice: .*Visto/ }),
  ).toHaveCount(0);

  // A starts a focus session: EM FOCO beats ONLINE and last seen.
  await finishFocus(A);
  const started = await A.rpc("start_focus_session", {
    p_title: "Física",
    p_planned_seconds: 1500,
  });
  expect(started.error).toBeNull();
  await expect(
    b.page.getByRole("link", { name: /^Alice: em foco,/ }),
  ).toBeVisible({ timeout: LIVE });
  await a.context.close();
  await b.page.waitForTimeout(3000);
  await expect(
    b.page.getByRole("link", { name: /^Alice: em foco,/ }),
  ).toBeVisible();
  await expect(
    b.page.getByRole("link", { name: /^Alice: .*Visto/ }),
  ).toHaveCount(0);
  await finishFocus(A);
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("presence: last seen privacy through the public API", async () => {
  await A.rpc("touch_last_seen");
  // Partner reads, outsider does not, nobody writes someone else's.
  expect(
    (await B.from("user_presence").select("user_id").eq("user_id", aId)).data,
  ).toHaveLength(1);
  expect(
    (await C.from("user_presence").select("user_id").eq("user_id", aId)).data,
  ).toHaveLength(0);
  const before = (
    await A.from("user_presence")
      .select("last_seen_at")
      .eq("user_id", aId)
      .single()
  ).data!.last_seen_at;
  await B.from("user_presence")
    .update({ last_seen_at: "2020-01-01T00:00:00Z" })
    .eq("user_id", aId);
  const after = (
    await A.from("user_presence")
      .select("last_seen_at")
      .eq("user_id", aId)
      .single()
  ).data!.last_seen_at;
  expect(after).toBe(before);
  const spoof = await B.from("user_presence").insert({ user_id: aId });
  expect(spoof.error).not.toBeNull();
});

test("heartbeat: once on open, ~5 min while visible, never while hidden, again on return", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const app = await launch(browser);
  await app.context.addInitScript(() => {
    const w = window as unknown as { __vis: DocumentVisibilityState };
    w.__vis = "visible";
    Object.defineProperty(document, "visibilityState", {
      get: () => w.__vis,
    });
  });
  const beats: number[] = [];
  app.page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/touch_last_seen"))
      beats.push(Date.now());
  });
  await app.page.clock.install();
  await signInUI(app.page, users.c, "/today");
  await expect.poll(() => beats.length).toBeGreaterThanOrEqual(1);
  const onOpen = beats.length;
  // No spam: nothing more while the clock stands still for a while.
  await app.page.waitForTimeout(4000);
  expect(beats.length).toBe(onOpen);

  // Visible for 5 minutes: one more.
  await app.page.clock.fastForward("05:01");
  await expect.poll(() => beats.length).toBe(onOpen + 1);

  // Hidden: 20 minutes, nothing.
  const setVisibility = (v: DocumentVisibilityState) =>
    app.page.evaluate((vis) => {
      (window as unknown as { __vis: DocumentVisibilityState }).__vis = vis;
      document.dispatchEvent(new Event("visibilitychange"));
    }, v);
  await setVisibility("hidden");
  for (let i = 0; i < 4; i++) await app.page.clock.fastForward("05:01");
  await app.page.waitForTimeout(1500);
  expect(beats.length).toBe(onOpen + 1);

  // Visible again: at once.
  await setVisibility("visible");
  await expect.poll(() => beats.length).toBe(onOpen + 2);
  await app.context.close();
});

// =========================================================== PLANNER ===

test("1 + 9: A creates Prova / Física; it survives a refresh and shows on Today", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/planner");
  await createEvent(a.page, {
    title: "Prova de Física",
    subject: "Física",
    date: addDays(T, 3),
  });
  await a.page.reload();
  const row = upcoming(a.page).getByRole("button", { name: /Prova de Física/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("PROVA · FÍSICA");
  await expect(row).toContainText("EM 3 DIAS");
  expect((await eventsOf(A, aId)).map((e) => e.title)).toEqual([
    "Prova de Física",
  ]);

  // Today shows only the next event, one line (docs/NAVIGATION.md).
  await a.page.goto("/today");
  const card = a.page.getByRole("region", { name: t.todayScreen.next });
  await expect(card).toContainText("PROVA · FÍSICA");
  await expect(card).toContainText("EM 3 DIAS");
  await expect(card.getByRole("button")).toHaveCount(1);
  // PLANEJAR → PRÓXIMO shows it too and opens the planner.
  await a.page.goto("/plan");
  await expect(a.page.getByTestId("plan-next")).toContainText("PROVA · FÍSICA");
  await a.page.getByTestId("plan-next").click();
  await expect(a.page).toHaveURL(/\/planner$/);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2–5: shared events reach B live (create, edit, delete); private ones never", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const b = await open(browser, users.b, "/planner");
  await connected(b.page, "/planner");
  const a = await open(browser, users.a, "/planner");

  // 2 · shared → live on B.
  await createEvent(a.page, {
    title: "Trabalho de História",
    subject: "História",
    type: "assignment",
    date: addDays(T, 2),
    time: "14:00",
    shared: true,
  });
  const bRow = upcoming(b.page).getByRole("button", {
    name: /Trabalho de História/,
  });
  await expect(bRow).toBeVisible({ timeout: LIVE });
  await expect(bRow).toContainText("ALICE");

  // 3 · private → never on B (live or after a reload).
  await createEvent(a.page, {
    title: "Lição secreta",
    type: "homework",
    date: addDays(T, 1),
  });
  await b.page.waitForTimeout(3000);
  await b.page.reload();
  await expect(bRow).toBeVisible();
  await expect(b.page.getByText("Lição secreta")).toHaveCount(0);
  expect(
    (
      await B.from("planner_events").select("title").eq("owner_id", aId)
    ).data!.map((r) => r.title),
  ).toEqual(["Trabalho de História"]);

  // 4 · A edits → B updates live.
  await upcoming(a.page)
    .getByRole("button", { name: /Trabalho de História/ })
    .click();
  await sheet(a.page)
    .getByRole("textbox", { name: t.planner.fields.title })
    .fill("Trabalho de História (grupo)");
  await sheet(a.page).getByRole("button", { name: t.planner.save }).click();
  await expect(
    upcoming(b.page).getByRole("button", {
      name: /Trabalho de História \(grupo\)/,
    }),
  ).toBeVisible({ timeout: LIVE });

  // B sees it read-only (no save, no delete).
  await upcoming(b.page).getByRole("button", { name: /grupo/ }).click();
  const bSheet = b.page.getByRole("dialog", {
    name: t.sheetLabels.plannerView,
  });
  await expect(bSheet).toContainText(t.planner.eventOf("Alice"));
  await expect(
    bSheet.getByRole("button", { name: t.planner.save }),
  ).toHaveCount(0);
  await expect(
    bSheet.getByRole("button", { name: t.planner.delete }),
  ).toHaveCount(0);
  await b.page.keyboard.press("Escape");

  // 5 · A deletes → gone on B live.
  await upcoming(a.page).getByRole("button", { name: /grupo/ }).click();
  await sheet(a.page).getByRole("button", { name: t.planner.delete }).click();
  await sheet(a.page)
    .getByRole("button", { name: t.planner.confirmDeleteYes })
    .click();
  await expect(
    upcoming(b.page).getByRole("button", { name: /grupo/ }),
  ).toHaveCount(0, { timeout: LIVE });

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("6 + 7: partner and outsider cannot change or read what is not theirs (API)", async () => {
  const { data: shared } = await A.from("planner_events")
    .insert({
      title: "Entrega de Artes",
      event_type: "deadline",
      event_date: addDays(T, 4),
      shared_with_partner: true,
    })
    .select()
    .single();
  const id = shared!.id;

  // B (partner): reads, cannot write.
  expect(
    (await B.from("planner_events").select("id").eq("id", id)).data,
  ).toHaveLength(1);
  const upd = await B.from("planner_events")
    .update({ title: "hacked" })
    .eq("id", id)
    .select();
  expect(upd.data ?? []).toHaveLength(0);
  const del = await B.from("planner_events").delete().eq("id", id).select();
  expect(del.data ?? []).toHaveLength(0);
  const spoof = await B.from("planner_events").insert({
    owner_id: aId,
    title: "x",
    event_type: "exam",
    event_date: T,
  });
  expect(spoof.error?.code).toBe("42501");
  expect(
    (await A.from("planner_events").select("title").eq("id", id).single()).data!
      .title,
  ).toBe("Entrega de Artes");

  // C (outsider): nothing.
  expect(
    (await C.from("planner_events").select("id").eq("owner_id", aId)).data,
  ).toHaveLength(0);
  const cUpd = await C.from("planner_events")
    .update({ title: "x" })
    .eq("id", id)
    .select();
  expect(cUpd.data ?? []).toHaveLength(0);
  // Without a partner, sharing is refused by the database.
  const noDuo = await C.from("planner_events").insert({
    title: "x",
    event_type: "exam",
    event_date: T,
    shared_with_partner: true,
  });
  expect(noDuo.error?.message).toContain("LI_PLANNER_NO_PARTNER");
  await A.from("planner_events").delete().eq("id", id);
});

test("8: ADICIONAR ÀS TAREFAS pre-fills Quick Add; only the confirmation creates the task", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/planner");
  await upcoming(a.page)
    .getByRole("button", { name: /Prova de Física/ })
    .click();
  await sheet(a.page)
    .getByRole("button", { name: t.planner.addToTasks })
    .click();
  const add = a.page.getByRole("dialog", { name: t.sheetLabels.add });
  const name = add.getByPlaceholder(t.taskSheet.namePlaceholder);
  await expect(name).toHaveValue("Estudar para Prova de Física");
  const count = async () =>
    (
      await A.from("daily_tasks")
        .select("id")
        .eq("title", "Estudar para Prova de Física")
    ).data?.length ?? 0;
  expect(await count()).toBe(0);
  await add.getByRole("button", { name: t.taskSheet.add }).click();
  await expect.poll(count).toBe(1);
  // Independent: the event is untouched.
  expect((await eventsOf(A, aId)).map((e) => e.title)).toContain(
    "Prova de Física",
  );
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("10 + 11: calendar view and month restore; a new-event draft comes back", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  let a = await open(browser, users.a, "/planner");
  await a.page.getByRole("radio", { name: t.planner.views.calendar }).click();
  const month = a.page.getByTestId("planner-month");
  const current = await month.innerText();
  await a.page.getByRole("button", { name: t.planner.nextMonth }).click();
  await expect(month).not.toHaveText(current);
  const next = await month.innerText();
  // The day with the exam says how many events it has.
  await a.page.getByRole("button", { name: t.planner.prevMonth }).click();
  const [, m, d] = addDays(T, 3).split("-").map(Number);
  if (addDays(T, 3).slice(0, 7) === T.slice(0, 7))
    await expect(
      a.page.getByRole("button", {
        name: `${d} de ${t.dates.monthsLong[m - 1].toLowerCase()}, 1 evento`,
      }),
    ).toBeVisible();
  await a.page.getByRole("button", { name: t.planner.nextMonth }).click();

  // Draft of a new event.
  await a.page
    .getByRole("button", { name: t.planner.addAria, exact: true })
    .click();
  await sheet(a.page)
    .getByRole("textbox", { name: t.planner.fields.title })
    .fill("Prova de Química (rascunho)");
  await a.page.waitForTimeout(300);

  const state = await a.context.storageState();
  await a.context.close();
  a = await launch(browser, state);
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/planner$/, { timeout: RESTORE });
  await expect(
    a.page.getByRole("radio", { name: t.planner.views.calendar }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(a.page.getByTestId("planner-month")).toHaveText(next);
  await expect(sheet(a.page)).toHaveCount(0);
  await a.page
    .getByRole("button", { name: t.planner.addAria, exact: true })
    .click();
  await expect(
    sheet(a.page).getByRole("textbox", { name: t.planner.fields.title }),
  ).toHaveValue("Prova de Química (rascunho)");
  const raw = await a.page.evaluate(() =>
    Object.values(localStorage).join("\n"),
  );
  expect(raw).not.toContain("Prova de Física"); // no event data stored
  await a.page.keyboard.press("Escape");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("12: old duo → new duo: nothing leaks (planner and last seen)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { data } = await A.from("planner_events")
    .insert({
      title: "Evento da dupla antiga",
      event_type: "school_event",
      event_date: addDays(T, 5),
      shared_with_partner: true,
    })
    .select()
    .single();
  expect(
    (await B.from("planner_events").select("id").eq("id", data!.id)).data,
  ).toHaveLength(1);

  // A ends the duo with B and forms one with C.
  await A.rpc("leave_duo");
  await makeDuo(A, C);
  const row = (
    await A.from("planner_events")
      .select("shared_with_partner, duo_id")
      .eq("id", data!.id)
      .single()
  ).data!;
  expect(row).toEqual({ shared_with_partner: false, duo_id: null });
  expect(
    (await B.from("planner_events").select("id").eq("owner_id", aId)).data,
  ).toHaveLength(0);
  expect(
    (await C.from("planner_events").select("id").eq("owner_id", aId)).data,
  ).toHaveLength(0);
  expect(
    (await B.from("user_presence").select("user_id").eq("user_id", aId)).data,
  ).toHaveLength(0);
  expect(
    (await C.from("user_presence").select("user_id").eq("user_id", aId)).data,
  ).toHaveLength(1);

  const c = await open(browser, users.c, "/planner");
  await expect(c.page.getByText("Evento da dupla antiga")).toHaveCount(0);
  await expect(c.page.getByText("Prova de Física")).toHaveCount(0);
  expect(c.errors).toEqual([]);
  await c.context.close();
  await A.rpc("leave_duo");
});

test("13: reminders are in-app, once per device, and follow the Lembretes preference", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { data: me } = await A.auth.getUser();
  const setPref = (on: boolean) =>
    A.from("user_settings")
      .update({ notify_task_reminders: on })
      .eq("user_id", me.user!.id);
  await setPref(true);
  await A.from("planner_events").insert({
    title: "Prova de Biologia",
    event_type: "exam",
    subject: "Biologia",
    event_date: addDays(T, 1),
    reminder_days_before: 1,
  });
  // (Partner events never remind: unit-tested in dueReminders.)
  const a = await launch(browser);
  // Midday on the database's today, so the 08:00 threshold has passed.
  await a.page.clock.install({ time: new Date(`${T}T15:00:00Z`) });
  await signInUI(a.page, users.a, "/today");
  const toast = a.page
    .getByRole("status")
    .filter({ hasText: "PROVA · BIOLOGIA · Prova de Biologia · AMANHÃ" });
  await expect(toast).toBeVisible({ timeout: LIVE });
  // Once per device: not again after a reload.
  await a.page.reload();
  await a.page.waitForTimeout(2500);
  await expect(toast).toHaveCount(0);

  // Preference off: nothing.
  await setPref(false);
  await A.from("planner_events").insert({
    title: "Prova de Arte",
    event_type: "exam",
    event_date: addDays(T, 1),
    reminder_days_before: 1,
  });
  await a.page.reload();
  await a.page.waitForTimeout(2500);
  await expect(a.page.getByText(/Prova de Arte · AMANHÃ/)).toHaveCount(0);
  await setPref(true);
  expect(a.errors).toEqual([]);
  await a.context.close();
});
