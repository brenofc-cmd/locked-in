import { mkdirSync } from "node:fs";
import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { apiAs, signInUI, users, type Api } from "./support";

/**
 * UI information architecture (docs/NAVIGATION.md): five tabs (HOJE · DUPLA ·
 * FOCO · PLANEJAR · PROGRESSO), the PLANEJAR hub, the profile menu, old deep
 * links, Resume State after /more became /plan, sign-out from the menu and
 * the layout from 375 to 1440. Alice (in a duo with Bruno) after ISSUE-001.
 * LI_IA_SHOTS=<dir> also saves a screenshot of each screen and width.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let aId: string;
type Opened = { context: BrowserContext; page: Page; errors: string[] };
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
let signedIn: State;

const key = (id: string) => `locked-in:v2:${id}:resume`;
const RESTORE = 15_000;

async function launch(
  browser: Browser,
  width = 390,
  height = 844,
  // null = signed out (an explicit undefined would take the default).
  storageState: State | null = signedIn,
): Promise<Opened> {
  const mobile = width < 780;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2.625 : 1,
    baseURL: test.info().project.use.baseURL,
    storageState: storageState ?? undefined,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

const tabs = (page: Page) =>
  page.getByRole("navigation", { name: t.shell.tabsNav });
const tab = (page: Page, label: string) =>
  tabs(page).getByRole("link", { name: label, exact: true });
const profileButton = (page: Page) =>
  page.getByRole("button", { name: t.shell.profileAria("Alice") });

/** Click once hydrated (a click before hydration does nothing). */
async function openMenu(page: Page) {
  const button = profileButton(page).first();
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true")
      await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  return page.getByTestId("profile-menu");
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000);
  A = await apiAs(users.a);
  aId = (await A.auth.getUser()).data.user!.id;
  const first = await launch(browser, 390, 844, null);
  await signInUI(first.page, users.a, "/today");
  signedIn = await first.context.storageState();
  await first.context.close();
});

test("1: five tabs in order; PLANEJAR owns the planning screens; MAIS is gone", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await launch(browser);
  await a.page.goto("/today");
  await expect(tabs(a.page).getByRole("link")).toHaveText([
    "HOJE",
    "DUPLA",
    "FOCO",
    "PLANEJAR",
    "PROGRESSO",
  ]);
  await expect(tab(a.page, "HOJE")).toHaveAttribute("aria-current", "page");
  await expect(tabs(a.page).getByRole("link", { name: /MAIS/ })).toHaveCount(0);

  // DUPLA is the partner hub (the route stays /partner).
  await tab(a.page, "DUPLA").click();
  await expect(a.page).toHaveURL(/\/partner$/);
  await expect(tab(a.page, "DUPLA")).toHaveAttribute("aria-current", "page");

  // Every planning screen keeps PLANEJAR active (as a section, not the page).
  for (const path of ["/planner", "/goals", "/routine", "/challenges"]) {
    await a.page.goto(path);
    await expect(tab(a.page, "PLANEJAR")).toHaveAttribute(
      "aria-current",
      "true",
    );
    for (const other of ["HOJE", "DUPLA", "FOCO", "PROGRESSO"])
      await expect(tab(a.page, other)).not.toHaveAttribute("aria-current");
  }
  // Settings / duo: no tab is active.
  for (const path of ["/settings", "/duo"]) {
    await a.page.goto(path);
    await expect(tabs(a.page).locator("[aria-current]")).toHaveCount(0);
  }
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2: PLANEJAR — one row per planning screen; Back returns naturally", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await launch(browser);
  await a.page.goto("/today");
  await tab(a.page, "PLANEJAR").click();
  await expect(a.page).toHaveURL(/\/plan$/);
  await expect(
    a.page.getByRole("heading", { level: 1, name: t.plan.title }),
  ).toBeVisible();
  await expect(tab(a.page, "PLANEJAR")).toHaveAttribute("aria-current", "page");
  await expect(a.page.getByTestId("plan-routine")).toContainText(
    /\d+ (item ativo|itens ativos)/,
  );
  await expect(a.page.getByTestId("plan-challenges")).toContainText(
    t.plan.withPartner,
  );

  const rows: [string, RegExp, string][] = [
    ["plan-next", /\/planner$/, t.pageTitles.planner],
    ["plan-goals", /\/goals$/, ""],
    ["plan-routine", /\/routine$/, "ROTINA"],
    ["plan-challenges", /\/challenges$/, "DESAFIOS"],
  ];
  for (const [id, url, heading] of rows) {
    await a.page.getByTestId(id).click();
    await expect(a.page).toHaveURL(url);
    if (heading)
      await expect(
        a.page.getByRole("heading", { level: 1 }).first(),
      ).toContainText(new RegExp(heading, "i"));
    await a.page.goBack();
    await expect(a.page).toHaveURL(/\/plan$/);
  }
  await a.page.goBack();
  await expect(a.page).toHaveURL(/\/today$/);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("3: the profile menu — keyboard, Escape, outside click, its links", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await launch(browser);
  await a.page.goto("/today");
  const button = profileButton(a.page);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  const menu = await openMenu(a.page);
  await expect(button).toHaveAttribute(
    "aria-controls",
    (await menu.getAttribute("id"))!,
  );
  for (const name of [t.shell.account, t.shell.settings, t.shell.duo])
    await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    menu.getByRole("button", { name: t.shell.signOut }),
  ).toBeVisible();

  // ↓ walks the items; Escape closes and returns focus to the button.
  await a.page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("link", { name: t.shell.account, exact: true }),
  ).toBeFocused();
  await a.page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("link", { name: t.shell.settings, exact: true }),
  ).toBeFocused();
  await a.page.keyboard.press("ArrowUp");
  await a.page.keyboard.press("ArrowUp");
  await expect(
    menu.getByRole("button", { name: t.shell.signOut }),
  ).toBeFocused();
  await a.page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Enter opens it from the keyboard; a click outside closes it.
  await a.page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await a.page.getByTestId("today-pct").click();
  await expect(menu).toHaveCount(0);

  // Each link opens its screen and closes the menu.
  await (
    await openMenu(a.page)
  )
    .getByRole("link", { name: t.shell.settings, exact: true })
    .click();
  await expect(a.page).toHaveURL(/\/settings$/);
  await expect(menu).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await (
    await openMenu(a.page)
  )
    .getByRole("link", { name: t.shell.duo, exact: true })
    .click();
  await expect(a.page).toHaveURL(/\/duo$/);
  await (
    await openMenu(a.page)
  )
    .getByRole("link", { name: t.shell.account, exact: true })
    .click();
  await expect(a.page).toHaveURL(/\/settings#conta$/);
  await expect(a.page.locator("#conta")).toBeInViewport();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4: every deep link still opens directly; /more lands on PLANEJAR", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await launch(browser);
  const direct: [string, RegExp][] = [
    // /partner#duel right after /partner would be a same-document hash change
    // (no response); from /today it is a real document load, as a shared link.
    ["/today", /\/today$/],
    ["/partner#duel", /\/partner#duel$/],
    ["/partner", /\/partner$/],
    ["/focus", /\/focus$/],
    ["/plan", /\/plan$/],
    ["/progress", /\/progress$/],
    ["/planner", /\/planner$/],
    ["/goals", /\/goals$/],
    ["/routine", /\/routine$/],
    ["/challenges", /\/challenges$/],
    ["/duo", /\/duo$/],
    ["/settings", /\/settings$/],
    ["/more", /\/plan$/],
  ];
  for (const [path, url] of direct) {
    const res = await a.page.goto(path);
    expect(res?.ok(), path).toBe(true);
    await expect(a.page, path).toHaveURL(url);
    await expect(
      a.page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
  }
  await expect(a.page.getByTestId("duel-detailed")).toHaveCount(0);
  await a.page.goto("/partner#duel");
  await expect(a.page.getByTestId("duel-detailed")).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("5: Resume State — / restores PLANEJAR, an old /more value restores /plan, drafts stay; PWA start_url", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");

  // The installed app opens "/": it restores the last place (PLANEJAR).
  let a = await launch(browser);
  await a.page.goto("/plan");
  await expect(a.page.getByTestId("plan-next")).toBeVisible();
  await expect
    .poll(() =>
      a.page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? "{}").lastRoute?.path,
        key(aId),
      ),
    )
    .toBe("/plan");
  let saved = await a.context.storageState();
  await a.context.close();
  a = await launch(browser, 390, 844, saved);
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/plan$/, { timeout: RESTORE });

  // A value saved before this change (on /more) restores /plan and keeps
  // the unsent draft.
  await a.page.evaluate(
    ([k, at]) => {
      const v = JSON.parse(localStorage.getItem(k) ?? "{}");
      v.lastRoute = { path: "/more", at };
      v.drafts = {
        task: {
          name: "Rascunho da IA",
          repeat: false,
          repeatMode: "daily",
          days: [],
          time: "",
          reminder: false,
          category: "work_study",
          visible: true,
          notes: "",
          updatedAt: at,
        },
      };
      localStorage.setItem(k, JSON.stringify(v));
    },
    [key(aId), Date.now()] as const,
  );
  saved = await a.context.storageState();
  await a.context.close();
  a = await launch(browser, 390, 844, saved);
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/plan$/, { timeout: RESTORE });
  await a.page.goto("/today");
  await a.page.getByRole("button", { name: t.todayScreen.addTaskAria }).click();
  await expect(
    a.page.getByPlaceholder(t.taskSheet.namePlaceholder),
  ).toHaveValue("Rascunho da IA");
  await a.page.keyboard.press("Escape");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("6: Sair in the profile menu signs out and forgets this device's resume", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await launch(browser, 390, 844, null);
  await signInUI(a.page, users.a, "/plan");
  await expect
    .poll(() => a.page.evaluate((k) => localStorage.getItem(k), key(aId)))
    .not.toBeNull();
  await (
    await openMenu(a.page)
  )
    .getByRole("button", { name: t.shell.signOut })
    .click();
  await expect(a.page).toHaveURL(/\/login$/);
  expect(
    await a.page.evaluate((k) => localStorage.getItem(k), key(aId)),
  ).toBeNull();
  await a.page.goto("/plan");
  await expect(a.page).toHaveURL(/\/login\?next=%2Fplan$/);
  // Signing in again from "/" opens Today (nothing to restore).
  await signInUI(a.page, users.a, "/today");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

const WIDTHS: [number, number][] = [
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1180, 820],
  [1440, 900],
];
const SCREENS = ["/today", "/partner", "/focus", "/plan", "/progress"];

test("7: 375 → 1440 — no horizontal scroll, labels fit, the right navigation", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const shots = process.env.LI_IA_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  for (const [w, h] of WIDTHS) {
    const a = await launch(browser, w, h);
    for (const path of SCREENS) {
      await a.page.goto(path);
      await expect(
        a.page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      await a.page.waitForTimeout(500);
      const overflow = await a.page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} @${w}`).toBeLessThanOrEqual(0);
      if (w < 780) {
        await expect(tabs(a.page)).toBeVisible();
        // No tab label is clipped.
        const clipped = await tabs(a.page)
          .getByRole("link")
          .evaluateAll((links) =>
            links
              .map((l) => l.lastElementChild as HTMLElement)
              .filter((s) => s.scrollWidth > s.clientWidth + 1)
              .map((s) => s.textContent),
          );
        expect(clipped, `${path} @${w}`).toEqual([]);
        await expect(profileButton(a.page)).toBeVisible();
      } else {
        await expect(tabs(a.page)).toBeHidden();
        const side = a.page.getByRole("navigation", { name: t.shell.mainNav });
        await expect(
          side.getByRole("link", { name: "Planejar" }),
        ).toBeVisible();
        await expect(side.getByRole("link", { name: "Planner" })).toBeVisible();
        await expect(profileButton(a.page)).toBeVisible();
      }
      if (shots)
        await a.page.screenshot({
          path: `${shots}/${w}${path.replace("/", "-")}.png`,
          fullPage: false,
        });
    }
    expect(a.errors, `@${w}`).toEqual([]);
    await a.context.close();
  }
});
