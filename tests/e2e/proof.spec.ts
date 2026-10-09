import { t } from "@/i18n/pt-BR";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, resetTasks, signInUI, users, type Api } from "./support";

/**
 * V3.3 Proof motion (docs/MOTION.md → Task completion): the check and Today's
 * Proof Track. Carla (C) alone, briefing off. LI_SHOTS=<dir> also captures
 * the completion frame by frame (animations slowed 4× through CDP).
 */
test.describe.configure({ mode: "serial" });

let C: Api;
const SHOTS = process.env.LI_SHOTS ?? "";

async function day(api: Api, titles: string[], done = 0) {
  await resetTasks(api); // also turns the morning briefing off
  for (const [i, title] of titles.entries()) {
    const { error } = await api
      .from("daily_tasks")
      .insert({ title, status: i < done ? "completed" : "pending" });
    if (error) throw new Error(error.message);
  }
}

const track = (page: Page) =>
  page.getByRole("progressbar", { name: t.todayScreen.completionLabel });
const check = (page: Page, name: string) =>
  page
    .getByRole("region", { name: t.todayScreen.tasksAria })
    .getByRole("checkbox", { name, exact: true });

/** Wait until React owns the row, then tap it centred (above LOCK IN). */
async function tap(page: Page, name: string) {
  const row = check(page, name);
  await expect
    .poll(() =>
      row.evaluate((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
  // The row, not the check: the check overhangs its overflow-hidden row.
  await row.evaluate((el) =>
    (el.closest(".overflow-clip") ?? el).scrollIntoView({ block: "center" }),
  );
  await row.click();
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  C = await apiAs(users.c);
  await C.rpc("leave_duo");
});

test.afterAll(async () => {
  await resetTasks(C);
});

for (const width of [320, 390]) {
  test(`capture a completion at ${width}`, async ({ browser }) => {
    test.skip(!SHOTS, "set LI_SHOTS=<dir> to capture");
    test.setTimeout(120_000);
    await day(
      C,
      ["Acordar", "Beber água", "Arrumar a cama", "Ler", "Treino"],
      2,
    );
    const context = await browser.newContext({
      viewport: { width, height: width < 360 ? 640 : 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      baseURL: test.info().project.use.baseURL,
    });
    const page = await context.newPage();
    await signInUI(page, users.c, "/today");
    await expect(track(page)).toBeVisible();
    await page.waitForTimeout(800);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.25 });
    await page.screenshot({ path: `${SHOTS}/${width}-0-before.png` });
    await tap(page, "Arrumar a cama");
    for (const [i, ms] of [60, 160, 320, 640, 1400].entries()) {
      await page.waitForTimeout(i === 0 ? ms : ms - [60, 160, 320, 640][i - 1]);
      await page.screenshot({ path: `${SHOTS}/${width}-${i + 1}-${ms}ms.png` });
    }
    await context.close();
  });
}

const pills = (page: Page) =>
  track(page)
    .locator("[data-pill]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-pill")));

test("the Proof Track fills from the left, marks the standard, and lights only new proof", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await day(C, ["Acordar", "Beber água", "Arrumar a cama", "Ler", "Treino"], 2);
  const context = await browser.newContext({
    ...test.info().project.use,
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInUI(page, users.c, "/today");
  await expect(track(page)).toBeVisible();
  // Proof first, then PRÓXIMA, then the open ones.
  await expect
    .poll(() => pills(page))
    .toEqual(["done", "done", "next", "open", "open"]);
  // Standard 80 % of 5 → met after the 4th segment; not yet met.
  const tick = track(page).getByTestId("track-standard");
  await expect(tick).toHaveClass(/bg-marker/);
  // Nothing lights on load.
  await expect(track(page).getByTestId("track-sheen")).toHaveCount(0);

  await tap(page, "Ler");
  await expect(check(page, "Ler")).toHaveAttribute("aria-checked", "true");
  // The check: a ring leaves it, the name's strike draws.
  await expect(page.getByTestId("check-ring")).toHaveCount(1);
  expect(
    await page
      .getByTestId("check-ring")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("li-check-ring");
  await expect
    .poll(() => pills(page))
    .toEqual(["done", "done", "done", "next", "open"]);
  await expect(track(page).getByTestId("track-sheen")).toHaveCount(3);
  await expect(check(page, "Ler")).toHaveAttribute("aria-checked", "true");

  // Undo: the fill retracts, no new light.
  await tap(page, "Ler");
  await expect(check(page, "Ler")).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() => pills(page))
    .toEqual(["done", "done", "next", "open", "open"]);
  await page.waitForTimeout(1500); // the undo reaches the database
  expect(errors).toEqual([]);
  await context.close();
});

test("reduced motion: the same states, nothing moves", async ({ browser }) => {
  test.setTimeout(90_000);
  await day(C, ["Acordar", "Beber água", "Ler"], 1);
  const context = await browser.newContext({
    ...test.info().project.use,
    baseURL: test.info().project.use.baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await signInUI(page, users.c, "/today");
  await expect(track(page)).toBeVisible();
  await tap(page, "Beber água");
  await expect(check(page, "Beber água")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const sheen = track(page).getByTestId("track-sheen").first();
  await expect(sheen).toHaveCount(1);
  expect(await sheen.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  expect(await sheen.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await expect.poll(() => pills(page)).toEqual(["done", "done", "next"]);
  await page.waitForTimeout(1500);
  await context.close();
});
