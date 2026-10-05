import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { addDays } from "@/lib/local-date";
import { lastDayOfMonth, monthName } from "@/lib/monthly";
import { weekStartOf } from "@/lib/progress";
import {
  addTasksOn,
  apiAs,
  finishFocus,
  fixture,
  makeDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * V2 Phase 9 — Celebrations + Smart Reviews + Non-Negotiables + Weekly
 * Planning (docs/CELEBRATIONS.md, docs/WEEKLY_PLANNING.md). Alice (A),
 * Bruno (B) and Carla (C), shared DEV test users; past days come from the
 * DEV fixtures; every run starts from no celebration, priority, reflection
 * or flag (dev_fixture_reset_celebrations / _reflection, documented resets).
 * Runs after the Phase 8 suite.
 */
test.describe.configure({ mode: "serial" });

const C9 = t.celebrations;
const W = t.weeklyPlan;
const RV = t.reviews;
const NN = t.nonNegotiable;

let A: Api;
let B: Api;
let C: Api;
let T: string;

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  user: TestUser,
  path: string,
  options: {
    reducedMotion?: "reduce" | "no-preference";
    /** Runs on the new page before sign-in (listeners that must see everything). */
    onPage?: (page: Page) => void;
  } = {},
): Promise<Opened> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
    reducedMotion: options.reducedMotion ?? "no-preference",
  });
  const page = await context.newPage();
  options.onPage?.(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInUI(page, user, path);
  return { context, page, errors };
}

async function reset(api: Api) {
  await finishFocus(api);
  await resetTasks(api);
  await fixture(api, "dev_fixture_reset_focus");
  await fixture(api, "dev_fixture_reset_reflection");
  await fixture(api, "dev_fixture_reset_celebrations");
  await api.rpc("leave_duo");
}

async function resetAll() {
  for (const api of [A, B, C]) await reset(api);
}

async function uid(api: Api) {
  return (await api.auth.getUser()).data.user!.id;
}

/** A one-off task today, through the public API. */
async function addToday(api: Api, title: string, visible = true) {
  const { data, error } = await api
    .from("daily_tasks")
    .insert({ title, visible_to_partner: visible })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** `n` closed days before today, each with `done` of `done + open` completed. */
async function closedDays(api: Api, n: number, done = 1, open = 0) {
  const rows = [];
  for (let d = 1; d <= n; d++)
    for (let i = 0; i < done + open; i++)
      rows.push({
        task_date: addDays(T, -d),
        title: `Dia ${d} · ${i + 1}`,
        status: i < done ? "completed" : "pending",
      });
  await addTasksOn(api, rows);
}

const row = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true });
const celebration = (page: Page) => page.getByTestId("celebration");
/**
 * A celebration closes by itself after ~2 s unless it is pointed at or
 * focused (how a reader keeps it): focus its OK button to read it.
 */
const hold = (page: Page) =>
  celebration(page).getByRole("button", { name: C9.close }).focus();

/** No celebration appears for `ms` (claims are sent ~1.5 s after a change). */
async function noCelebration(page: Page, ms = 5_000) {
  await page.waitForTimeout(ms);
  await expect(celebration(page)).toHaveCount(0);
}

async function celebrationsOf(api: Api) {
  const { data, error } = await api
    .from("celebrations")
    .select("kind, key, baseline, seen_at");
  if (error) throw new Error(error.message);
  return data;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  T = (await A.rpc("my_today")).data as string;
  await resetAll();
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  await resetAll();
});

// --------------------------------------------------------- celebrations ----

test("1: Perfect Day — celebrated once, seen on every device, never again that day", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(A);
  await addToday(A, "Única tarefa");
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  await noCelebration(a.page, 3_000);
  await row(a.page, "Única tarefa").click();
  await writes.idle();
  const card = celebration(a.page);
  await expect(card).toBeVisible({ timeout: 15_000 });
  // Motion allowed: a short fade (motion-safe only; see test 5).
  expect(
    await card.evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe("none");
  await hold(a.page);
  await expect(card).toHaveAttribute("data-kind", "perfect_day");
  await expect(card.getByTestId("celebration-title")).toHaveText(C9.perfectDay);
  await expect(card).toContainText(C9.perfectDayLine(1));
  // Non-modal: Today stays usable behind it.
  await expect(a.page.getByRole("dialog")).toHaveCount(0);
  await card.getByRole("button", { name: C9.close }).click();
  await expect(card).toHaveCount(0);
  await writes.idle();
  await expect
    .poll(async () => (await celebrationsOf(A)).map((r) => r.seen_at !== null))
    .toEqual([true]);

  // Undo and redo: still one receipt for the date, nothing shown again.
  await row(a.page, "Única tarefa").click();
  await writes.idle();
  await row(a.page, "Única tarefa").click();
  await writes.idle();
  await noCelebration(a.page);
  // Another device: already seen.
  const other = await open(browser, users.a, "/today");
  await noCelebration(other.page);
  expect(await celebrationsOf(A)).toHaveLength(1);
  expect(a.errors).toEqual([]);
  expect(other.errors).toEqual([]);
  await a.context.close();
  await other.context.close();
});

test("2: a milestone crossed today — the queue shows one at a time, Perfect Day first", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await reset(A);
  // 6 closed Perfect Days: perfect_5 is reached already (shown on open),
  // streak_7 needs today.
  await closedDays(A, 6);
  await addToday(A, "Hoje");
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  const card = celebration(a.page);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await hold(a.page);
  await expect(card).toHaveAttribute("data-key", "perfect_5");
  await expect(card.getByTestId("celebration-title")).toHaveText(
    t.records.milestone.perfect(5),
  );
  await expect(card).toContainText(C9.milestoneLine);
  await expect(celebration(a.page)).toHaveCount(1);
  await card.getByRole("button", { name: C9.close }).click();
  await writes.idle();

  await row(a.page, "Hoje").click();
  await writes.idle();
  await expect(card).toHaveAttribute("data-kind", "perfect_day", {
    timeout: 15_000,
  });
  await hold(a.page);
  await expect(celebration(a.page)).toHaveCount(1);
  await card.getByRole("button", { name: C9.close }).click();
  await expect(card).toHaveAttribute("data-key", "streak_7");
  await hold(a.page);
  await expect(card.getByTestId("celebration-title")).toHaveText(
    t.records.milestone.streak(7),
  );
  await card.getByRole("button", { name: C9.close }).click();
  await expect(card).toHaveCount(0);
  await writes.idle();
  const rows = await celebrationsOf(A);
  expect(rows.map((r) => r.key).sort()).toEqual(
    [T, "perfect_5", "streak_7"].sort(),
  );
  expect(rows.every((r) => r.seen_at && !r.baseline)).toBe(true);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("3: an unlock is durable — CONQUISTADO stays after the numbers drop, nothing replays", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Continues from test 2: streak_7 and perfect_5 unlocked. Clear the history
  // (the numbers drop to zero); the unlocks remain.
  await resetTasks(A);
  // One open task today: Progress has data (an empty one shows no section),
  // while the longest streak and the Perfect Days are back to zero.
  await addToday(A, "Recomeço");
  const a = await open(browser, users.a, "/progress");
  const all = a.page.getByTestId("milestones");
  const toggle = all.getByTestId("milestones-all-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  for (const key of ["streak-7", "perfect-5"])
    await expect(
      all.getByTestId("milestones-all").locator(`[data-key="${key}"]`),
    ).toHaveAttribute("data-reached", "true");
  await expect(all.getByTestId("milestones-count")).toHaveText(
    t.records.reachedCount(2, 9),
  );
  await noCelebration(a.page);
  // The database refuses a forged unlock / a rewrite.
  const forged = await A.from("celebrations").insert({
    kind: "milestone",
    key: "streak_30",
  });
  expect(forged.error?.message).toContain("LI_MILESTONE_NOT_REACHED");
  const rewrite = await A.from("celebrations").delete().eq("key", "streak_7");
  expect(rewrite.error).not.toBeNull();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4: baseline — milestones reached before Phase 9 are CONQUISTADO, never celebrated", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(C);
  await closedDays(C, 6);
  expect(await fixture(C, "dev_fixture_baseline_milestones")).toBe(1);
  const c = await open(browser, users.c, "/today");
  await noCelebration(c.page, 6_000);
  const rows = await celebrationsOf(C);
  expect(rows).toEqual([
    expect.objectContaining({ key: "perfect_5", baseline: true }),
  ]);
  expect(rows[0].seen_at).not.toBeNull();
  await c.page.goto("/progress");
  await expect(
    c.page.getByTestId("milestones").getByTestId("milestones-count"),
  ).toHaveText(t.records.reachedCount(1, 9));
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("5: prefers-reduced-motion — the celebration appears without movement", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(A);
  await addToday(A, "Sem movimento");
  const a = await open(browser, users.a, "/today", { reducedMotion: "reduce" });
  const writes = trackWrites(a.page);
  await row(a.page, "Sem movimento").click();
  await writes.idle();
  const card = celebration(a.page);
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  // Short: it closes by itself (≈2 s) and counts as seen.
  const shownAt = Date.now();
  await expect(card).toHaveCount(0, { timeout: 6_000 });
  expect(Date.now() - shownAt).toBeLessThan(4_000);
  await writes.idle();
  await expect
    .poll(async () => (await celebrationsOf(A)).map((r) => r.seen_at !== null))
    .toEqual([true]);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

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

/** A and B a duo since the first day of last month, with day shapes. */
async function lastMonthDuo(shape: "aWins" | "draw") {
  await resetAll();
  const P = monthStart(T, 1);
  await makeDuo(A, B);
  await fixture(A, "dev_fixture_backdate_duo", { p_days: daysBetween(P, T) });
  for (let i = 0; i < 3; i++) {
    const d = addDays(P, i);
    const done = (n: number, open: number) =>
      Array.from({ length: n + open }, (_, k) => ({
        task_date: d,
        title: `Duelo ${k}`,
        status: k < n ? "completed" : "pending",
      }));
    await addTasksOn(A, done(2, 0));
    await addTasksOn(B, shape === "aWins" ? done(1, 1) : done(2, 0));
  }
  return P;
}

test("6: MONTHLY CHAMPION — only for a FINAL month, only for the champion, once", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const P = monthStart(T, 1);
  test.skip(
    addDays(lastDayOfMonth(P), 7) < T,
    "the last month ended more than 7 days ago (window documented in docs/CELEBRATIONS.md)",
  );
  await lastMonthDuo("aWins");
  const a = await open(browser, users.a, "/today");
  const card = celebration(a.page);
  await expect(card).toHaveAttribute("data-kind", "monthly", {
    timeout: 15_000,
  });
  await hold(a.page);
  await expect(card.getByTestId("celebration-title")).toHaveText(
    t.monthly.champion(monthName(P)),
  );
  await expect(card).toContainText(`${monthName(P)} · 3 — 0`);
  await card.getByRole("button", { name: C9.close }).click();
  // Bruno lost the month: nothing.
  const b = await open(browser, users.b, "/today");
  await noCelebration(b.page);
  // Never for the live month.
  const live = await A.from("celebrations").insert({
    kind: "monthly",
    key: monthStart(T),
  });
  expect(live.error?.message).toContain("LI_MONTH_OPEN");
  // Once: a reload shows nothing.
  await a.page.reload();
  await noCelebration(a.page);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("7: a drawn final month — MÊS ENCERRADO · EMPATE for both", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const P = monthStart(T, 1);
  test.skip(
    addDays(lastDayOfMonth(P), 7) < T,
    "the last month ended more than 7 days ago",
  );
  await lastMonthDuo("draw");
  for (const user of [users.a, users.b]) {
    const x = await open(browser, user, "/today");
    const card = celebration(x.page);
    await expect(card).toHaveAttribute("data-kind", "monthly", {
      timeout: 15_000,
    });
    await hold(x.page);
    await expect(card.getByTestId("celebration-title")).toHaveText(
      C9.monthDraw,
    );
    expect(x.errors).toEqual([]);
    await x.context.close();
  }
  await resetAll();
});

// ------------------------------------------------------ non-negotiables ----

test("8: a one-off task marked NÃO NEGOCIÁVEL — discreet on Today, never for the partner", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await resetAll();
  await makeDuo(A, B);
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  await a.page
    .getByRole("button", { name: t.todayScreen.addTaskAria })
    .first()
    .click();
  const add = a.page.getByRole("dialog", { name: t.sheetLabels.add });
  await add.getByRole("textbox", { name: t.taskSheet.nameAria }).fill("Treino");
  await add.getByRole("button", { name: t.taskSheet.moreOptions }).click();
  const sw = add.getByTestId("non-negotiable-switch");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await add.getByRole("button", { name: t.taskSheet.add, exact: true }).click();
  await expect(row(a.page, "Treino")).toBeVisible();
  await writes.idle();
  await a.page.reload();
  const label = a.page.getByTestId("task-non-negotiable");
  await expect(label).toHaveText(NN.label);
  await expect(row(a.page, "Treino")).toHaveAccessibleDescription(NN.label);

  // The partner reads the task (shared) but never the flag.
  const b = await open(browser, users.b, "/partner");
  await expect(
    b.page.getByRole("region", { name: "Alice hoje" }).getByText("Treino"),
  ).toBeAttached({ timeout: 15_000 });
  await expect(b.page.getByText(NN.label)).toHaveCount(0);
  expect(
    (await B.from("daily_task_non_negotiables").select("daily_task_id")).data,
  ).toEqual([]);

  // Unmark: the label leaves.
  await a.page
    .getByRole("button", { name: t.taskRow.optionsFor("Treino") })
    .click();
  await a.page
    .getByRole("dialog", { name: "Opções da tarefa" })
    .getByRole("button", { name: "Editar" })
    .click();
  const edit = a.page.getByRole("dialog", { name: t.sheetLabels.edit });
  await edit.getByRole("button", { name: t.taskSheet.moreOptions }).click();
  await edit.getByTestId("non-negotiable-switch").click();
  await edit.getByRole("button", { name: t.taskSheet.save }).click();
  await expect(label).toHaveCount(0);
  await writes.idle();
  await a.page.reload();
  await expect(a.page.getByTestId("task-non-negotiable")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("9: a routine marked NÃO NEGOCIÁVEL — today's occurrence follows; history keeps its own", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(A);
  const { data: routineId, error } = await A.rpc("create_routine_item", {
    p_title: "Leitura",
    p_days: [1, 2, 3, 4, 5, 6, 7],
  });
  if (error) throw new Error(error.message);
  const a = await open(browser, users.a, "/routine");
  const writes = trackWrites(a.page);
  await a.page.getByRole("button", { name: /^Leitura/ }).click();
  const edit = a.page.getByRole("dialog", { name: t.sheetLabels.editRoutine });
  await edit.getByRole("button", { name: t.taskSheet.moreOptions }).click();
  await edit.getByTestId("non-negotiable-switch").click();
  await edit.getByRole("button", { name: t.taskSheet.save }).click();
  await writes.idle();
  expect(
    (await A.from("routine_non_negotiables").select("routine_item_id")).data,
  ).toEqual([{ routine_item_id: routineId }]);
  await a.page.goto("/today");
  await expect(a.page.getByTestId("task-non-negotiable").first()).toHaveText(
    NN.label,
  );
  // A closed day's occurrence cannot be flagged or unflagged through the API.
  const [past] = await addTasksOn(A, [
    { task_date: addDays(T, -1), title: "Ontem" },
  ]);
  const flagPast = await A.from("daily_task_non_negotiables").insert({
    daily_task_id: past,
  });
  expect(flagPast.error?.message).toContain("LI_HISTORY_LOCKED");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

// ------------------------------------------------------ weekly planning ----

test("10: PLANEJAR → SEMANA — up to 3 priorities, saved at once, persisted", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(A);
  const a = await open(browser, users.a, "/plan");
  const writes = trackWrites(a.page);
  const planRow = a.page.getByTestId("plan-week");
  await expect(planRow).toContainText(W.none);
  await planRow.click();
  await expect(a.page).toHaveURL(/\/plan\/week$/);
  await expect(
    a.page.getByRole("radio", { name: new RegExp(W.current) }),
  ).toHaveAttribute("aria-checked", "true");
  const input = a.page.getByRole("textbox", { name: W.add });
  for (const title of ["Entregar o projeto", "Simulado", "Correr 15 km"]) {
    await input.fill(title);
    await a.page.getByRole("button", { name: W.save }).click();
    await expect(a.page.getByText(title)).toBeVisible();
    await writes.idle();
  }
  await expect(a.page.getByTestId("week-full")).toHaveText(W.full);
  await expect(input).toHaveCount(0);
  await a.page.getByRole("checkbox", { name: "Simulado" }).click();
  await expect(
    a.page.getByRole("checkbox", { name: "Simulado" }),
  ).toHaveAttribute("aria-checked", "true");
  await writes.idle();
  await a.page.reload();
  await expect(a.page.getByTestId("week-priority")).toHaveCount(3);
  await expect(
    a.page.locator('[data-testid="week-priority"][data-status="done"]'),
  ).toHaveCount(1);
  await a.page.goto("/plan");
  await expect(a.page.getByTestId("plan-week")).toContainText(
    W.doneRatio("1 / 3"),
  );
  // Nothing on Today.
  await a.page.goto("/today");
  await expect(a.page.getByText("Entregar o projeto")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("11: weekly planning — validation, edit, remove, next week, database rules", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // signInUI matches the path as a pattern: the query comes after.
  const a = await open(browser, users.a, "/plan/week");
  await a.page.goto("/plan/week?w=next");
  const writes = trackWrites(a.page);
  await expect(
    a.page.getByRole("radio", { name: new RegExp(W.next) }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(a.page.getByText(W.empty)).toBeVisible();
  const input = a.page.getByRole("textbox", { name: W.add });
  await input.fill("   ");
  // SALVAR is aria-disabled while blank; Enter still submits and explains.
  await expect(a.page.getByRole("button", { name: W.save })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await input.press("Enter");
  // (Next's route announcer is an alert too.)
  await expect(
    a.page.getByRole("alert").filter({ hasText: W.errors.empty }),
  ).toBeVisible();
  await input.fill("Revisar redação");
  await a.page.getByRole("button", { name: W.save }).click();
  await expect(a.page.getByText("Revisar redação")).toBeVisible();
  await writes.idle();
  await a.page.getByRole("button", { name: W.edit }).click();
  await a.page
    .getByRole("textbox", { name: W.edit })
    .fill("Revisar 2 redações");
  await a.page
    .getByRole("listitem")
    .getByRole("button", { name: W.save })
    .click();
  await expect(a.page.getByText("Revisar 2 redações")).toBeVisible();
  await writes.idle();
  await a.page.reload();
  await expect(a.page.getByText("Revisar 2 redações")).toBeVisible();
  await a.page
    .getByRole("button", { name: `${W.remove}: Revisar 2 redações` })
    .click();
  await expect(a.page.getByText("Revisar 2 redações")).toHaveCount(0);
  await writes.idle();
  // The database: never two weeks ahead, never a closed week.
  const monday = weekStartOf(T);
  const far = await A.from("weekly_priorities").insert({
    week_start: addDays(monday, 14),
    position: 1,
    title: "Longe",
  });
  expect(far.error?.message).toContain("LI_WEEK_TOO_FAR");
  const past = await A.from("weekly_priorities").insert({
    week_start: addDays(monday, -7),
    position: 1,
    title: "Atrasada",
  });
  expect(past.error?.message).toContain("LI_HISTORY_LOCKED");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

// -------------------------------------------------------------- reviews ----

test("12: Day Review — non-negotiables fact and an optional reflection that persists", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await reset(A);
  const done = await addToday(A, "Inegociável feito");
  await addToday(A, "Inegociável aberto");
  const open2 = (
    await A.from("daily_tasks").select("id").eq("title", "Inegociável aberto")
  ).data![0].id;
  for (const id of [done, open2])
    await A.from("daily_task_non_negotiables").insert({ daily_task_id: id });
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", done);
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  await a.page.getByRole("button", { name: t.todayScreen.reviewToday }).click();
  const review = a.page.getByRole("dialog", {
    name: t.moments.reviewTodayAria,
  });
  await expect(review.getByTestId("fact-nn")).toContainText("1 / 2");
  const form = review.getByTestId("reflection-day");
  await expect(form.getByTestId("reflection-save")).toHaveText(RV.save);
  await form.getByTestId("reflection-worked").fill("Treinei cedo");
  await form.getByTestId("reflection-changeNext").fill("Dormir antes");
  await form.getByTestId("reflection-save").click();
  await expect(form.getByTestId("reflection-save")).toHaveText(RV.saved);
  await writes.idle();
  await a.page.reload();
  await a.page.getByRole("button", { name: t.todayScreen.reviewToday }).click();
  await expect(
    a.page
      .getByRole("dialog", { name: t.moments.reviewTodayAria })
      .getByTestId("reflection-worked"),
  ).toHaveValue("Treinei cedo");
  // Never for a day that has not started.
  const future = await A.from("reviews").insert({
    kind: "day",
    period_start: addDays(T, 1),
  });
  expect(future.error?.message).toContain("LI_FUTURE_TASK");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("13: a past day in PROGRESSO → HISTÓRICO shows its reflection, read-only", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const y = addDays(T, -1);
  await addTasksOn(A, [
    { task_date: y, title: "Ontem feito", status: "completed" },
  ]);
  const { error } = await A.from("reviews").insert({
    kind: "day",
    period_start: y,
    hindered: "Celular na mesa",
  });
  if (error) throw new Error(error.message);
  test.skip(
    y.slice(0, 7) !== T.slice(0, 7),
    "yesterday is in last month's calendar",
  );
  const a = await open(browser, users.a, "/progress");
  await a.page
    .getByRole("button", { name: new RegExp(` ${Number(y.slice(8))}: `) })
    .first()
    .click();
  const view = a.page.getByTestId("reflection-view-day");
  await expect(view).toContainText("Celular na mesa");
  await expect(view).toContainText(RV.hindered);
  await expect(view.getByRole("textbox")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("14: Weekly Review — facts, priorities, reflection and PLANEJAR PRÓXIMA SEMANA", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await resetAll();
  await makeDuo(A, B);
  const monday = weekStartOf(T);
  // This week: one flagged task done today, a second flagged one open.
  const x = await addToday(A, "Semana NN 1");
  const y = await addToday(A, "Semana NN 2");
  for (const id of [x, y])
    await A.from("daily_task_non_negotiables").insert({ daily_task_id: id });
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", x);
  await addToday(B, "Bruno hoje");
  for (const p of [
    { week_start: monday, position: 1, title: "P1", status: "done" },
    { week_start: monday, position: 2, title: "P2", status: "open" },
  ]) {
    const { error } = await A.from("weekly_priorities").insert(p);
    if (error) throw new Error(error.message);
  }
  const a = await open(browser, users.a, "/partner");
  const writes = trackWrites(a.page);
  await a.page
    .getByRole("button", { name: t.partnerScreen.reviewWeek })
    .click();
  const review = a.page.getByRole("dialog", { name: /Revisão da semana/ });
  await expect(review.getByTestId("fact-nn")).toContainText("1 / 2", {
    timeout: 15_000,
  });
  await expect(review.getByTestId("fact-priorities")).toContainText("1 / 2");
  await expect(review.getByTestId("fact-standard")).toContainText(/\d+ \/ 1/);
  const form = review.getByTestId("reflection-week");
  await form.getByTestId("reflection-worked").fill("Manhãs sem celular");
  await form.getByTestId("reflection-save").click();
  await expect(form.getByTestId("reflection-save")).toHaveText(RV.saved);
  await writes.idle();
  expect(
    (await A.from("reviews").select("kind, period_start, worked")).data,
  ).toEqual([
    { kind: "week", period_start: monday, worked: "Manhãs sem celular" },
  ]);
  await review.getByTestId("plan-next-week").click();
  await expect(a.page).toHaveURL(/\/plan\/week\?w=next$/);
  await expect(
    a.page.getByRole("radio", { name: new RegExp(W.next) }),
  ).toHaveAttribute("aria-checked", "true");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

// -------------------------------------------------------------- privacy ----

test("15: privacy — the partner reads none of it, and the shell gains no tab", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Continues from 14: A has priorities, a review, flags and a duo with B.
  const aId = await uid(A);
  for (const table of [
    "weekly_priorities",
    "reviews",
    "celebrations",
    "daily_task_non_negotiables",
    "routine_non_negotiables",
  ] as const) {
    const { data, error } = await B.from(table).select("owner_id");
    expect(error).toBeNull();
    expect((data ?? []).filter((r) => r.owner_id === aId)).toEqual([]);
  }
  const facts = await B.rpc("my_review_facts", {
    p_from: weekStartOf(T),
    p_to: T,
  });
  expect(facts.data![0].non_negotiable_planned).toBe(0);
  const b = await open(browser, users.b, "/partner");
  await expect(b.page.getByText("Manhãs sem celular")).toHaveCount(0);
  await expect(b.page.getByText("P1", { exact: true })).toHaveCount(0);
  await expect(b.page.getByText(NN.label)).toHaveCount(0);
  // Still five tabs; the week lives under PLANEJAR.
  const tabs = b.page.getByRole("navigation", { name: t.shell.tabsNav });
  await expect(tabs.getByRole("link")).toHaveCount(5);
  await b.page.goto("/plan/week");
  await expect(
    tabs.getByRole("link", { name: t.pageTitles.plan }),
  ).toHaveAttribute("aria-current", "page");
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("16: no new channel — one realtime socket per load, none added by Phase 9 screens", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await makeDuo(A, B);
  // Listen before sign-in: a socket of the first load that opens late would
  // otherwise be counted with the next document's.
  const sockets: number[] = [];
  const a = await open(browser, users.a, "/today", {
    onPage: (page) =>
      page.on("websocket", (ws) => {
        if (ws.url().includes("/realtime/")) sockets.push(Date.now());
      }),
  });
  await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(1);
  // One full load, then client navigations through every Phase 9 surface.
  const reloadAt = Date.now();
  await a.page.reload();
  await expect
    .poll(() => sockets.filter((at) => at >= reloadAt).length, {
      timeout: 15_000,
    })
    .toBe(1);
  await a.page.getByRole("link", { name: t.pageTitles.plan }).last().click();
  await a.page.getByTestId("plan-week").click();
  await expect(a.page).toHaveURL(/\/plan\/week$/);
  await a.page
    .getByRole("link", { name: t.pageTitles.progress })
    .last()
    .click();
  await expect(a.page).toHaveURL(/\/progress$/);
  await a.page.waitForTimeout(3_000);
  // The duo's one private channel on one socket; nothing added.
  expect(sockets.filter((at) => at >= reloadAt)).toHaveLength(1);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

// ----------------------------------------------------------- no polling ----

test("17: 70 s idle on PLANEJAR → SEMANA and PROGRESSO with a pending claim — no periodic request", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await reset(A);
  await reset(B);
  // A pending, unseen milestone would be the obvious polling trap.
  await closedDays(A, 6);
  const a = await open(browser, users.a, "/plan/week");
  const b = await open(browser, users.a, "/progress");
  await expect(celebration(a.page)).toBeVisible({ timeout: 15_000 });
  // It closes by itself; then nothing may fetch on a timer.
  await expect(celebration(a.page)).toHaveCount(0, { timeout: 6_000 });
  const requests: string[] = [];
  for (const p of [a.page, b.page])
    p.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
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
  await a.page.waitForTimeout(70_000);
  const to = new Date();
  expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(70_000);
  expect(requests).toEqual([]);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});
