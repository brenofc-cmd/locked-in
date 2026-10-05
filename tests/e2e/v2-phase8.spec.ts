import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { DuelRow } from "@/lib/duel";
import { addDays, dateLabel } from "@/lib/local-date";
import {
  buildMonths,
  monthHeadline,
  monthName,
  monthTitle,
  type Month,
} from "@/lib/monthly";
import { hoursLabel, weekRangeLabel } from "@/lib/records";
import {
  addTasksOn,
  apiAs,
  finishFocus,
  fixture,
  makeDuo,
  resetTasks,
  signInUI,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * V2 Phase 8 — Monthly Champion + Personal Records + Milestones
 * (docs/MONTHLY_COMPETITION.md). Alice (A) and Bruno (B) are a duo since the
 * first day of the previous month (DEV fixture); past days are written with
 * DEV fixtures (closed days cannot be written through the API). Every
 * expectation is also derived from duo_duel_months with the app's own rules
 * (buildMonths → decideDuel). Carla (C) holds the records, then becomes
 * Alice's next partner. Runs after the IA suite (same shared users).
 */
test.describe.configure({ mode: "serial" });

const M = t.monthly;
const R = t.records;
const SECRET = "Exame confidencial";

let A: Api;
let B: Api;
let C: Api;
let T: string;
/** First day of the previous month, of the current month. */
let P: string;
let CUR: string;

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  user: TestUser,
  path: string,
): Promise<Opened> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInUI(page, user, path);
  return { context, page, errors };
}

const monthStart = (date: string, back = 0) => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86400000,
  );

async function resetAll() {
  for (const api of [A, B, C]) {
    await finishFocus(api);
    await resetTasks(api);
    await fixture(api, "dev_fixture_reset_focus");
    await api.rpc("leave_duo");
  }
}

/** A and B: a duo whose first duel day is the first day of last month. */
async function duoSinceLastMonth() {
  await resetAll();
  await makeDuo(A, B);
  await fixture(A, "dev_fixture_backdate_duo", { p_days: daysBetween(P, T) });
}

/** Tasks on a closed day: `done` completed, `open` pending. */
async function day(
  api: Api,
  date: string,
  done: number,
  open = 0,
  visible = true,
  title = "Tarefa",
) {
  await addTasksOn(api, [
    ...Array.from({ length: done }, (_, i) => ({
      task_date: date,
      title: `${title} ${i + 1}`,
      status: "completed",
      visible_to_partner: visible,
    })),
    ...Array.from({ length: open }, (_, i) => ({
      task_date: date,
      title: `${title} aberta ${i + 1}`,
      visible_to_partner: visible,
    })),
  ]);
}
// The day shapes of the Daily Duel (decided by the existing rules):
const aWins = async (d: string) => {
  await day(A, d, 2);
  await day(B, d, 1, 1);
};
const bWins = async (d: string) => {
  await day(A, d, 1, 1);
  await day(B, d, 2);
};
const draw = async (d: string, aDone = 2, bDone = 2) => {
  await day(A, d, aDone);
  await day(B, d, bDone);
};
const focus = (api: Api, date: string, seconds: number) =>
  fixture(api, "dev_fixture_add_focus", {
    p_rows: [{ local_date: date, seconds }],
  });

/** duo_duel_months through the public API, mapped like the app. */
async function monthsOf(api: Api): Promise<Month[]> {
  const { data, error } = await api.rpc("duo_duel_months", { p_months: 6 });
  if (error) throw new Error(`duo_duel_months: ${error.message}`);
  return buildMonths(
    data.map((r): DuelRow => ({
      date: r.duel_date,
      isFinal: r.is_final,
      me: {
        planned: r.me_planned,
        completed: r.me_completed,
        standard: r.me_standard,
        focusSeconds: r.me_focus_seconds,
        focusRunning: r.me_focus_running,
      },
      partner: {
        planned: r.partner_planned,
        completed: r.partner_completed,
        standard: r.partner_standard,
        focusSeconds: r.partner_focus_seconds,
        focusRunning: r.partner_focus_running,
      },
    })),
  );
}

const summary = (page: Page) => page.getByTestId("month-summary");
/** The current month only (previous months live in a collapsed panel). */
const liveBlock = (page: Page) => page.getByTestId("month-current");
const currentPhase = (page: Page) =>
  summary(page).getByRole("heading").getByTestId("month-phase");
/** The previous month (closed) inside MESES ANTERIORES, opened. */
async function previousMonth(page: Page) {
  const toggle = page.getByTestId("month-previous-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  return page.locator(`[data-testid="month-previous"][data-month="${P}"]`);
}
async function openDetails(page: Page) {
  const toggle = page.getByTestId("month-details-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  T = (await A.rpc("my_today")).data as string;
  P = monthStart(T, 1);
  CUR = monthStart(T);
});

// ------------------------------------------------------------- monthly ----

test("1 + 6: the open month is live — A ahead on daily wins, never a champion", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  // Closed days of this month (the 1st … yesterday): A, A, B, then nothing.
  const closed = Array.from({ length: daysBetween(CUR, T) }, (_, i) =>
    addDays(CUR, i),
  );
  const plan = [aWins, aWins, bWins];
  for (const [i, d] of closed.slice(0, 3).entries()) await plan[i](d);

  const [current] = await monthsOf(A);
  expect(current.month).toBe(CUR);
  expect(current.final).toBe(false);
  const enough = closed.length >= 3;
  expect(current.leader).toBe(enough ? "me" : null);

  const a = await open(browser, users.a, "/progress");
  await expect(summary(a.page).getByTestId("month-title")).toHaveText(
    monthTitle(CUR),
  );
  await expect(currentPhase(a.page)).toHaveText(M.live);
  await expect(liveBlock(a.page).getByTestId("month-headline")).toHaveText(
    monthHeadline(current, "Bruno"),
  );
  if (enough) {
    await expect(liveBlock(a.page).getByTestId("month-headline")).toHaveText(
      M.youAhead,
    );
    await expect(liveBlock(a.page).getByTestId("month-score")).toHaveText(
      "2 — 1",
    );
    await expect(liveBlock(a.page)).toHaveAttribute(
      "aria-label",
      `${monthTitle(CUR)}, ${M.live}: Alice lidera Bruno por 2 vitórias a 1.`,
    );
  }
  await expect(liveBlock(a.page)).not.toContainText(/CAMPEÃO/);
  await expect(liveBlock(a.page).getByTestId("month-champion")).toHaveCount(0);

  // Bruno sees the same month from his side: Alice ahead, no champion.
  const b = await open(browser, users.b, "/progress");
  await expect(liveBlock(b.page).getByTestId("month-headline")).toHaveText(
    enough ? M.ahead("Alice") : M.liveInsufficient,
  );
  await expect(liveBlock(b.page)).not.toContainText(/CAMPEÃO/);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("2: tied daily wins — monthly execution decides, and says so", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await aWins(P);
  await bWins(addDays(P, 1));
  // A draw where A planned more: 3/3 vs 2/2 — execution of the month is
  // A 6/7 vs B 5/6 (36 > 35 by cross-multiplication).
  await draw(addDays(P, 2), 3, 2);

  const prev = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(prev).toMatchObject({
    final: true,
    leader: "me",
    decidedBy: "execution",
    draws: 1,
  });
  expect(prev.me).toMatchObject({ wins: 1, completed: 6, planned: 7 });
  expect(prev.partner).toMatchObject({ wins: 1, completed: 5, planned: 6 });

  const a = await open(browser, users.a, "/progress");
  const month = await previousMonth(a.page);
  await expect(month.getByTestId("month-headline")).toHaveText(
    M.champion(monthName(P)),
  );
  await expect(month.getByTestId("month-champion")).toHaveText(M.you);
  await expect(month.getByTestId("month-score")).toHaveText("1 — 1");
  await expect(month.getByTestId("month-tiebreak")).toHaveText(
    M.tiebreak.execution,
  );
  await expect(month.getByTestId("month-execution")).toContainText("86%");
  await expect(month.getByTestId("month-execution")).toContainText("6/7");
  await expect(month.getByTestId("month-execution")).toContainText("5/6");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("3: wins and execution tied — effective focus decides", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await aWins(P);
  await bWins(addDays(P, 1));
  await draw(addDays(P, 2));
  // Focus on the days already decided by two categories (they stay won):
  // B 3 000 s on A's day, A 2 000 s on B's day → B leads the month on focus.
  await focus(B, P, 3000);
  await focus(A, addDays(P, 1), 2000);

  const prev = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(prev).toMatchObject({ leader: "partner", decidedBy: "focus" });
  expect(prev.me.wins).toBe(1);
  expect(prev.partner.wins).toBe(1);
  expect(prev.me.focusSeconds).toBe(2000);
  expect(prev.partner.focusSeconds).toBe(3000);

  const a = await open(browser, users.a, "/progress");
  const month = await previousMonth(a.page);
  await expect(month.getByTestId("month-champion")).toHaveText("BRUNO");
  await expect(month.getByTestId("month-tiebreak")).toHaveText(
    M.tiebreak.focus,
  );
  await expect(month.getByTestId("month-focus")).toContainText("33m");
  await expect(month.getByTestId("month-focus")).toContainText("50m");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4: wins, execution and focus all tied — EMPATE DO MÊS", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await aWins(P);
  await bWins(addDays(P, 1));
  await draw(addDays(P, 2));

  const prev = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(prev).toMatchObject({ leader: "draw", decidedBy: "draw" });

  const a = await open(browser, users.a, "/progress");
  const month = await previousMonth(a.page);
  await expect(month.getByTestId("month-headline")).toHaveText(M.finalDraw);
  await expect(month.getByTestId("month-champion")).toHaveCount(0);
  await expect(month.getByTestId("month-tiebreak")).toHaveText(M.tiebreak.none);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("5: fewer than 3 official duels — SEM RESULTADO SUFICIENTE NO MÊS, numbers still shown", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await aWins(P);
  await aWins(addDays(P, 1));
  // Only one side has tasks: no category → not an official day.
  await day(A, addDays(P, 2), 3);

  const prev = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(prev).toMatchObject({
    state: "insufficient",
    leader: null,
    officialDays: 2,
  });
  expect(prev.me.wins).toBe(2);

  const a = await open(browser, users.a, "/progress");
  const month = await previousMonth(a.page);
  await expect(month.getByTestId("month-headline")).toHaveText(
    M.finalInsufficient,
  );
  await expect(month.getByTestId("month-score")).toHaveText("2 — 0");
  await expect(month).toContainText(M.minimum(2));
  await expect(month.getByTestId("month-champion")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("7: a closed month names its champion and never moves (Daily Standard changes)", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await duoSinceLastMonth();
  await aWins(P);
  await aWins(addDays(P, 1));
  await aWins(addDays(P, 2));
  await bWins(addDays(P, 3));
  // A private task of Alice on a closed day (counts, never shown).
  await day(A, addDays(P, 4), 1, 0, false, SECRET);
  await day(B, addDays(P, 4), 1);

  const before = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(before).toMatchObject({ final: true, leader: "me" });

  const a = await open(browser, users.a, "/progress");
  let month = await previousMonth(a.page);
  await expect(month.getByTestId("month-headline")).toHaveText(
    M.champion(monthName(P)),
  );
  await expect(month.getByTestId("month-champion")).toHaveText(M.you);
  await expect(month.getByTestId("month-score")).toHaveText(
    `${before.me.wins} — ${before.partner.wins}`,
  );
  await expect(month.getByTestId("month-phase")).toHaveText(M.final);
  const b = await open(browser, users.b, "/progress");
  await expect(
    (await previousMonth(b.page)).getByTestId("month-champion"),
  ).toHaveText("ALICE");

  // Both change their Daily Standard: the closed month keeps its champion.
  for (const api of [A, B]) {
    const { data: me } = await api.auth.getUser();
    const { error } = await api
      .from("profiles")
      .update({ daily_standard_percent: 100 })
      .eq("id", me.user!.id);
    expect(error).toBeNull();
  }
  const after = (await monthsOf(A)).find((m) => m.month === P)!;
  expect(after).toEqual(before);
  await a.page.reload();
  month = await previousMonth(a.page);
  await expect(month.getByTestId("month-champion")).toHaveText(M.you);
  for (const api of [A, B]) {
    const { data: me } = await api.auth.getUser();
    await api
      .from("profiles")
      .update({ daily_standard_percent: 80 })
      .eq("id", me.user!.id);
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("13: DUPLA shows one compact month row; Progress holds the details", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  const closed = Array.from({ length: daysBetween(CUR, T) }, (_, i) =>
    addDays(CUR, i),
  );
  for (const d of closed.slice(0, 2)) await bWins(d);
  const [current] = await monthsOf(B);

  const b = await open(browser, users.b, "/partner");
  const row = b.page.getByTestId("month-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText(
    M.duoRow(current.me.wins, current.partner.wins, "Alice"),
  );
  await expect(row).toContainText(M.live);
  // No details on DUPLA: no summary, no previous months, no rules.
  await expect(b.page.getByTestId("month-summary")).toHaveCount(0);
  await expect(b.page.getByTestId("month-previous-toggle")).toHaveCount(0);
  await row.click();
  await expect(b.page).toHaveURL(/\/progress#month$/);
  await expect(summary(b.page)).toBeVisible();
  await openDetails(b.page);
  await expect(
    b.page.getByTestId("month-current-details").getByTestId("month-wins"),
  ).toContainText(String(current.me.wins));
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("14: the partner never learns a private task through the month", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await day(A, P, 2, 0, false, SECRET);
  await day(B, P, 1, 1);
  const ids = (
    await A.from("daily_tasks")
      .select("id")
      .eq("task_date", P)
      .eq("owner_id", (await A.auth.getUser()).data.user!.id)
  ).data!.map((r) => r.id);
  expect(ids.length).toBe(2);

  const { data, error } = await B.rpc("duo_duel_months", { p_months: 6 });
  expect(error).toBeNull();
  const json = JSON.stringify(data);
  expect(json).not.toContain(SECRET);
  for (const id of ids) expect(json).not.toContain(id);
  expect(json).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  );
  // The private tasks still count in the aggregate (2 of 2 that day).
  const row = data!.find((r) => r.duel_date === P)!;
  expect(row).toMatchObject({ partner_planned: 2, partner_completed: 2 });

  const b = await open(browser, users.b, "/progress");
  await previousMonth(b.page);
  await openDetails(b.page);
  await expect(b.page.locator("main")).not.toContainText(SECRET);
  expect(b.errors).toEqual([]);
  await b.context.close();
});

// ------------------------------------------------------------- records ----

test("8 + 9 + 10: Carla's records — focus day, focus week, Perfect Days in a month", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await resetAll();
  // Best day: 4h 32min four weeks ago. Best closed week: 3 × 10 000 s two
  // weeks ago (another week). Perfect Days: 7 in a row last month.
  const bestDay = addDays(T, -28);
  const week = addDays(T, -14);
  const monday = addDays(
    week,
    -((new Date(`${week}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  await fixture(C, "dev_fixture_add_focus", {
    p_rows: [
      { local_date: bestDay, seconds: 4 * 3600 + 32 * 60 },
      { local_date: monday, seconds: 10000 },
      { local_date: addDays(monday, 1), seconds: 10000 },
      { local_date: addDays(monday, 2), seconds: 10000, pause_seconds: 900 },
    ],
  });
  for (let i = 0; i < 7; i++)
    await addTasksOn(C, [
      { task_date: addDays(P, i), title: `Perfeito ${i}`, status: "completed" },
    ]);

  const c = await open(browser, users.c, "/progress");
  const records = c.page.getByTestId("records");
  await expect(records.getByTestId("record-focus-day")).toContainText(
    "4h 32min",
  );
  await expect(records.getByTestId("record-focus-day")).toContainText(
    `${dateLabel(bestDay)} ${bestDay.slice(0, 4)}`,
  );
  await expect(records.getByTestId("record-focus-week")).toContainText(
    hoursLabel(30000),
  );
  await expect(records.getByTestId("record-focus-week")).toContainText(
    weekRangeLabel(monday),
  );
  await expect(records.getByTestId("record-perfect-month")).toContainText("7");
  await expect(records.getByTestId("record-perfect-month")).toContainText(
    monthTitle(P),
  );
  await expect(records.getByTestId("record-streak")).toContainText(R.days(7));
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("11 + 12: milestones — next ones with progress, reached ones CONQUISTADO", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Same data as the records test: longest streak 7, 12 h of focus, 7
  // Perfect Days.
  const c = await open(browser, users.c, "/progress");
  const ms = c.page.getByTestId("milestones");
  const next = ms.getByTestId("milestones-next");
  await expect(next.getByTestId("milestone")).toHaveCount(3);
  const streak30 = next.locator('[data-key="streak-30"]');
  await expect(streak30).toContainText("7 / 30");
  await expect(streak30).toHaveAttribute(
    "aria-label",
    `${R.milestone.streak(30)}: 7 de 30 dias`,
  );
  await expect(streak30.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    `${R.milestone.streak(30)}: 7 de 30 dias`,
  );
  await expect(next.locator('[data-key="focus-50"]')).toContainText(
    "12h / 50h",
  );
  await expect(next.locator('[data-key="perfect-10"]')).toContainText("7 / 10");
  await expect(ms.getByTestId("milestones-count")).toHaveText(
    R.reachedCount(3, 9),
  );

  const toggle = ms.getByTestId("milestones-all-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  const all = ms.getByTestId("milestones-all");
  for (const key of ["streak-7", "focus-10", "perfect-5"]) {
    const m = all.locator(`[data-key="${key}"]`);
    await expect(m).toHaveAttribute("data-reached", "true");
    await expect(m).toContainText(R.reached);
  }
  for (const key of ["streak-100", "focus-100", "perfect-30"])
    await expect(all.locator(`[data-key="${key}"]`)).toHaveAttribute(
      "data-reached",
      "false",
    );
  // Personal: Bruno (no records) sees none of Carla's numbers.
  const { data } = await B.rpc("my_records");
  expect(data![0].total_focus_seconds).toBe(0);
  expect(c.errors).toEqual([]);
  await c.context.close();
});

// ----------------------------------------------------- no polling ----

test("16: 72 s of running focus across a minute boundary — no periodic request from DUPLA / Progress", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await duoSinceLastMonth();
  await aWins(P);
  await aWins(addDays(P, 1));
  await bWins(addDays(P, 2));
  const a = await open(browser, users.a, "/partner");
  const b = await open(browser, users.b, "/progress");
  await expect(a.page.getByTestId("month-row")).toBeVisible();
  await expect(summary(b.page)).toBeVisible();

  // Bruno focuses (his own page shows the overlay); Alice watches DUPLA.
  const started = await B.rpc("start_focus_session", {
    p_title: "Bloco",
    p_planned_seconds: 3600,
  });
  expect(started.error).toBeNull();
  await expect(a.page.getByTestId("partner-status")).toContainText(/foco/i, {
    timeout: 15_000,
  });
  const requests: string[] = [];
  for (const p of [a.page, b.page])
    p.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
  // Let the start's event burst settle: 3 s in a row without any request.
  let quietFrom = Date.now();
  let seen = requests.length;
  await expect
    .poll(
      () => {
        if (requests.length !== seen) {
          seen = requests.length;
          quietFrom = Date.now();
        }
        return Date.now() - quietFrom;
      },
      { timeout: 30_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(3_000);
  requests.length = 0;
  const from = new Date();
  await a.page.waitForTimeout(72_000);
  const to = new Date();
  expect(to.getUTCMinutes() !== from.getUTCMinutes()).toBe(true);
  expect(requests).toEqual([]);
  // Still showing the month (nothing re-rendered away).
  await expect(a.page.getByTestId("month-row")).toBeVisible();
  await finishFocus(B);
  expect(a.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

// ------------------------------------------------------- lifecycle ----

test("15: a new duo never sees the old duo's months", async ({ browser }) => {
  test.setTimeout(120_000);
  await duoSinceLastMonth();
  await aWins(P);
  await aWins(addDays(P, 1));
  await aWins(addDays(P, 2));
  expect((await monthsOf(A)).map((m) => m.month)).toEqual([CUR, P]);

  await B.rpc("leave_duo");
  expect((await A.rpc("duo_duel_months", { p_months: 6 })).data).toEqual([]);
  await makeDuo(A, C);
  // A new duo starts today: only today, nothing of last month.
  const { data } = await C.rpc("duo_duel_months", { p_months: 6 });
  expect(data!.map((r) => r.duel_date)).toEqual([T]);
  const a = await open(browser, users.a, "/progress");
  await expect(summary(a.page).getByTestId("month-title")).toHaveText(
    monthTitle(CUR),
  );
  const toggle = a.page.getByTestId("month-previous-toggle");
  await toggle.click();
  await expect(summary(a.page)).toContainText(M.noPrevious);
  await expect(a.page.getByTestId("month-previous")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
  await resetAll();
});
