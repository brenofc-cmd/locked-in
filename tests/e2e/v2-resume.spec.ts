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
  finishFocus,
  resetTasks,
  signInUI,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * V2 Phase 1 — Resume State (docs/RESUME_STATE.md, ADR-055). Real sign-in,
 * real browser storage; "closing the app" is closing the browser context and
 * opening a new one with the same cookies + localStorage (what a phone does
 * when the tab or the installed app is killed and reopened). Alice (A) and
 * Bruno (B) share this device in the isolation test. Runs after stage9.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let aId: string;
let bId: string;

const key = (id: string) => `locked-in:v2:${id}:resume`;

/** "/" → the restored route loads the whole app layout (remote DEV). */
const RESTORE = 15_000;

type Opened = { context: BrowserContext; page: Page; errors: string[] };
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** A new "app launch" with this project's device and, optionally, a saved state. */
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

/** Close the app and open it again on the same device. */
async function relaunch(browser: Browser, app: Opened): Promise<Opened> {
  const state = await app.context.storageState();
  expect(app.errors).toEqual([]);
  await app.context.close();
  return launch(browser, state);
}

async function signedIn(browser: Browser, user: TestUser, path: string) {
  const app = await launch(browser);
  await signInUI(app.page, user, path);
  return app;
}

const stored = (page: Page, id: string) =>
  page.evaluate((k) => localStorage.getItem(k), key(id));

const RANGE = { "7D": "7", "30D": "30", "90D": "90", YEAR: "Y" } as const;
const rangeRadio = (page: Page, label: keyof typeof RANGE) =>
  page
    .getByRole("radiogroup", { name: t.progressScreen.rangeAria })
    .getByRole("radio", {
      name: t.progressScreen.ranges[RANGE[label]].long,
      exact: true,
    });

const monthLabel = (page: Page) =>
  page
    .locator("section")
    .filter({
      has: page.getByRole("button", { name: t.progressScreen.prevMonth }),
    })
    .locator("h2");

const addButton = (page: Page) =>
  page.getByRole("button", { name: /Adicionar tarefa/ }).first();
const addSheet = (page: Page) =>
  page.getByRole("dialog", { name: t.sheetLabels.add });
const nameField = (page: Page) =>
  addSheet(page).getByPlaceholder(t.taskSheet.namePlaceholder);

const mainScroll = (page: Page) =>
  page.locator("main").evaluate((m) => m.scrollTop);

/** Nothing sensitive is ever in this origin's localStorage. */
async function assertNoSecrets(page: Page, email: string) {
  const all = await page.evaluate(() =>
    Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? ""]),
  );
  for (const [k, v] of all) {
    expect(`${k}=${v}`).not.toMatch(
      /access_token|refresh_token|provider_token|eyJ[\w-]{10,}\.|password|senha|sb-[a-z0-9]+-auth-token/i,
    );
    expect(v).not.toContain(email);
  }
}

async function oneTaskToday(api: Api, title: string) {
  await resetTasks(api);
  const { data: me } = await api.auth.getUser();
  const today = (await api.rpc("my_today")).data!;
  const { error } = await api.from("daily_tasks").insert({
    owner_id: me.user!.id,
    task_date: today,
    title,
    status: "pending",
    visible_to_partner: false,
  });
  if (error) throw new Error(error.message);
}

test.beforeAll(async () => {
  test.setTimeout(120_000); // resets several DEV users
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  aId = (await A.auth.getUser()).data.user!.id;
  bId = (await B.auth.getUser()).data.user!.id;
  // Solo users with one task today (Progress shows its screen, not the empty state).
  for (const [api, title] of [
    [A, "V2 tarefa A"],
    [B, "V2 tarefa B"],
  ] as const) {
    await api.rpc("leave_duo");
    await oneTaskToday(api, title);
  }
});

test.afterAll(async () => {
  await finishFocus(A);
});

test("1: Progress 30D and its scroll come back when the app reopens at /", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  let app = await signedIn(browser, users.a, "/progress");
  await rangeRadio(app.page, "30D").click();
  await expect(rangeRadio(app.page, "30D")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Scroll the screen (the app scrolls <main>), then let the throttle write it.
  await app.page.locator("main").evaluate((m) => m.scrollTo(0, 420));
  const y = await mainScroll(app.page);
  expect(y).toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        JSON.parse((await stored(app.page, aId)) ?? "{}").scroll?.["/progress"]
          ?.y,
    )
    .toBe(y);
  await assertNoSecrets(app.page, users.a.email());

  app = await relaunch(browser, app);
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/progress$/, { timeout: RESTORE });
  await expect(rangeRadio(app.page, "30D")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(rangeRadio(app.page, "7D")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect.poll(() => mainScroll(app.page)).toBe(y);
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("2: History — an earlier calendar month stays open after reopening", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  let app = await signedIn(browser, users.a, "/progress");
  const current = await monthLabel(app.page).innerText();
  await app.page
    .getByRole("button", { name: t.progressScreen.prevMonth })
    .click();
  await expect(monthLabel(app.page)).not.toHaveText(current);
  const previous = await monthLabel(app.page).innerText();

  app = await relaunch(browser, app);
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/progress$/, { timeout: RESTORE });
  await expect(monthLabel(app.page)).toHaveText(previous);
  // Back to the current month: that is the default again (nothing kept).
  await app.page
    .getByRole("button", { name: t.progressScreen.nextMonth })
    .click();
  await expect(monthLabel(app.page)).toHaveText(current);
  await expect
    .poll(
      async () =>
        JSON.parse((await stored(app.page, aId)) ?? "{}").progress?.month,
    )
    .toBeUndefined();
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("3: Focus is restored from the database, never from Resume State", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await finishFocus(A);
  const started = await A.rpc("start_focus_session", {
    p_title: "V2 foco",
    p_planned_seconds: 1500,
  });
  expect(started.error).toBeNull();
  const sessionId = started.data![0].id;
  const overlay = (p: Page) =>
    p.getByRole("dialog", { name: t.focusUi.sessionAria });

  let app = await signedIn(browser, users.a, "/focus");
  await expect(overlay(app.page)).toBeVisible();
  await app.page.reload();
  await expect(overlay(app.page)).toBeVisible();
  await expect(app.page.getByRole("timer")).toBeVisible();

  app = await relaunch(browser, app);
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/focus$/, { timeout: RESTORE });
  await expect(overlay(app.page)).toBeVisible();
  const raw = (await stored(app.page, aId)) ?? "";
  for (const leak of [
    sessionId,
    "V2 foco",
    "planned",
    "started",
    "paused",
    "left",
  ])
    expect(raw).not.toContain(leak);
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
    expect.arrayContaining(["lastRoute", "v"]),
  );

  // Ended elsewhere (the database): the reopened app follows the database.
  await finishFocus(A);
  await app.page.reload();
  await expect(overlay(app.page)).toHaveCount(0);
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("4: an explicit URL wins over the last route", async ({ browser }) => {
  test.setTimeout(90_000);
  let app = await signedIn(browser, users.a, "/progress");
  await expect(rangeRadio(app.page, "7D")).toBeVisible();
  app = await relaunch(browser, app);
  await app.page.goto("/today");
  await expect(app.page).toHaveURL(/\/today$/);
  await app.page.waitForTimeout(1000);
  await expect(app.page).toHaveURL(/\/today$/);
  // Browser back / forward between screens behave as before.
  await app.page
    .getByRole("link", { name: /PROGRESSO|Progresso/ })
    .first()
    .click();
  await expect(app.page).toHaveURL(/\/progress$/);
  await app.page.goBack();
  await expect(app.page).toHaveURL(/\/today$/);
  await app.page.goForward();
  await expect(app.page).toHaveURL(/\/progress$/);
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("5: sign-out clears the user's context; the next user on the device gets nothing", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const app = await signedIn(browser, users.a, "/progress");
  await rangeRadio(app.page, "90D").click();
  await app.page.goto("/today");
  await addButton(app.page).click();
  await nameField(app.page).fill("Rascunho da Alice");
  await expect.poll(() => stored(app.page, aId)).toContain("Rascunho da Alice");
  await app.page.keyboard.press("Escape");

  // Explicit sign-out.
  await app.page.goto("/settings");
  await app.page
    .getByRole("button", { name: t.settings.signOut, exact: true })
    .click();
  await expect(app.page).toHaveURL(/\/login$/);
  expect(await stored(app.page, aId)).toBeNull();

  // Bruno signs in on the same browser.
  await signInUI(app.page, users.b, "/today");
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/today$/, { timeout: RESTORE });
  await addButton(app.page).click();
  await expect(nameField(app.page)).toHaveValue("");
  await app.page.keyboard.press("Escape");
  await app.page.goto("/progress");
  await expect(rangeRadio(app.page, "7D")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await mainScroll(app.page)).toBe(0);
  const keys = await app.page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((k) => k.includes(aId))).toEqual([]);
  expect((await stored(app.page, bId)) ?? "").not.toContain("Alice");
  expect(app.errors).toEqual([]);
  await app.context.close();

  // Without an explicit sign-out (expired session, cookies cleared), the
  // keys are per user anyway: Bruno never reads Alice's context.
  const alice = await signedIn(browser, users.a, "/progress");
  await rangeRadio(alice.page, "YEAR").click();
  await alice.context.clearCookies();
  await signInUI(alice.page, users.b, "/today");
  await alice.page.goto("/");
  await expect(alice.page).toHaveURL(/\/today$/, { timeout: RESTORE });
  await alice.page.goto("/progress");
  await expect(rangeRadio(alice.page, "7D")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await stored(alice.page, aId)).toContain('"range":"Y"');
  expect(alice.errors).toEqual([]);
  await alice.context.close();
});

test("6: corrupted or hostile local state cannot break the app", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const app = await signedIn(browser, users.a, "/today");
  for (const junk of [
    "{not json",
    "null",
    '{"v":1,"lastRoute":{"path":"/login","at":1}}',
    `{"v":1,"lastRoute":{"path":"https://evil.example","at":${Date.now()}}}`,
    `{"v":1,"lastRoute":{"path":"//evil.example","at":${Date.now()}}}`,
    `{"v":99,"lastRoute":{"path":"/progress","at":${Date.now()}}}`,
    `{"v":1,"progress":{"range":"<img>","month":"9999-99"},"drafts":{"task":{"name":{}}}}`,
  ]) {
    await app.page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [key(aId), junk],
    );
    await app.page.goto("/");
    await expect(app.page).toHaveURL(/\/today$/, { timeout: RESTORE });
    await expect(app.page.getByRole("main")).toBeVisible();
  }
  await app.page.goto("/progress");
  await expect(rangeRadio(app.page, "7D")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await app.page.goto("/today");
  await addButton(app.page).click();
  await expect(nameField(app.page)).toHaveValue("");
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("7: auth links, reset and sign-in redirects are never overridden", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const app = await signedIn(browser, users.a, "/progress");
  await expect(rangeRadio(app.page, "7D")).toBeVisible();
  expect(await stored(app.page, aId)).toContain("/progress");

  // Email link callback: its own redirect, not the last route.
  const res = await app.page.request.get(
    "/auth/confirm?token_hash=invalid&type=recovery&next=/reset-password",
    { maxRedirects: 0 },
  );
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/login\?error=link$/);

  // The reset page stays the reset page for a signed-in user.
  await app.page.goto("/reset-password");
  await expect(app.page).toHaveURL(/\/reset-password$/);
  await app.page.waitForTimeout(800);
  await expect(app.page).toHaveURL(/\/reset-password$/);

  // Signed out: "/" goes to sign-in (nothing restored), and ?next wins after it.
  await app.context.clearCookies();
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/login$/);
  await signInUI(app.page, users.a, "/focus");
  await expect(app.page).toHaveURL(/\/focus$/);
  expect(app.errors).toEqual([]);
  await app.context.close();
});

test("8: a Quick Add draft survives closing the app and goes away on submit", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  let app = await signedIn(browser, users.a, "/today");
  await addButton(app.page).click();
  await nameField(app.page).fill("Revisar Física cap. 3");
  await expect
    .poll(() => stored(app.page, aId))
    .toContain("Revisar Física cap. 3");

  // Closed with the sheet open: it does not reopen by itself.
  app = await relaunch(browser, app);
  await app.page.goto("/");
  await expect(app.page).toHaveURL(/\/today$/, { timeout: RESTORE });
  await expect(addSheet(app.page)).toHaveCount(0);
  await addButton(app.page).click();
  await expect(nameField(app.page)).toHaveValue("Revisar Física cap. 3");

  await addSheet(app.page)
    .getByRole("button", { name: t.taskSheet.add })
    .click();
  await expect(addSheet(app.page)).toHaveCount(0);
  await expect(
    app.page.getByText("Revisar Física cap. 3", { exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await A.from("daily_tasks")
        .select("title")
        .eq("title", "Revisar Física cap. 3");
      return data?.length;
    })
    .toBe(1);
  expect(await stored(app.page, aId)).not.toContain("Revisar Física");
  await addButton(app.page).click();
  await expect(nameField(app.page)).toHaveValue("");
  await app.page.keyboard.press("Escape");
  expect(app.errors).toEqual([]);
  await app.context.close();
});
