import { t } from "@/i18n/pt-BR";
import { expect, test, type Page } from "@playwright/test";
import { addDays } from "@/lib/local-date";
import {
  apiAs,
  makeDuo,
  resetTasks,
  seedDesignDay,
  seedPartnerDay,
  signInUI,
  users,
  type Api,
} from "./support";

/**
 * Visual review matrix (LI_SHOTS=<dir>; skipped otherwise). Alice gets the
 * approved design's day (12 tasks, 8 done), a duo with Bruno's real day and
 * activity, and a Planner event; every main screen is captured at each width,
 * once as the first viewport ("fold", what the user sees on open) and once
 * as the whole scrollable page ("full"). Data is reset afterwards through the
 * suite's own helpers. docs/DESIGN_SYSTEM.md → Visual regression.
 */
test.describe.configure({ mode: "serial" });
test.use({ channel: "chromium" });

const DIR = process.env.LI_SHOTS ?? "";
const WIDTHS = (process.env.LI_SHOTS_WIDTHS ?? "375,390,430,768,958,1440")
  .split(",")
  .map(Number);
const PAGES = [
  ["today", "/today"],
  ["partner", "/partner"],
  ["focus", "/focus"],
  ["plan", "/plan"],
  ["progress", "/progress"],
  ["planner", "/planner"],
  ["goals", "/goals"],
  ["week", "/plan/week"],
  ["settings", "/settings"],
] as const;

let A: Api;
let B: Api;

async function seed() {
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  await seedDesignDay(A);
  await makeDuo(A, B);
  await seedPartnerDay(B);
  const me = (await A.auth.getUser()).data.user!.id;
  const T = (await A.rpc("my_today")).data as string;
  await A.from("planner_events").delete().eq("owner_id", me);
  await A.from("planner_events").insert([
    {
      title: "Prova de Física",
      subject: "Física",
      event_type: "exam",
      event_date: addDays(T, 2),
    },
    {
      title: "Entrega do trabalho de História",
      event_type: "assignment",
      event_date: addDays(T, 6),
    },
  ]);
}

async function cleanup() {
  const me = (await A.auth.getUser()).data.user!.id;
  await A.from("planner_events").delete().eq("owner_id", me);
  await resetTasks(B);
  await resetTasks(A);
  await A.rpc("leave_duo");
}

/** The whole scrollable page: the shell scrolls inside <main>. */
async function full(page: Page, path: string) {
  const style = await page.addStyleTag({
    content:
      ".h-dvh{height:auto!important;overflow:visible!important} main{overflow:visible!important}",
  });
  await page.screenshot({ path, fullPage: true });
  await style.evaluate((s) => (s as HTMLStyleElement).remove());
}

test("visual matrix", async ({ browser }) => {
  test.skip(!DIR, "set LI_SHOTS=<dir> to capture the visual matrix");
  test.setTimeout(900_000);
  await seed();
  try {
    for (const width of WIDTHS) {
      const phone = width < 780;
      const context = await browser.newContext({
        viewport: { width, height: phone ? 844 : 900 },
        isMobile: phone,
        hasTouch: phone,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await signInUI(page, users.a, "/today");
      await page.waitForTimeout(1200);
      // First open of the day: the morning card.
      await page.screenshot({ path: `${DIR}/${width}-today-morning.png` });
      const close = page
        .getByRole("region", { name: t.morning.aria })
        .getByRole("button", { name: t.morning.close });
      if (await close.count()) await close.click();
      for (const [name, path] of PAGES) {
        if (path !== "/today") await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${DIR}/${width}-${name}-fold.png` });
        await full(page, `${DIR}/${width}-${name}-full.png`);
      }
      // Reviews (dialogs) on the two primary widths only.
      if (width === 390 || width === 1440) {
        await page.goto("/today");
        await page
          .getByRole("button", { name: t.todayScreen.reviewToday })
          .click();
        await expect(
          page.getByRole("dialog", { name: t.moments.reviewTodayAria }),
        ).toBeVisible();
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${DIR}/${width}-review-day.png` });
        await page.keyboard.press("Escape");
        await page.goto("/partner");
        await page
          .getByRole("button", { name: t.partnerScreen.reviewWeek })
          .click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${DIR}/${width}-review-week.png` });
      }
      await context.close();
    }
  } finally {
    await cleanup();
  }
});
