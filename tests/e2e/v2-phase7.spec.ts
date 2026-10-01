import AxeBuilder from "@axe-core/playwright";
import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  decideDuel,
  duelHeadline,
  duelScore,
  withRunning,
  type DuelRow,
} from "@/lib/duel";
import { addDays } from "@/lib/local-date";
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
 * V2 Phase 7 — Daily Duel (docs/DUEL.md). Alice (A) and Bruno (B) are a duo
 * "since T-3" (DEV fixture), Carla (C) becomes Alice's next partner. Every
 * number is derived from real tasks / focus; live never says anyone won.
 * Runs after Phase 6 (same shared users).
 */
test.describe.configure({ mode: "serial" });

const D = t.duel;
const LIVE = 15_000;
const SECRET = "Consulta particular";

let A: Api;
let B: Api;
let C: Api;
let T: string;

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

async function resetAll() {
  for (const api of [A, B, C]) {
    await finishFocus(api);
    await resetTasks(api);
    await api.rpc("leave_duo");
  }
}

async function oneOff(api: Api, title: string, visible = true) {
  const { data, error } = await api
    .from("daily_tasks")
    .insert({ title, visible_to_partner: visible })
    .select("id")
    .single();
  if (error) throw new Error(`task: ${error.message}`);
  return data.id;
}

async function complete(api: Api, id: string) {
  const { error } = await api
    .from("daily_tasks")
    .update({ status: "completed" })
    .eq("id", id);
  if (error) throw new Error(`complete: ${error.message}`);
}

/** duo_duels through the public API, mapped like the app (loadDuels). */
async function rowsOf(api: Api): Promise<DuelRow[]> {
  const { data, error } = await api.rpc("duo_duels", { p_days: 8 });
  if (error) throw new Error(`duo_duels: ${error.message}`);
  return data.map((r) => ({
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
  }));
}

/**
 * The live headline / score on screen equal what the rules derive from the
 * database numbers right now (today is always live; never "won").
 */
async function expectToday(page: Page, scope = page.getByTestId("duel-today")) {
  await expect(async () => {
    const row = (await rowsOf(A)).find((r) => r.date === T)!;
    // Bruno's running session ticks on screen: add it like the app does.
    const { data: running } = await B.rpc("my_active_focus");
    const duel = decideDuel({
      ...row,
      isFinal: false,
      partner: withRunning(row.partner, running?.[0] ?? null, Date.now()),
    });
    const text = duelHeadline(duel, "Bruno");
    expect(text).not.toMatch(/VENC/);
    await expect(scope.getByTestId("duel-headline")).toHaveText(text, {
      timeout: 1_000,
    });
  }).toPass({ timeout: LIVE });
  await expect(scope).not.toContainText(/VENC/);
}

const card = (page: Page) => page.getByTestId("duel-today");
const detail = (page: Page) => page.getByTestId("duel-detailed");

test.beforeAll(async () => {
  test.setTimeout(120_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  await resetAll();
  await makeDuo(A, B);
  await fixture(A, "dev_fixture_backdate_duo", { p_days: 3 });
  T = (await A.rpc("my_today")).data as string;
  // T-1: Alice 2 / 2, Bruno 1 / 2 → Alice 2–0 (execution + consistency).
  // T-2: Alice 3 / 4 (75 %: met or not depending on the standard of that day).
  // T-3: only Bruno has a task → nothing comparable.
  await addTasksOn(A, [
    { task_date: addDays(T, -1), title: "Ontem 1", status: "completed" },
    { task_date: addDays(T, -1), title: "Ontem 2", status: "completed" },
    { task_date: addDays(T, -2), title: "Anteontem 1", status: "completed" },
    { task_date: addDays(T, -2), title: "Anteontem 2", status: "completed" },
    { task_date: addDays(T, -2), title: "Anteontem 3", status: "completed" },
    { task_date: addDays(T, -2), title: "Anteontem 4" },
  ]);
  await addTasksOn(B, [
    { task_date: addDays(T, -1), title: "Ontem B1", status: "completed" },
    { task_date: addDays(T, -1), title: "Ontem B2" },
    { task_date: addDays(T, -3), title: "Antes B", status: "completed" },
  ]);
});

test.afterAll(async () => {
  await resetAll();
  await makeDuo(A, B);
});

test("1: Today is live — the partner's proof moves it, my check-off moves it at once, never 'won'", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await oneOff(A, "Ler 20 páginas");
  const bTask = await oneOff(B, "Correr 5 km");
  const a = await open(browser, users.a, "/today");

  await expect(card(a.page)).toBeVisible();
  await expect(card(a.page).getByTestId("duel-phase")).toHaveText(D.live);
  const execution = card(a.page).getByTestId("duel-cat-execution");
  const consistency = card(a.page).getByTestId("duel-cat-consistency");
  // Alice 0 / 1, Bruno 0 / 1: execution and consistency tied (focus is
  // whatever the shared users recorded today — the headline follows the rules).
  await expect(execution).toContainText(D.outcome.tie);
  await expect(consistency).toContainText(D.outcome.tie);
  await expectToday(a.page);

  await complete(B, bTask);
  await expect(execution).toContainText("BRUNO", { timeout: LIVE });
  await expect(consistency).toContainText("BRUNO");
  await expectToday(a.page);

  await a.page
    .getByRole("checkbox", { name: "Ler 20 páginas", exact: true })
    .click();
  // Local: my side moves at once, before any re-read.
  await expect(execution).toContainText(D.outcome.tie, { timeout: 3_000 });
  await expect(consistency).toContainText(D.outcome.tie);
  await expectToday(a.page);
  await expect(card(a.page)).not.toContainText(/VENC/);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2: Partner shows every number and the rules; private tasks count, never their title", async ({
  browser,
}) => {
  const secret = await oneOff(B, SECRET, false);
  await complete(B, secret);
  const a = await open(browser, users.a, "/partner#duel");
  const d = detail(a.page);
  await expect(d).toBeVisible();
  await expect(d.getByTestId("duel-row-execution")).toContainText("1/1 · 100%");
  // Bruno's private completion counts (2 / 2), its title never appears.
  await expect(d.getByTestId("duel-row-execution")).toContainText(
    "2/2 · 100%",
    { timeout: LIVE },
  );
  await expect(d.getByTestId("duel-row-consistency")).toContainText(
    D.standard.met,
  );
  await expect(a.page.locator("body")).not.toContainText(SECRET);

  await d.getByText(D.rulesTitle).click();
  for (const rule of D.rules) await expect(d).toContainText(rule);

  // The API returns integers, booleans and dates only.
  const { data } = await A.rpc("duo_duels", { p_days: 8 });
  expect(Object.keys(data![0]).sort()).toEqual(
    [
      "duel_date",
      "is_final",
      "me_completed",
      "me_focus_running",
      "me_focus_seconds",
      "me_planned",
      "me_standard",
      "partner_completed",
      "partner_focus_running",
      "partner_focus_seconds",
      "partner_planned",
      "partner_standard",
    ].sort(),
  );
  expect(JSON.stringify(data)).not.toContain(SECRET);

  const axe = await new AxeBuilder({ page: a.page })
    .include('[data-testid="duel-detailed"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("3: the partner's running focus ticks locally — no request while it runs", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const a = await open(browser, users.a, "/partner#duel");
  const focusRow = detail(a.page).getByTestId("duel-row-focus");
  await expect(focusRow).toBeVisible();
  // Bruno's focus is the second cell ("25 min 12 s"; earlier runs may have
  // focus today), exact to the second.
  const partnerCell = focusRow.getByRole("cell").nth(1);
  const seconds = async () => {
    const text = (await partnerCell.textContent()) ?? "";
    const m = Number(/(\d+) min/.exec(text)?.[1] ?? 0);
    const s = Number(/(\d+) s/.exec(text)?.[1] ?? 0);
    return m * 60 + s;
  };

  const started = await B.rpc("start_focus_session", {
    p_title: "Bloco",
    p_planned_seconds: 3600,
  });
  expect(started.error).toBeNull();
  await expect(a.page.getByTestId("partner-status")).toContainText(/foco/i, {
    timeout: LIVE,
  });
  // The start produces two events (the `focus` broadcast and the feed line),
  // each answered by one re-read. Wait until that burst has settled: 3 s in
  // a row without any request (under load the second event can be late).
  const requests: string[] = [];
  a.page.on("request", (r) =>
    requests.push(
      `${r.method()} ${r.url()} ${r.headers()["next-action"] ?? ""}`.trim(),
    ),
  );
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
  const before = await seconds();

  // Bruno's seconds advance on screen, from the clock already there.
  await a.page.waitForTimeout(10_000);
  expect(await seconds()).toBeGreaterThanOrEqual(before + 8);
  expect(requests).toEqual([]);
  await expectToday(a.page, detail(a.page));

  // The session ends: the duel re-reads once (event) and keeps the time.
  const running = await seconds();
  await finishFocus(B);
  await a.page.waitForTimeout(3_000);
  expect(await seconds()).toBeGreaterThanOrEqual(running);
  await expectToday(a.page, detail(a.page));
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4: Progress lists the last duels — final results, the same from both sides", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/progress");
  const rows = a.page.getByTestId("duel-history-row");
  await expect(rows).toHaveCount(3);
  // T-1: execution (2/2 vs 1/2) and consistency (met vs not met) are
  // Alice's whatever focus the shared users recorded that day.
  await expect(rows.nth(0)).toContainText(D.youWon);
  // Every row is final and shows exactly what the rules derive from the
  // real numbers (focus of earlier runs included).
  const past = (await rowsOf(A)).filter((r) => r.date < T);
  expect(past.map((r) => r.date)).toEqual(
    [-1, -2, -3].map((n) => addDays(T, n)),
  );
  for (const [i, r] of past.entries()) {
    const duel = decideDuel(r);
    expect(duel.final).toBe(true);
    await expect(rows.nth(i)).toContainText(D.final);
    await expect(rows.nth(i)).toContainText(duelHeadline(duel, "Bruno"));
    await expect(rows.nth(i)).toContainText(duelScore(duel));
  }
  expect(a.errors).toEqual([]);
  await a.context.close();

  const b = await open(browser, users.b, "/progress");
  await expect(b.page.getByTestId("duel-history-row").nth(0)).toContainText(
    D.won("Alice"),
  );
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("4b: changing the Daily Standard never moves a FINAL duel; today uses the new one", async ({
  browser,
}) => {
  const aId = (await A.auth.getUser()).data.user!.id;
  const setStandard = async (v: number) => {
    const { error } = await A.from("profiles")
      .update({ daily_standard_percent: v })
      .eq("id", aId);
    expect(error).toBeNull();
  };
  const { data: profile } = await A.from("profiles")
    .select("daily_standard_percent")
    .eq("id", aId)
    .single();
  const original = profile!.daily_standard_percent;

  // 1. FINAL duels decided with the standard X of their day.
  const before = (await rowsOf(A)).filter((r) => r.date < T);
  const t2 = before.find((r) => r.date === addDays(T, -2))!;
  expect(t2.isFinal).toBe(true);
  const x = t2.me.standard;
  // 3 / 4 = 75 %: choose Y so that the same day would flip if re-read.
  const y = 3 * 100 >= x * 4 ? 90 : 70;
  const a = await open(browser, users.a, "/progress");
  const rows = a.page.getByTestId("duel-history-row");
  await expect(rows).toHaveCount(3);
  const texts = await rows.allTextContents();

  // 2. Alice changes her standard to Y.
  await setStandard(y);

  // 3–4. The historical duels: same numbers, same Consistency, score, winner.
  const after = (await rowsOf(A)).filter((r) => r.date < T);
  expect(after).toEqual(before);
  for (const [i, r] of before.entries()) {
    expect(decideDuel(after[i])).toEqual(decideDuel(r));
  }
  await a.page.reload();
  await expect(rows).toHaveCount(3);
  expect(await rows.allTextContents()).toEqual(texts);

  // 5. Today (open) uses Y.
  const today = (await rowsOf(A)).find((r) => r.date === T)!;
  expect(today.me.standard).toBe(y);
  expect(a.errors).toEqual([]);
  await a.context.close();
  await setStandard(original);
});

test("5: the day is final only once it closes for both members", async () => {
  // (API only: after closing, the app's "today" is ahead of the device clock,
  // which the day-change reload would follow; Test 4 covers the UI.)
  const todayRow = async () =>
    (await A.rpc("duo_duels", { p_days: 8 })).data!.find(
      (r) => r.duel_date === T,
    )!;
  await fixture(A, "dev_fixture_close_today");
  expect((await todayRow()).is_final).toBe(false); // Bruno's day is open
  await fixture(B, "dev_fixture_close_today");
  const r = await todayRow();
  expect(r.is_final).toBe(true);
  // Today: execution tie (1/1 vs 2/2), consistency tie; focus decides (Bruno
  // focused in Test 3, so he has at least 1 minute) — final wording now.
  const duel = decideDuel((await rowsOf(A)).find((x) => x.date === T)!);
  expect(duel.final).toBe(true);
  expect([D.youWon, D.won("Bruno"), D.tie]).toContain(
    duelHeadline(duel, "Bruno"),
  );
  // A closed day cannot be rewritten to change the result.
  const late = await A.from("daily_tasks").insert({
    task_date: T,
    title: "Tarde demais",
    status: "completed",
  });
  expect(late.error?.message).toContain("LI_HISTORY_LOCKED");
  // Reopen the real day for the rest of the run.
  await resetTasks(A);
  await resetTasks(B);
});

test("6: duo lifecycle — ending the duo removes every duel; a new partner starts from zero", async ({
  browser,
}) => {
  await B.rpc("leave_duo");
  expect((await A.rpc("duo_duels", { p_days: 8 })).data).toEqual([]);
  const a = await open(browser, users.a, "/today");
  await expect(card(a.page)).toHaveCount(0);
  await a.page.goto("/progress");
  await expect(a.page.getByTestId("duel-history")).toHaveCount(0);

  await makeDuo(A, C);
  // (A day with a task, so Progress is past its "no data yet" state.)
  await oneOff(A, "Primeiro dia com a Carla");
  await a.page.goto("/progress");
  await expect(a.page.getByTestId("duel-history")).toContainText(D.noHistory);
  await expect(a.page.getByTestId("duel-history-row")).toHaveCount(0);
  const { data } = await C.rpc("duo_duels", { p_days: 8 });
  expect(data!.map((r) => r.duel_date)).toEqual([T]);
  expect(a.errors).toEqual([]);
  await a.context.close();
});
