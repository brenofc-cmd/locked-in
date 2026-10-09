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
  apiAs,
  makeDuo,
  resetTasks,
  signInUI,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * V3.2 Morning Ritual (docs/MORNING_RITUAL.md): Today's header opens the
 * day on the first visit of the local day. Real states — a new day, a day in
 * progress, everything done, no tasks, a long task name, with and without a
 * partner — and the hand-off to execution. Carla (C) is alone; Alice (A) and
 * Bruno (B) are a duo. LI_SHOTS=<dir> also captures each state at 320 and
 * 390 px.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let hadDuo = false;

const SHOTS = process.env.LI_SHOTS ?? "";

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  user: TestUser,
  width = 390,
  reducedMotion: "reduce" | "no-preference" = "no-preference",
): Promise<Opened> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: { width, height: width < 360 ? 640 : width < 780 ? 844 : 900 },
    userAgent: use.userAgent,
    deviceScaleFactor: width < 780 ? 2 : 1,
    isMobile: width < 780,
    hasTouch: width < 780,
    baseURL: use.baseURL,
    reducedMotion,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInUI(page, user, "/today");
  return { context, page, errors };
}

const ritual = (page: Page) =>
  page.getByRole("region", { name: t.morning.aria });
const start = (page: Page) => ritual(page).getByTestId("morning-start");

async function uid(api: Api) {
  return (await api.auth.getUser()).data.user!.id;
}

async function briefing(api: Api, on: boolean) {
  const { error } = await api
    .from("user_settings")
    .update({ show_morning_briefing: on })
    .eq("user_id", await uid(api));
  if (error) throw new Error(error.message);
}

/** Today's one-off tasks for the signed-in user; `done` of them completed. */
async function day(api: Api, titles: string[], done = 0) {
  await resetTasks(api);
  for (const [i, title] of titles.entries()) {
    const { error } = await api.from("daily_tasks").insert({
      title,
      status: i < done ? "completed" : "pending",
    });
    if (error) throw new Error(error.message);
  }
  await briefing(api, true);
}

/** Forget today's mark so the ritual opens again on the next load. */
async function again(page: Page, api: Api) {
  await page.evaluate(
    (key) => localStorage.removeItem(key),
    `locked-in:v2:${await uid(api)}:daily`,
  );
  await page.reload();
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(900); // entry animations settle
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  // Leave Alice / Bruno as the suite found them (later suites read it).
  const { data } = await A.from("duo_members")
    .select("duo_id")
    .eq("user_id", await uid(A));
  hadDuo = (data ?? []).length > 0;
  await C.rpc("leave_duo");
});

test.afterAll(async () => {
  for (const api of [A, B, C]) await resetTasks(api);
  if (hadDuo) await makeDuo(A, B);
  else await A.rpc("leave_duo");
});

for (const width of [320, 390, 1440]) {
  test(`capture states at ${width}`, async ({ browser }) => {
    test.skip(!SHOTS, "set LI_SHOTS=<dir> to capture");
    test.setTimeout(240_000);
    await day(C, ["Arrumar a cama", "Estudar física"]);
    const c = await open(browser, users.c, width);
    await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
    await shot(c.page, `${width}-1-new`);
    if (SHOTS) {
      // The hand-off: mid-transition, then settled.
      await start(c.page).click();
      await c.page.waitForTimeout(140);
      await c.page.screenshot({ path: `${SHOTS}/${width}-1b-transition.png` });
      await shot(c.page, `${width}-1c-started`);
    }

    await day(
      C,
      [
        "Acordar 06:00",
        "Beber água",
        "Arrumar a cama",
        "Ler 20 páginas",
        "Treino",
      ],
      2,
    );
    await again(c.page, C);
    await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
    await shot(c.page, `${width}-2-progress`);

    await day(C, ["Arrumar a cama", "Estudar física"], 2);
    await again(c.page, C);
    await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
    await shot(c.page, `${width}-3-done`);

    await day(C, []);
    await again(c.page, C);
    await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
    await shot(c.page, `${width}-4-empty`);

    await day(C, [
      "Revisar termodinâmica inteira e resolver a lista de exercícios do professor",
      "Treino",
    ]);
    await again(c.page, C);
    await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
    await shot(c.page, `${width}-5-long`);
    await c.context.close();

    await makeDuo(A, B);
    await day(B, ["Leitura"]);
    await briefing(B, false);
    await day(A, ["Arrumar a cama", "Estudar física", "Treino"]);
    const a = await open(browser, users.a, width);
    await expect(ritual(a.page)).toBeVisible({ timeout: 20_000 });
    await shot(a.page, `${width}-6-partner`);
    await a.context.close();
    await A.rpc("leave_duo");
  });
}

/** Today's task statuses in the database (the ritual must change none). */
async function statuses(api: Api) {
  const today = (await api.rpc("my_today")).data!;
  const { data } = await api
    .from("daily_tasks")
    .select("title, status")
    .eq("owner_id", await uid(api))
    .eq("task_date", today)
    .order("title");
  return data;
}

test("fresh day: the first step leads, not 0 %; starting hands over without writing", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await day(C, ["Arrumar a cama", "Estudar física"]);
  const c = await open(browser, users.c);
  const page = c.page;
  await expect(ritual(page)).toBeVisible({ timeout: 20_000 });
  await expect(ritual(page)).toHaveAttribute("data-state", "fresh");
  await expect(ritual(page)).toContainText(t.morning.lead.fresh(2));
  await expect(ritual(page)).toContainText(t.morning.first);
  await expect(ritual(page).getByTestId("morning-step")).toHaveText(
    "Arrumar a cama",
  );
  await expect(ritual(page)).toContainText(t.morning.step(1, 2));
  // The day's numbers wait for the start; a streak of 0 and a missing
  // partner are simply not listed.
  await expect(page.getByTestId("today-pct")).toHaveCount(0);
  await expect(ritual(page)).not.toContainText(t.morning.streakKey);
  await expect(ritual(page)).toContainText(t.morning.standard(80));
  // One Rook on the screen, hosting; never a modal.
  await expect(page.locator("main [data-rook]")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const before = await statuses(C);
  await expect(start(page)).toHaveText(t.morning.start);
  await start(page).click();
  await expect(ritual(page)).toHaveCount(0);
  await expect(page.getByTestId("today-pct")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: t.morning.go }),
  ).toBeVisible();
  // Rook acknowledges the start; focus lands on the first step's check.
  await expect(page.locator("main [data-rook]")).toHaveAttribute(
    "data-act",
    "ack",
  );
  const check = page.getByRole("checkbox", { name: "Arrumar a cama" });
  await expect(check).toBeFocused();
  await expect(check).toHaveAttribute("aria-checked", "false");
  await page.waitForTimeout(1000);
  expect(await statuses(C)).toEqual(before);
  // The line goes back to the standard after a moment.
  await expect(page.getByText(t.morning.go)).toHaveCount(0, { timeout: 5000 });

  // Once a day: not again after a reload.
  await page.reload();
  await expect(page.getByTestId("today-pct")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await expect(ritual(page)).toHaveCount(0);
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("day in progress: recognises the proof and continues from the next step", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await day(
    C,
    ["Acordar", "Beber água", "Ler 20 páginas", "Treino", "Estudar"],
    2,
  );
  const c = await open(browser, users.c);
  await expect(ritual(c.page)).toHaveAttribute("data-state", "going", {
    timeout: 20_000,
  });
  await expect(ritual(c.page)).toContainText(t.morning.lead.going(2, 5));
  await expect(ritual(c.page)).toContainText(t.morning.nextStep);
  await expect(ritual(c.page)).toContainText(t.morning.step(3, 5));
  await expect(start(c.page)).toHaveText(t.morning.resume);
  await start(c.page).click();
  await expect(
    c.page.locator('[data-next="true"] [role="checkbox"]'),
  ).toBeFocused();
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("everything done: no COMEÇAR O DIA, one quiet confirmation", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await day(C, ["Arrumar a cama", "Estudar física"], 2);
  const c = await open(browser, users.c);
  await expect(ritual(c.page)).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  await expect(ritual(c.page)).toContainText(t.morning.lead.perfect);
  await expect(ritual(c.page)).toContainText(t.morning.doneTitle(2));
  await expect(
    ritual(c.page).getByRole("button", { name: t.morning.start }),
  ).toHaveCount(0);
  // The Perfect Day banner waits: the ritual already says it.
  await expect(c.page.getByText(t.todayScreen.standardMet)).toHaveCount(0);
  await start(c.page).click();
  await expect(c.page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(c.page.getByText(t.todayScreen.standardMet)).toBeVisible();
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("no tasks: an empty state that plans the day, nothing invented", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await day(C, []);
  const c = await open(browser, users.c);
  await expect(ritual(c.page)).toHaveAttribute("data-state", "empty", {
    timeout: 20_000,
  });
  await expect(ritual(c.page)).toContainText(t.morning.lead.empty);
  await expect(ritual(c.page).getByTestId("morning-step")).toHaveCount(0);
  // The routine invitation below would repeat it while the ritual is open.
  await expect(c.page.getByText(t.todayScreen.noRoutine)).toHaveCount(0);
  await expect(start(c.page)).toHaveText(t.morning.planDay);
  await start(c.page).click();
  await expect(c.page.getByRole("dialog")).toBeVisible();
  await expect(ritual(c.page)).toHaveCount(0);
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("with a partner: one line with the partner's real status", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await makeDuo(A, B);
  await day(A, ["Arrumar a cama"]);
  const a = await open(browser, users.a);
  await expect(ritual(a.page)).toBeVisible({ timeout: 20_000 });
  await expect(ritual(a.page)).toContainText("BRUNO");
  await expect(ritual(a.page)).toContainText(t.morning.lead.fresh(1));
  expect(a.errors).toEqual([]);
  await a.context.close();
  await A.rpc("leave_duo");
});

test("keyboard, reduced motion and 320 px: readable at once, reachable, no overflow", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await day(C, ["Arrumar a cama", "Estudar física"]);
  const c = await open(browser, users.c, 320, "reduce");
  const page = c.page;
  await expect(ritual(page)).toBeVisible({ timeout: 20_000 });
  // Reduced motion: nothing is animating; every state is already readable.
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (x) =>
            x.playState === "running" &&
            x.effect?.getTiming().iterations !== Infinity &&
            Number(x.effect?.getTiming().duration) > 50,
        ).length,
  );
  expect(running).toBe(0);
  // The action sits above the pinned LOCK IN on a 320 × 640 phone.
  const cta = (await start(page).boundingBox())!;
  const lock = (await page
    .getByRole("button", { name: /LOCK IN/ })
    .first()
    .boundingBox())!;
  expect(cta.y + cta.height).toBeLessThanOrEqual(lock.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  // Keyboard: the action works with Enter.
  await start(page).focus();
  await page.keyboard.press("Enter");
  await expect(ritual(page)).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Arrumar a cama" }),
  ).toBeFocused();
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("axe: Today with the ritual open", async ({ browser }) => {
  test.setTimeout(90_000);
  await day(C, ["Arrumar a cama", "Estudar física"], 1);
  const c = await open(browser, users.c);
  await expect(ritual(c.page)).toBeVisible({ timeout: 20_000 });
  await c.page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (x) =>
          x.playState !== "running" ||
          x.effect?.getTiming().iterations === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page: c.page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
  await c.context.close();
});
