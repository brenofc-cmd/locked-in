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
 * V2 Phase 3 — METAS & VISÃO: vision, goals, milestones and the mirror, all
 * private to the owner. Alice (A) and Bruno (B) are a duo, Carla (C) is an
 * outsider. Real browser storage for drafts and Resume State. Runs after
 * the Phase 2 project (same shared users).
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let aId: string;

const RESTORE = 15_000;
type Opened = { context: BrowserContext; page: Page; errors: string[] };
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

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

async function open(browser: Browser, user: TestUser, path: string) {
  const app = await launch(browser);
  await signInUI(app.page, user, path);
  return app;
}

const section = (page: Page, name: keyof typeof t.goals.sections) =>
  page.getByRole("radio", { name: t.goals.sections[name], exact: true });
const dialog = (page: Page) => page.getByRole("dialog");
const titleField = (page: Page) =>
  dialog(page).getByRole("textbox", { name: t.goals.fields.title });
const save = (page: Page) =>
  dialog(page).getByRole("button", { name: t.goals.save });

async function clearGoals(api: Api) {
  const { data } = await api.auth.getUser();
  const id = data.user!.id;
  await api.from("goals").delete().eq("owner_id", id);
  await api.from("vision_items").delete().eq("owner_id", id);
  await api.from("accountability_items").delete().eq("owner_id", id);
}

test.beforeAll(async () => {
  test.setTimeout(120_000); // resets several DEV users
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  aId = (await A.auth.getUser()).data.user!.id;
  for (const api of [A, B, C]) {
    await resetTasks(api);
    await clearGoals(api);
    await api.rpc("leave_duo");
  }
  await makeDuo(A, B);
});

test.afterAll(async () => {
  for (const api of [A, B, C]) await clearGoals(api);
});

test("1: A creates a vision; it survives a refresh", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/goals");
  await expect(section(a.page, "vision")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(a.page.getByText(t.goals.empty.vision)).toBeVisible();
  await a.page.getByRole("button", { name: t.goals.addVision }).click();
  await titleField(a.page).fill("Ter independência financeira");
  await dialog(a.page)
    .getByRole("textbox", { name: t.goals.fields.description })
    .fill("Construir algo meu que me dê liberdade.");
  await save(a.page).click();
  await expect(dialog(a.page)).toHaveCount(0);
  await a.page.reload();
  await expect(a.page.getByText("Ter independência financeira")).toBeVisible();
  await expect(
    a.page.getByText("Construir algo meu que me dê liberdade."),
  ).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2 + 3 + 4: a 90-day goal linked to the vision; achieved stays in CONCLUÍDAS; archive leaves the active list", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/goals");
  await section(a.page, "goals").click();
  await expect(a.page.getByText(t.goals.empty.goals)).toBeVisible();

  // 2 · create, link, refresh.
  await a.page.getByRole("button", { name: t.goals.addGoal }).click();
  await titleField(a.page).fill("Lançar um produto pago");
  await dialog(a.page)
    .getByRole("radio", { name: t.goals.types["90_day"] })
    .click();
  await dialog(a.page)
    .getByLabel(t.goals.fields.vision)
    .selectOption({ label: "Ter independência financeira" });
  await save(a.page).click();
  await expect(dialog(a.page)).toHaveCount(0);
  await a.page.reload();
  const group = a.page.getByRole("region", { name: t.goals.types["90_day"] });
  await expect(group.getByText("Lançar um produto pago")).toBeVisible();
  await expect(group.getByText("TER INDEPENDÊNCIA FINANCEIRA")).toBeVisible();
  await expect(a.page.getByRole("main").getByText(/%/)).toHaveCount(0); // no fake percentage

  // A milestone (a count, never a percentage).
  await group
    .getByRole("button", { name: /^(?!Mover).*Lançar um produto pago/ })
    .click();
  await dialog(a.page)
    .getByRole("textbox", { name: t.goals.fields.milestonePlaceholder })
    .fill("domínio");
  await dialog(a.page)
    .getByRole("button", { name: t.goals.fields.addMilestone })
    .click();
  await expect(
    dialog(a.page).getByRole("checkbox", {
      name: t.goals.toggleMilestone("domínio"),
    }),
  ).toBeVisible();
  await a.page.keyboard.press("Escape");
  await expect(group.getByText("0 de 1 marco")).toBeVisible();

  // 3 · achieve.
  await group
    .getByRole("button", { name: /^(?!Mover).*Lançar um produto pago/ })
    .click();
  await dialog(a.page).getByRole("button", { name: t.goals.achieve }).click();
  await expect(dialog(a.page)).toHaveCount(0);
  await expect(
    a.page.getByRole("region", { name: t.goals.types["90_day"] }),
  ).toHaveCount(0);
  const done = a.page.getByText(t.goals.achievedSection(1));
  await expect(done).toBeVisible();
  await a.page.reload();
  await a.page.getByText(t.goals.achievedSection(1)).click();
  await expect(a.page.getByText("Lançar um produto pago")).toBeVisible();
  const row = (
    await A.from("goals")
      .select("status, achieved_at")
      .eq("title", "Lançar um produto pago")
      .single()
  ).data!;
  expect(row.status).toBe("achieved");
  expect(row.achieved_at).not.toBeNull();

  // 4 · a monthly goal, then archive it.
  await a.page.getByRole("button", { name: t.goals.addGoal }).click();
  await titleField(a.page).fill("Ler 2 livros");
  await dialog(a.page)
    .getByRole("radio", { name: t.goals.types.monthly })
    .click();
  await save(a.page).click();
  const monthly = a.page.getByRole("region", { name: t.goals.types.monthly });
  await expect(monthly.getByText("Ler 2 livros")).toBeVisible();
  await monthly
    .getByRole("button", { name: /^(?!Mover).*Ler 2 livros/ })
    .click();
  await dialog(a.page).getByRole("button", { name: t.goals.archive }).click();
  await expect(
    a.page.getByRole("region", { name: t.goals.types.monthly }),
  ).toHaveCount(0);
  await expect(a.page.getByText(t.goals.archivedSection(1))).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("5: A adds a mirror item; it survives a refresh; deactivate moves it away", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/goals");
  await section(a.page, "mirror").click();
  await expect(a.page.getByText(t.goals.mirrorSub)).toBeVisible();
  await expect(a.page.getByText(t.goals.empty.mirror)).toBeVisible();
  for (const text of [
    "Eu adio coisas difíceis.",
    "Perco foco com o celular.",
  ]) {
    await a.page.getByRole("button", { name: t.goals.addMirror }).click();
    await dialog(a.page).getByLabel(t.goals.fields.mirror).fill(text);
    await save(a.page).click();
    await expect(dialog(a.page)).toHaveCount(0);
  }
  await a.page.reload();
  await expect(section(a.page, "mirror")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(a.page.getByText("Eu adio coisas difíceis.")).toBeVisible();

  // Keyboard reorder: the second moves up.
  await a.page
    .getByRole("button", { name: t.goals.moveUp("Perco foco com o celular.") })
    .focus();
  await a.page.keyboard.press("Enter");
  await expect
    .poll(async () =>
      (
        await A.from("accountability_items").select("text").order("sort_order")
      ).data!.map((r) => r.text),
    )
    .toEqual(["Perco foco com o celular.", "Eu adio coisas difíceis."]);

  await a.page
    .getByRole("button", { name: "Eu adio coisas difíceis.", exact: true })
    .click();
  await dialog(a.page)
    .getByRole("button", { name: t.goals.deactivate })
    .click();
  await expect(a.page.getByText(t.goals.inactiveSection(1))).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("6 + 7 + 8: partner and outsider see nothing; A cannot reference B's vision or goal", async () => {
  // Owner has data.
  expect(
    (await A.from("vision_items").select("id")).data!.length,
  ).toBeGreaterThan(0);
  expect((await A.from("goals").select("id")).data!.length).toBeGreaterThan(0);
  expect(
    (await A.from("accountability_items").select("id")).data!.length,
  ).toBeGreaterThan(0);

  for (const other of [B, C]) {
    for (const table of [
      "vision_items",
      "goals",
      "goal_milestones",
      "accountability_items",
    ] as const) {
      const res = await other.from(table).select("id").eq("owner_id", aId);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    }
    const upd = await other
      .from("goals")
      .update({ title: "hacked" })
      .eq("owner_id", aId)
      .select();
    expect(upd.data ?? []).toEqual([]);
    const del = await other
      .from("accountability_items")
      .delete()
      .eq("owner_id", aId)
      .select();
    expect(del.data ?? []).toEqual([]);
  }

  // B's own vision and goal.
  const bVision = (
    await B.from("vision_items")
      .insert({ title: "Visão do Bruno" })
      .select()
      .single()
  ).data!;
  const bGoal = (
    await B.from("goals")
      .insert({ title: "Meta do Bruno", goal_type: "monthly" })
      .select()
      .single()
  ).data!;
  const idor = await A.from("goals").insert({
    title: "IDOR",
    goal_type: "monthly",
    vision_id: bVision.id,
  });
  expect(idor.error?.code).toBe("23503");
  const ms = await A.from("goal_milestones").insert({
    goal_id: bGoal.id,
    title: "IDOR",
  });
  expect(ms.error?.code).toBe("23503");
  const spoof = await A.from("vision_items").insert({
    owner_id: (await B.auth.getUser()).data.user!.id,
    title: "x",
  });
  expect(spoof.error?.code).toBe("42501");
  expect(
    (await B.from("goal_milestones").select("id").eq("goal_id", bGoal.id)).data,
  ).toEqual([]);
});

test("9: a new-goal draft comes back after closing the app", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  let a = await open(browser, users.a, "/goals");
  await section(a.page, "goals").click();
  await a.page.getByRole("button", { name: t.goals.addGoal }).click();
  await titleField(a.page).fill("Correr 10 km (rascunho)");
  await dialog(a.page)
    .getByRole("radio", { name: t.goals.types.long_term })
    .click();
  await a.page.waitForTimeout(300);
  const state = await a.context.storageState();
  await a.context.close();

  a = await launch(browser, state);
  await a.page.goto("/goals");
  await expect(dialog(a.page)).toHaveCount(0);
  await a.page.getByRole("button", { name: t.goals.addGoal }).click();
  await expect(titleField(a.page)).toHaveValue("Correr 10 km (rascunho)");
  await expect(
    dialog(a.page).getByRole("radio", { name: t.goals.types.long_term }),
  ).toHaveAttribute("aria-checked", "true");
  await save(a.page).click();
  await expect(dialog(a.page)).toHaveCount(0);
  await a.page.getByRole("button", { name: t.goals.addGoal }).click();
  await expect(titleField(a.page)).toHaveValue(""); // submitted → gone
  await a.page.keyboard.press("Escape");
  const raw = await a.page.evaluate(() =>
    Object.values(localStorage).join("\n"),
  );
  expect(raw).not.toContain("Ter independência financeira"); // no stored data
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("10: / reopens /goals on the mirror", async ({ browser }) => {
  test.setTimeout(90_000);
  let a = await open(browser, users.a, "/goals");
  await section(a.page, "mirror").click();
  await expect(a.page.getByText(t.goals.mirrorSub)).toBeVisible();
  const state = await a.context.storageState();
  await a.context.close();
  a = await launch(browser, state);
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/goals$/, { timeout: RESTORE });
  await expect(section(a.page, "mirror")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(a.page.getByText("Perco foco com o celular.")).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});
