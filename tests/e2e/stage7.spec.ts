import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays } from "@/lib/local-date";
import { isoWeekNumber, monthLabel, weekStartOf } from "@/lib/progress";
import type { Database } from "@/types/database";
import {
  addTasksOn,
  apiAs,
  makeDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * Stage 7: real progress, streak, standard and the weekly competition on the
 * DEV project. Alice (A) and Bruno (B) are a duo formed during the run, Carla
 * (C) is alone. Past days are prepared with the DEV-only fixture (clients
 * cannot write closed days since Stage 9); every number on screen comes
 * from the database functions.
 * Competition updates are asserted WITHOUT reloading the watching page.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let T: string;
const LIVE = 15_000;

async function uid(api: Api) {
  return (await api.auth.getUser()).data.user!.id;
}

/** One-off tasks on a date: `done` completed, `skipped`, `pending`. */
async function seedDay(
  api: Api,
  date: string,
  done: number,
  pending: number,
  opts: { skipped?: number; prefix?: string; visible?: boolean } = {},
) {
  const rows = [];
  const statuses = [
    ...Array<string>(done).fill("completed"),
    ...Array<string>(opts.skipped ?? 0).fill("skipped"),
    ...Array<string>(pending).fill("pending"),
  ];
  for (const [i, status] of statuses.entries())
    rows.push({
      task_date: date,
      title: `${opts.prefix ?? "Task"} ${i + 1}`,
      status,
      visible_to_partner: opts.visible ?? true,
    });
  await addTasksOn(api, rows);
}

async function oneOff(api: Api, title: string, visible = true) {
  const { error } = await api.from("daily_tasks").insert({
    owner_id: await uid(api),
    task_date: T,
    title,
    visible_to_partner: visible,
  });
  if (error) throw new Error(`seed failed: ${error.message}`);
}

async function setStandard(api: Api, value: number) {
  const { error } = await api
    .from("profiles")
    .update({ daily_standard_percent: value })
    .eq("id", await uid(api));
  if (error) throw new Error(error.message);
}

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await Promise.all([
    setStandard(A, 80),
    setStandard(B, 80),
    setStandard(C, 80),
  ]);
  await C.rpc("leave_duo");
  T = (await A.rpc("my_today")).data!;
});

test.afterAll(async () => {
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await Promise.all([
    setStandard(A, 80),
    setStandard(B, 80),
    setStandard(C, 80),
  ]);
  await Promise.all([A, B, C].map((x) => x.rpc("leave_duo")));
});

async function open(browser: Browser, user: TestUser, path: string) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await signInUI(page, user, path);
  return { context, page, errors };
}

const row = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true });

/** Bottom tab (client-side navigation: the page is never reloaded). */
const tab = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Abas" }).getByRole("link", { name });

const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${monthLabel(d)}`;
const calendarName = (d: string) =>
  `${monthLabel(d).charAt(0)}${monthLabel(d).slice(1, 3).toLowerCase()} ${Number(d.slice(8, 10))}`;

test("streak, standard, skipped, perfect days, chart and calendar from real history", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Carla, standard 80 %:
  //   T-5 0 / 1 missed · T-4 nothing (neutral) · T-3 1 / 1 · T-2 4 / 5 (exactly 80 %)
  //   T-1 1 / 1 · today: Alpha + Beta, open.  Streak before today = 3.
  await seedDay(C, addDays(T, -5), 0, 1);
  await seedDay(C, addDays(T, -3), 1, 0);
  await seedDay(C, addDays(T, -2), 4, 1);
  await seedDay(C, addDays(T, -1), 1, 0);
  await oneOff(C, "Alpha");
  await oneOff(C, "Beta");

  const c = await open(browser, users.c, "/today");
  const page = c.page;
  const writes = trackWrites(page);
  const streak = page.getByTestId("today-streak");
  await expect(streak).toHaveText("3");

  // Today at 50 %: below the standard, but an open day never breaks the streak.
  await row(page, "Alpha").click();
  await expect(page.getByTestId("today-count")).toHaveText("1 / 2 feitas");
  await expect(streak).toHaveText("3");

  // Skipped stays in the total: 1 done + 1 skipped is still 50 %, not 100 %.
  await page.getByRole("button", { name: "Opções de Beta" }).click();
  await page
    .getByRole("dialog", { name: "Opções da tarefa" })
    .getByRole("button", { name: "Descanso" })
    .click();
  await expect(page.getByText("PULADA · DESCANSO")).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("1 / 2 feitas");
  await expect(streak).toHaveText("3");

  // Unskip and complete: today meets the standard and counts, live.
  await page.getByRole("button", { name: "Opções de Beta" }).click();
  await page
    .getByRole("dialog", { name: "Opções da tarefa" })
    .getByRole("button", { name: /Desfazer pulo/ })
    .click();
  await expect(page.getByText("PULADA · DESCANSO")).toBeHidden();
  await row(page, "Beta").click();
  await expect(streak).toHaveText("4");
  await writes.idle();

  // Progress (client navigation): 7 days = 8 / 10 = 80 %, 3 perfect days
  // (T-3, T-1, today; T-2 is 80 %, not perfect), streak 4.
  await tab(page, /progress/i).click();
  await expect(page.getByTestId("progress-pct")).toHaveText("80%");
  await expect(page.getByTestId("progress-streak")).toHaveText(/^4\s*dias$/);
  await expect(page.getByTestId("progress-perfect")).toHaveText("3");
  await expect(page.getByTestId("progress-focus")).toHaveText("0m");
  const chart = page.getByRole("region", { name: "Gráfico de conclusão" });
  await expect(
    chart.getByRole("listitem", {
      name: `${shortDate(addDays(T, -4))}: sem tarefas`,
    }),
  ).toBeAttached();
  await expect(
    chart.getByRole("listitem", { name: `${shortDate(addDays(T, -2))}: 80%` }),
  ).toBeAttached();

  // Calendar (current month only): missed, neutral and a day review.
  if (addDays(T, -5).slice(0, 7) === T.slice(0, 7)) {
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${calendarName(addDays(T, -5))}: perdido, 0%$`),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${calendarName(addDays(T, -4))}: nada agendado$`),
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: new RegExp(
          `^${calendarName(addDays(T, -2))}: padrão atingido, 80%$`,
        ),
      })
      .click();
    const sheet = page.getByRole("dialog", { name: "Detalhes do dia" });
    await expect(sheet.getByText("Padrão atingido")).toBeVisible();
    await expect(sheet.getByText("80%")).toBeVisible();
    await expect(sheet.getByText("FEITA", { exact: true })).toHaveCount(4);
    await expect(sheet.getByText("PERDIDA", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }

  // Insights: longest streak includes today live.
  await page.getByRole("button", { name: "Mostrar análises" }).click();
  await expect(page.getByText("MAIOR SEQUÊNCIA 4 DIAS")).toBeVisible();

  // Standard 90 %: T-2 (80 %) no longer counts -> streak 2 (T-1 + today),
  // recalculated over history, persisted.
  await tab(page, /mais/i).click();
  await page.getByRole("link", { name: /ajustes/i }).click();
  await page.getByRole("radio", { name: "90%" }).click();
  await expect(page.getByRole("radio", { name: "90%" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await writes.idle();
  await tab(page, /hoje/i).click();
  await expect(streak).toHaveText("2");
  await page.reload();
  await expect(streak).toHaveText("2");
  expect(
    (await C.from("profiles").select("daily_standard_percent").single()).data
      ?.daily_standard_percent,
  ).toBe(90);

  // Back to 80 %.
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: "90%" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "80%" }).click();
  await writes.idle();
  await tab(page, /hoje/i).click();
  await expect(streak).toHaveText("4");

  // Without a duo there is no competition.
  await tab(page, /parceiro/i).click();
  await expect(page.getByText("SEM DUPLA POR ENQUANTO")).toBeVisible();

  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("weekly competition updates live on both sides; private tasks count but never show", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await makeDuo(A, B);
  // Last week (before this duo existed): never a head-to-head result.
  const lastWeek = addDays(weekStartOf(T), -7);
  await seedDay(A, lastWeek, 4, 1, { prefix: "Old A" });
  await seedDay(B, lastWeek, 2, 3, { prefix: "Old B" });
  // This week: Alice 3 shared + 1 private, Bruno 2 shared, all open.
  for (const t of ["Shared one", "Shared two", "Shared three"])
    await oneOff(A, t);
  await oneOff(A, "Secret plan", false);
  await oneOff(B, "Bruno one");
  await oneOff(B, "Bruno two");

  const a = await open(browser, users.a, "/today");
  const b = await open(browser, users.b, "/partner");
  const aWrites = trackWrites(a.page);
  const bWrites = trackWrites(b.page);
  const bWeek = b.page.getByRole("region", { name: "Esta semana" });

  await expect(bWeek.getByTestId("week-me")).toHaveText("0%");
  await expect(bWeek.getByTestId("week-partner")).toHaveText("0%");
  await expect(bWeek.getByTestId("week-leader")).toHaveText(/^EMPATADOS/);
  const bH2h = b.page.getByRole("region", { name: "Confronto" });
  await expect(bH2h.getByTestId("h2h-score")).toHaveText(/^0\s*—\s*0$/);
  await expect(
    bH2h.getByLabel(`Semana ${isoWeekNumber(lastWeek)}: sem disputa`),
  ).toBeVisible();

  // Both connected before anything happens.
  await expect(
    a.page.getByRole("link", { name: /^Bruno: online,/ }),
  ).toBeVisible({ timeout: LIVE });

  // Alice completes a shared task: Bruno's page moves without a reload.
  // 1 / 4 = 25 % (the private task is in her total).
  await row(a.page, "Shared one").click();
  const bActivity = b.page.getByRole("region", { name: "Atividade" });
  await expect(bActivity.getByText("concluiu Shared one")).toBeVisible({
    timeout: LIVE,
  });
  await expect(bWeek.getByTestId("week-partner")).toHaveText("25%", {
    timeout: LIVE,
  });
  await expect(bWeek.getByTestId("week-leader")).toHaveText(
    /ALICE ESTÁ NA FRENTE\s*\+25%/,
  );

  // Private completion: no title, no feed line, no toast. (No broadcast is
  // sent; if Bruno's page re-reads for any other reason it may already show
  // the aggregate, 50 % — counts are shared, details never.)
  await row(a.page, "Secret plan").click();
  await aWrites.idle();
  await b.page.waitForTimeout(3000);
  await expect(bWeek.getByTestId("week-partner")).toHaveText(/^(25|50)%$/);
  await expect(b.page.getByText("Secret plan")).toHaveCount(0);
  await expect(bActivity.getByText("concluiu Shared one")).toHaveCount(1);
  await expect(b.page.getByRole("status").getByText(/Secret/)).toHaveCount(0);

  // The next shared completion brings the aggregate: 3 / 4 = 75 %.
  await row(a.page, "Shared two").click();
  await expect(bWeek.getByTestId("week-partner")).toHaveText("75%", {
    timeout: LIVE,
  });
  await expect(b.page.getByText("Secret plan")).toHaveCount(0);
  await aWrites.idle();

  // Alice's own view is live from her tasks.
  await tab(a.page, /parceiro/i).click();
  const aWeek = a.page.getByRole("region", { name: "Esta semana" });
  await expect(aWeek.getByTestId("week-me")).toHaveText("75%");
  await expect(aWeek.getByTestId("week-partner")).toHaveText("0%");
  await expect(aWeek.getByTestId("week-leader")).toHaveText(
    /VOCÊ ESTÁ NA FRENTE\s*\+75%/,
  );

  // Bruno completes both of his: Alice (on /partner, no reload) sees 100 %.
  await tab(b.page, /hoje/i).click();
  await row(b.page, "Bruno one").click();
  await row(b.page, "Bruno two").click();
  await expect(aWeek.getByTestId("week-partner")).toHaveText("100%", {
    timeout: LIVE,
  });
  await expect(aWeek.getByTestId("week-leader")).toHaveText(
    /BRUNO ESTÁ NA FRENTE\s*\+25%/,
  );
  await bWrites.idle();

  // The current week is never a result: still 0 — 0 on both sides.
  const aH2h = a.page.getByRole("region", { name: "Confronto" });
  await expect(aH2h.getByTestId("h2h-score")).toHaveText(/^0\s*—\s*0$/);
  await tab(b.page, /parceiro/i).click();
  await expect(bWeek.getByTestId("week-me")).toHaveText("100%");
  await expect(bWeek.getByTestId("week-leader")).toHaveText(
    /VOCÊ ESTÁ NA FRENTE\s*\+25%/,
  );
  await expect(bH2h.getByTestId("h2h-score")).toHaveText(/^0\s*—\s*0$/);

  // Focus is shown apart and is not part of the score.
  await expect(bWeek.getByText("FOCO", { exact: true })).toBeVisible();

  // Last week's review: Bruno's own numbers, no partner side, no verdict.
  await bH2h
    .getByRole("button", {
      name: new RegExp(`^SEMANA ${isoWeekNumber(lastWeek)} `),
    })
    .click();
  const review = b.page.getByRole("dialog", {
    name: `Revisão da semana ${isoWeekNumber(lastWeek)}`,
  });
  await expect(review.getByTestId("weekly-me")).toHaveText("40%");
  await expect(review.getByTestId("weekly-verdict")).toHaveCount(0);
  await expect(review.getByText("2 / 5")).toBeVisible();
  await review.getByRole("button", { name: "FECHAR" }).click();

  // Reload: the same numbers come back from the database.
  await b.page.reload();
  await expect(bWeek.getByTestId("week-me")).toHaveText("100%");
  await expect(bWeek.getByTestId("week-partner")).toHaveText("75%");

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("progress functions through the public API: own data, partner aggregates only, outsider and anon nothing", async () => {
  const aId = await uid(A);
  const week0 = weekStartOf(T);

  // Bruno reads Alice's week as counts; her private task is counted, never listed.
  const bWeeks = (await B.rpc("duo_weeks", { p_weeks: 1 })).data!;
  const current = bWeeks.find((w) => w.is_current)!;
  expect(current.week_start).toBe(week0);
  expect(current.partner_planned).toBe(4);
  expect(current.partner_completed).toBe(3);
  expect(
    Object.values(current).every((v) => typeof v !== "string" || v === week0),
  ).toBe(true);
  const secret = await B.from("daily_tasks")
    .select("id")
    .eq("owner_id", aId)
    .eq("title", "Secret plan");
  expect(secret.data).toEqual([]);

  // Last week predates the duo: no partner side.
  const past = bWeeks.find((w) => !w.is_current)!;
  expect(past.me_planned).toBe(5);
  expect(past.partner_planned).toBeNull();

  // Own series only.
  const series = (
    await B.rpc("my_daily_progress", { p_from: addDays(T, -7), p_to: T })
  ).data!;
  const today = series.find((d) => d.day === T)!;
  expect(today).toMatchObject({ planned: 2, completed: 2 });

  // Partner summary: aggregates, and the partner's own standard.
  const ps = (await B.rpc("partner_progress_summary")).data!;
  expect(ps).toHaveLength(1);
  expect(Object.keys(ps[0]).sort()).toEqual([
    "current_streak",
    "standard",
    "streak_before_today",
  ]);

  // Outsider: no partner side at all.
  const cWeeks = (await C.rpc("duo_weeks", { p_weeks: 2 })).data!;
  expect(cWeeks.every((w) => w.partner_planned === null)).toBe(true);
  expect((await C.rpc("partner_progress_summary")).data).toEqual([]);

  // Out-of-range series and anon are refused.
  const tooLong = await A.rpc("my_daily_progress", {
    p_from: addDays(T, -500),
    p_to: T,
  });
  expect(tooLong.error?.message).toBe("LI_INVALID_RANGE");
  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  for (const fn of [
    "duo_weeks",
    "partner_progress_summary",
    "my_progress_summary",
  ] as const) {
    const res = await anon.rpc(fn);
    expect(res.error, fn).not.toBeNull();
  }

  // A standard outside 1–100 is refused by the database.
  const bad = await B.from("profiles")
    .update({ daily_standard_percent: 0 })
    .eq("id", await uid(B));
  expect(bad.error).not.toBeNull();
});
