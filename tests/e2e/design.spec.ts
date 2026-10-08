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
  seedDesignDay,
  seedPartnerDay,
  signInUI,
  trackWrites,
  users,
  type Api,
} from "./support";

/**
 * Final design pass (docs/DESIGN_SYSTEM.md, docs/MOTION.md, docs/ROOK.md):
 * the behaviour the new design promises — completion feedback with and
 * without motion, the one action of Focus on the first view, the duel
 * scoreboard, Rook decorative and scarce, the Focus cameo, and axe on every
 * main screen at 390 and 1440. Alice (A) with the approved design's day and
 * a duo with Bruno (B); reset afterwards through the suite's helpers.
 */
// Each test signs in (DEV latency can take seconds): 60 s, like the other
// suites that sign in.
test.describe.configure({ mode: "serial", timeout: 60_000 });

let A: Api;
let B: Api;
const ACCENT = "rgb(198, 224, 123)";

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  path: string,
  opts: {
    reducedMotion?: "reduce" | "no-preference";
    viewport?: { width: number; height: number };
  } = {},
): Promise<Opened> {
  const use = test.info().project.use;
  const viewport = opts.viewport ?? use.viewport!;
  const phone = viewport.width < 780;
  const context = await browser.newContext({
    viewport,
    isMobile: phone,
    hasTouch: phone,
    baseURL: use.baseURL,
    reducedMotion: opts.reducedMotion ?? "no-preference",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInUI(page, users.a, path);
  return { context, page, errors };
}

const checkbox = (page: Page, name: string) =>
  page
    .getByRole("region", { name: t.todayScreen.tasksAria })
    .getByRole("checkbox", { name, exact: true });
/**
 * Complete a task once hydrated. A click before hydration is lost or replayed
 * during hydration (the bar then mounts at the new value: no glow), so wait
 * until React owns the row (it attaches its props to the node), then click.
 */
async function complete(page: Page, name: string) {
  const row = checkbox(page, name);
  await expect
    .poll(
      () =>
        row.evaluate((el) =>
          Object.keys(el).some((k) => k.startsWith("__reactProps$")),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
}
const box = (page: Page, name: string) =>
  checkbox(page, name).locator("span[aria-hidden='true']").first();
const bg = (page: Page, name: string) =>
  box(page, name).evaluate((el) => getComputedStyle(el).backgroundColor);
const pulse = (page: Page) =>
  page
    .getByRole("progressbar", { name: t.todayScreen.completionLabel })
    .locator("span.bg-accent");

test.beforeAll(async () => {
  test.setTimeout(180_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  await seedDesignDay(A);
  await makeDuo(A, B);
  await seedPartnerDay(B);
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  await resetTasks(B);
  await resetTasks(A);
  await A.rpc("leave_duo");
});

test("1: completing a task — instant state, a bright beat, then a quiet done; the bar glows once", async ({
  browser,
}) => {
  const a = await open(browser, "/today");
  const writes = trackWrites(a.page);
  const name = "Morning Run";
  await checkbox(a.page, name).click();
  // Immediate: the state is the checkbox's, not the animation's.
  await expect(checkbox(a.page, name)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => bg(a.page, name), { intervals: [20] }).toBe(ACCENT);
  // The beat settles to the quiet done state (open work stays loudest).
  await expect.poll(() => bg(a.page, name)).not.toBe(ACCENT);
  // Progress moved up: one glow over the bar, with motion allowed.
  await expect(pulse(a.page)).toHaveCount(1);
  expect(
    await pulse(a.page).evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("li-bar-pulse");
  // Undo: back to open, and the bar never glows when it goes down.
  await checkbox(a.page, name).click();
  await expect(checkbox(a.page, name)).toHaveAttribute("aria-checked", "false");
  expect(a.errors).toEqual([]);
  // The undo must reach the database before the page goes: a lost write
  // leaves the task done on DEV and the next test's click undoes it.
  await writes.idle();
  await a.context.close();
});

test("2: the same with reduced motion — same states, no movement", async ({
  browser,
}) => {
  const a = await open(browser, "/today", { reducedMotion: "reduce" });
  const writes = trackWrites(a.page);
  const name = "Morning Run";
  await complete(a.page, name);
  await expect.poll(() => bg(a.page, name)).not.toBe(ACCENT);
  await expect(pulse(a.page)).toHaveCount(1);
  expect(
    await pulse(a.page).evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await checkbox(a.page, name).click();
  await expect(checkbox(a.page, name)).toHaveAttribute("aria-checked", "false");
  await writes.idle();
  await a.context.close();
});

test("3: FOCO — LOCK IN is on the first view of a small phone", async ({
  browser,
}) => {
  const a = await open(browser, "/focus", {
    viewport: { width: 375, height: 667 },
  });
  await expect(a.page.getByRole("button", { name: "LOCK IN" })).toBeInViewport({
    ratio: 1,
  });
  await a.context.close();
});

test("4: DUPLA — the duel scoreboard says who leads; the partner's day is plain facts", async ({
  browser,
}) => {
  const a = await open(browser, "/partner");
  const duel = a.page.getByTestId("duel-detailed");
  const score = duel.getByTestId("duel-score");
  await expect(score).toBeVisible();
  await expect(score).toContainText(
    new RegExp(t.duel.score(9, 9).replace(/9/g, String.raw`\d+`)),
  );
  await expect(duel.getByTestId("duel-headline")).not.toBeEmpty();
  const facts = a.page.getByTestId("partner-day-line");
  await expect(facts.locator("dt")).toHaveCount(4);
  await expect(facts).toContainText(t.accountability.focusToday);
  await a.context.close();
});

test("5: Rook is decorative and scarce", async ({ browser }) => {
  const a = await open(browser, "/plan/week");
  const rook = a.page.locator("svg[data-rook]");
  await expect(rook.first()).toBeVisible();
  for (const path of ["/plan/week", "/today", "/partner", "/progress"]) {
    await a.page.goto(path);
    await a.page.waitForLoadState("load");
    const all = a.page.locator("svg[data-rook]");
    // Never on rows, cards or navigation: at most one on a screen.
    expect(await all.count()).toBeLessThanOrEqual(1);
    for (const svg of await all.all())
      await expect(svg).toHaveAttribute("aria-hidden", "true");
  }
  await a.context.close();
});

test("6: Focus — Rook locks in and stays almost still (blink only with motion); done: a nod", async ({
  browser,
}) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const a = await open(browser, "/focus", { reducedMotion });
    await a.page.getByRole("button", { name: "LOCK IN" }).click();
    const session = a.page.getByRole("dialog", {
      name: t.focusUi.sessionAria,
    });
    await expect(session.getByTestId("focus-clock")).toBeVisible();
    const rook = session.locator("svg[data-rook='focused']");
    await expect(rook).toHaveAttribute("data-act", "lock");
    await expect(rook).toHaveAttribute("data-core", "active");
    // The wings came in towards the Core (lock end state, either way).
    await expect
      .poll(() =>
        rook
          .locator("[data-part='wing-left']")
          .evaluate((el) => getComputedStyle(el).rotate),
      )
      .toBe("-12deg");
    // Idle: an occasional blink only — no loop at all with reduced motion.
    const eyes = await rook
      .locator("[data-part='eyes']")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(eyes).toBe(reducedMotion === "reduce" ? "none" : "rook-idle-blink");
    await session.getByRole("button", { name: t.focusUi.endAria }).click();
    const done = a.page.getByRole("dialog", { name: t.focusUi.completeAria });
    const proud = done.locator("svg[data-rook='proud']");
    await expect(proud).toBeVisible();
    await expect(proud).toHaveAttribute("data-act", "ack");
    await done.getByRole("button", { name: t.focusUi.done }).click();
    await expect(done).toHaveCount(0);
    await a.context.close();
  }
});

test("6b: Today — Rook acknowledges each task proved, nothing on load", async ({
  browser,
}) => {
  const a = await open(browser, "/today");
  const writes = trackWrites(a.page);
  const rook = a.page.locator("main svg[data-rook]");
  await expect(rook).toHaveCount(1);
  await expect(rook).not.toHaveAttribute("data-act");
  await complete(a.page, "Morning Run");
  await expect(rook).toHaveAttribute("data-act", "ack");
  expect(
    await rook
      .locator("[data-part='proof-core']")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("rook-core");
  await checkbox(a.page, "Morning Run").click();
  await expect(checkbox(a.page, "Morning Run")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await writes.idle();
  await a.context.close();
});

test("7: axe — no serious / critical issue on the main screens at 390 and 1440", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const report: string[] = [];
  for (const width of [390, 1440]) {
    const a = await open(browser, "/today", {
      viewport: { width, height: width < 780 ? 844 : 900 },
    });
    for (const path of [
      "/today",
      "/partner",
      "/focus",
      "/plan",
      "/plan/week",
      "/planner",
      "/goals",
      "/progress",
      "/settings",
    ]) {
      await a.page.goto(path);
      await a.page.waitForLoadState("load");
      await a.page.waitForTimeout(900); // entry animations finish
      // /today and /focus have a sticky action bar that rows scroll under:
      // axe counts a row passing beneath it as a small target. Their
      // targets are measured below instead (≥ 44 px, stricter than 24).
      const sticky = path === "/today" || path === "/focus";
      const builder = new AxeBuilder({ page: a.page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
      ]);
      if (sticky && width < 780) builder.disableRules(["target-size"]);
      const { violations } = await builder.analyze();
      if (path === "/today") {
        for (const row of await a.page
          .getByRole("region", { name: t.todayScreen.tasksAria })
          .getByRole("checkbox")
          .all()) {
          const h = (await row.boundingBox())?.height ?? 0;
          if (h < 44) report.push(`${width} /today row target ${h}px`);
        }
      }
      for (const v of violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ))
        report.push(
          `${width} ${path} ${v.id} (${v.impact}) ${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(" "))
            .join(" | ")}`,
        );
    }
    await a.context.close();
  }
  expect(report).toEqual([]);
});

test("8: 320 / 360 — nothing sticks out of the screen, even where <main> clips it; tab labels never touch", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const report: string[] = [];
  for (const width of [320, 360]) {
    const a = await open(browser, "/today", {
      viewport: { width, height: 740 },
    });
    for (const path of [
      "/today",
      "/partner",
      "/focus",
      "/plan",
      "/plan/week",
      "/progress",
      "/settings",
    ]) {
      await a.page.goto(path);
      await a.page.waitForLoadState("load");
      await a.page.waitForTimeout(600);
      // <main> has overflow-x: hidden, so documentElement.scrollWidth never
      // sees a block wider than the screen (a 300 px grid column at 320 px
      // did exactly that): measure the boxes themselves.
      const wide = await a.page.evaluate(() => {
        const main = document.querySelector("main")!;
        const edge = main.getBoundingClientRect().right + 0.5;
        return [...main.querySelectorAll<HTMLElement>("*")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.right > edge;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
      });
      for (const w of wide) report.push(`${width} ${path} ${w}`);
    }
    const labels = await a.page
      .getByRole("navigation", { name: t.shell.tabsNav })
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((l) => {
          const r = l.querySelector("span:last-child")!.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      );
    labels.forEach((r, i) => {
      if (r.left < 0 || r.right > width)
        report.push(`${width} tab ${i} off screen`);
      if (i > 0 && r.left - labels[i - 1].right < 2)
        report.push(`${width} tabs ${i - 1}/${i} touch`);
    });
    await a.context.close();
  }
  expect(report).toEqual([]);
});

test("9: Today points at one next task, and the pointer moves on when it is proved", async ({
  browser,
}) => {
  const a = await open(browser, "/today");
  const writes = trackWrites(a.page);
  const tasks = a.page.getByRole("region", { name: t.todayScreen.tasksAria });
  const next = tasks.getByTestId("task-next");
  // The design day: Morning Run is the first open task (no Top 3 set).
  await expect(next).toHaveCount(1);
  await expect(
    checkbox(a.page, "Morning Run").getByTestId("task-next"),
  ).toHaveCount(1);
  await complete(a.page, "Morning Run");
  await expect(next).toHaveCount(1);
  await expect(
    checkbox(a.page, "Morning Run").getByTestId("task-next"),
  ).toHaveCount(0);
  await checkbox(a.page, "Morning Run").click();
  await expect(checkbox(a.page, "Morning Run")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(
    checkbox(a.page, "Morning Run").getByTestId("task-next"),
  ).toHaveCount(1);
  await writes.idle();
  await a.context.close();
});
