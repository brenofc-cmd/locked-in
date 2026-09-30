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
 * V2 Phase 6 — Duo Accountability 2.0 (docs/ACCOUNTABILITY.md). Alice (A)
 * and Bruno (B) are a duo, Carla (C) becomes Alice's next partner. A
 * commitment is proven only by real actions; the partner sees the public
 * title, the status, the generic proof kind and time — never the private
 * source. Runs after Phase 5 (same shared users).
 */
test.describe.configure({ mode: "serial" });

const A_ = t.accountability;
const LIVE = 15_000;
const SECRET = "Treino secreto das 6h";
const PROMISE = "Treinar hoje";

let A: Api;
let B: Api;
let C: Api;
let aId: string;

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
    await fixture(api, "dev_fixture_reset_accountability");
    await resetTasks(api);
    await finishFocus(api);
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

async function commit(api: Api, title: string, kind = "simple") {
  const { data, error } = await api.rpc("create_commitment", {
    p_title: title,
    p_kind: kind,
  });
  if (error || !data?.[0]) throw new Error(`commitment: ${error?.message}`);
  return data[0].id;
}

const partnerItem = (page: Page, title: string) =>
  page.getByTestId("partner-commitment").filter({ hasText: title });
const myItem = (page: Page, title: string) =>
  page.getByTestId("my-commitment").filter({ hasText: title });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  aId = (await A.auth.getUser()).data.user!.id;
  await resetAll();
  await makeDuo(A, B);
});

test.afterAll(async () => {
  await resetAll();
  await makeDuo(A, B);
});

test("1: A commits on a private task; B sees it live, then PROVEN — never the task", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await oneOff(A, SECRET, false);
  const b = await open(browser, users.b, "/partner");
  await expect(b.page.getByTestId("partner-commitments")).toContainText(
    A_.nonePartner("Alice"),
  );

  const a = await open(browser, users.a, "/partner");
  const writes = trackWrites(a.page);
  await a.page.getByTestId("new-commitment").click();
  const sheet = a.page.getByRole("dialog", { name: t.sheetLabels.commitment });
  await sheet.getByTestId("commitment-title").fill(PROMISE);
  await expect(sheet.getByTestId("commitment-kind-task")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await sheet.getByTestId("commitment-task").selectOption({ label: SECRET });
  await sheet.getByTestId("commitment-submit").click();
  await expect(sheet).toBeHidden();
  await writes.idle();
  await expect(myItem(a.page, PROMISE)).toHaveAttribute(
    "data-status",
    "active",
  );

  // B, without reloading: the commitment arrives through commitment_changed.
  const item = partnerItem(b.page, PROMISE);
  await expect(item).toHaveAttribute("data-status", "active", {
    timeout: LIVE,
  });
  await expect(item.getByTestId("commitment-status")).toContainText(
    A_.status.active,
  );

  // A does the work (Today): the commitment is proven by the real task.
  await a.page.goto("/today");
  await a.page.getByRole("checkbox", { name: SECRET, exact: true }).click();
  await writes.idle();

  await expect(item).toHaveAttribute("data-status", "proven", {
    timeout: LIVE,
  });
  await expect(item.getByTestId("commitment-resolution")).toHaveText(
    A_.verified,
  );
  await expect(item.getByTestId("commitment-proof")).toHaveText(
    new RegExp(`${A_.proofKinds.task} · \\d\\d:\\d\\d`),
  );
  await expect(b.page.getByTestId("partner-day-line")).toContainText(
    A_.summary(1, 1),
  );
  // The feed line is the public title; B can react to it.
  await expect(
    b.page
      .getByTestId("activity-item")
      .filter({ hasText: t.feed.commitmentProven(PROMISE) }),
  ).toBeVisible({ timeout: LIVE });
  await expect(item.getByTestId("react-button")).toBeVisible();

  // Private source: never on B's screen, never readable by B.
  await expect(b.page.getByText(SECRET)).toHaveCount(0);
  expect(await b.page.content()).not.toContain(SECRET);
  expect((await B.from("commitment_sources").select("*")).data).toEqual([]);

  // Undone the same day: the proof goes away (the source is the truth).
  await a.page.getByRole("checkbox", { name: SECRET, exact: true }).click();
  await writes.idle();
  await expect(item).toHaveAttribute("data-status", "active", {
    timeout: LIVE,
  });

  await b.page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (x) =>
          x.playState !== "running" ||
          x.effect?.getTiming().iterations === Infinity,
      ),
  );
  const axe = await new AxeBuilder({ page: b.page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("2: DAR UM TOQUE reaches A; spam is blocked by the database", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/today");
  const b = await open(browser, users.b, "/partner");
  const item = partnerItem(b.page, PROMISE);
  await item.getByTestId("nudge-button").click();

  await expect(a.page.getByText(A_.nudgeToast("Bruno"))).toBeVisible({
    timeout: LIVE,
  });
  await expect(item.getByTestId("nudge-button")).toBeDisabled();
  await expect(item.getByTestId("nudge-button")).toContainText("NOVO TOQUE EM");

  // Same commitment again (API, bypassing the disabled button): refused.
  const again = await B.from("nudges").insert({
    commitment_id: await idOf(A, PROMISE),
  });
  expect(again.error?.message).toBe("LI_NUDGE_COOLDOWN");
  // Three per day to the same partner: the fourth is refused.
  for (const title of ["Ler 20 páginas", "Beber 2 L de água"])
    await B.from("nudges").insert({ commitment_id: await commit(A, title) });
  const fourth = await B.from("nudges").insert({
    commitment_id: await commit(A, "Dormir às 23h"),
  });
  expect(fourth.error?.message).toBe("LI_NUDGE_LIMIT");
  // Never myself, never free text.
  const self = await A.from("nudges").insert({
    commitment_id: await idOf(A, PROMISE),
  });
  expect(self.error?.message).toBe("LI_NUDGE_SELF");
  expect((await A.from("nudges").select("id")).data).toHaveLength(3);

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

async function idOf(api: Api, title: string) {
  const { data } = await api
    .from("commitments")
    .select("id")
    .eq("owner_id", aId)
    .eq("title", title)
    .single();
  return data!.id;
}

test("3: check-in and CUMPRI (AUTODECLARADO) arrive live", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/partner");
  const b = await open(browser, users.b, "/partner");
  const writes = trackWrites(a.page);

  await a.page.getByTestId("checkin-NEED_ACCOUNTABILITY").click();
  await writes.idle();
  await expect(b.page.getByTestId("partner-checkin")).toContainText(
    A_.checkinStates.NEED_ACCOUNTABILITY,
    { timeout: LIVE },
  );
  await a.page.getByTestId("checkin-LOCKED_IN").click();
  await writes.idle();
  await expect(b.page.getByTestId("partner-checkin")).toContainText(
    A_.checkinStates.LOCKED_IN,
    { timeout: LIVE },
  );
  // History is kept in the database.
  expect((await A.from("checkins").select("state")).data).toHaveLength(2);

  await myItem(a.page, "Ler 20 páginas").getByTestId("cumpri-button").click();
  await writes.idle();
  const item = partnerItem(b.page, "Ler 20 páginas");
  await expect(item).toHaveAttribute("data-status", "proven", {
    timeout: LIVE,
  });
  await expect(item.getByTestId("commitment-resolution")).toHaveText(
    A_.selfDeclared,
  );
  await expect(
    b.page
      .getByTestId("activity-item")
      .filter({ hasText: t.feed.commitmentSelfDeclared("Ler 20 páginas") }),
  ).toBeVisible({ timeout: LIVE });

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("4: when A's day closes, open commitments are MISSED and final", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await fixture(A, "dev_fixture_close_today");
  const b = await open(browser, users.b, "/partner");
  const history = b.page.getByTestId("history-commitment");
  await expect(history.filter({ hasText: PROMISE })).toHaveAttribute(
    "data-status",
    "missed",
  );
  await expect(
    history.filter({ hasText: PROMISE }).getByTestId("commitment-status"),
  ).toContainText(A_.status.missed);
  await expect(history.filter({ hasText: "Ler 20 páginas" })).toHaveAttribute(
    "data-status",
    "proven",
  );
  await expect(partnerItem(b.page, PROMISE)).toHaveCount(0);

  // Final: no cancel, no nudge, no undo on a closed day.
  const id = await idOf(A, PROMISE);
  const cancel = await A.from("commitments")
    .update({ status: "cancelled" })
    .eq("id", id);
  expect(cancel.error?.message).toBe("LI_HISTORY_LOCKED");
  const late = await B.from("nudges").insert({ commitment_id: id });
  expect(late.error?.message).toBe("LI_NUDGE_CLOSED");
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test("5: a new partner never receives the old duo's history", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await makeDuo(A, C);
  const c = await open(browser, users.c, "/partner");
  await expect(c.page.getByTestId("partner-commitments")).toContainText(
    A_.nonePartner("Alice"),
  );
  await expect(c.page.getByText(PROMISE)).toHaveCount(0);
  await expect(c.page.getByTestId("history-commitment")).toHaveCount(0);
  expect((await C.from("commitments").select("id")).data).toEqual([]);
  expect(
    (await C.rpc("duo_commitments", { p_from: "2000-01-01" })).data,
  ).toEqual([]);
  expect((await C.from("checkins").select("id")).data).toEqual([]);
  // The old partner lost access too.
  expect((await B.from("commitments").select("id")).data).toEqual([]);
  expect((await B.from("nudges").select("id")).data).toEqual([]);
  // The owner keeps their own history.
  expect(
    ((await A.from("commitments").select("id")).data ?? []).length,
  ).toBeGreaterThan(0);
  expect(c.errors).toEqual([]);
  await c.context.close();
});
