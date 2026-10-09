import AxeBuilder from "@axe-core/playwright";
import { t } from "@/i18n/pt-BR";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { addDays } from "@/lib/local-date";
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
 * V2 Phase 4 — North Star + Morning Experience: the featured vision / goal /
 * mirror on Today, the Top 3 of real tasks and the morning card once per
 * user and day. Alice (A) and Bruno (B) are a duo, Carla (C) has nothing.
 * Real browser storage. Runs after the Phase 3 project (same shared users).
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let aId: string;
let bId: string;
let T: string;

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function launch(browser: Browser): Promise<Opened> {
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
  return { context, page, errors };
}

async function open(browser: Browser, user: TestUser, path = "/today") {
  const app = await launch(browser);
  await signInUI(app.page, user, path);
  return app;
}

const star = (page: Page) => page.getByTestId("north-star");
const starToggle = (page: Page) =>
  star(page).getByRole("button", { name: new RegExp(t.northStar.title) });

/** Today shows the why as one line (docs/NAVIGATION.md); open it. */
async function openStar(page: Page) {
  const toggle = starToggle(page);
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  return star(page);
}
const morning = (page: Page) =>
  page.getByRole("region", { name: t.morning.aria });
const top3 = (page: Page) => page.getByRole("region", { name: t.top3.title });
const dialog = (page: Page) => page.getByRole("dialog");

async function uid(api: Api) {
  return (await api.auth.getUser()).data.user!.id;
}

async function clearGoals(api: Api) {
  const id = await uid(api);
  await api.from("goals").delete().eq("owner_id", id);
  await api.from("vision_items").delete().eq("owner_id", id);
  await api.from("accountability_items").delete().eq("owner_id", id);
}

async function briefing(api: Api, on: boolean) {
  const { error } = await api
    .from("user_settings")
    .update({ show_morning_briefing: on })
    .eq("user_id", await uid(api));
  if (error) throw new Error(error.message);
}

async function addTask(api: Api, title: string, visible = true) {
  const { data, error } = await api
    .from("daily_tasks")
    .insert({ title, visible_to_partner: visible })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function one<T>(
  q: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error || !data) throw new Error(error?.message ?? "no row");
  return data as NonNullable<T>;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  aId = await uid(A);
  bId = await uid(B);
  for (const api of [A, B, C]) {
    await resetTasks(api);
    await clearGoals(api);
    await api
      .from("planner_events")
      .delete()
      .eq("owner_id", await uid(api));
    await api.rpc("leave_duo");
  }
  await makeDuo(A, B);
  T = (await A.rpc("my_today")).data!;

  // A's direction: two visions, three goals, two mirror items (fallback
  // order: first vision, the 90-day goal, first mirror item).
  await A.from("vision_items").insert([
    { title: "Ter independência financeira", sort_order: 10 },
    { title: "Ter um corpo forte", sort_order: 20 },
  ]);
  await A.from("goals").insert([
    { title: "Ler 3 livros", goal_type: "monthly", sort_order: 10 },
    { title: "Lançar um produto pago", goal_type: "90_day", sort_order: 20 },
    { title: "Viver do meu negócio", goal_type: "long_term", sort_order: 10 },
  ]);
  await A.from("accountability_items").insert([
    { text: "Eu começo muitas coisas e termino poucas.", sort_order: 10 },
    { text: "Eu adio o que é difícil.", sort_order: 20 },
  ]);
});

test.afterAll(async () => {
  for (const api of [A, B, C]) {
    await clearGoals(api);
    await api
      .from("planner_events")
      .delete()
      .eq("owner_id", await uid(api));
  }
});

test("1: North Star shows the vision, the current goal and the mirror (fallback)", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a);
  // Closed: one line with the first item.
  await expect(starToggle(a.page)).toHaveAttribute("aria-expanded", "false");
  await expect(starToggle(a.page)).toContainText(
    "Ter independência financeira",
  );
  await expect(star(a.page).getByTestId("north-star-goal")).toHaveCount(0);
  const card = await openStar(a.page);
  await expect(card.getByTestId("north-star-vision")).toContainText(
    "Ter independência financeira",
  );
  // 90 DIAS wins the fallback over ESTE MÊS and LONGO PRAZO.
  await expect(card.getByTestId("north-star-goal")).toContainText(
    "Lançar um produto pago",
  );
  await expect(card.getByTestId("north-star-mirror")).toHaveText(
    /Eu começo muitas coisas e termino poucas\./,
  );
  await expect(
    card.getByRole("heading", { name: t.northStar.goal }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: t.northStar.manageAria }),
  ).toHaveAttribute("href", "/goals");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2: featuring another goal (and mirror) on /goals changes Today", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/goals");
  await a.page
    .getByRole("radio", { name: t.goals.sections.goals, exact: true })
    .click();
  const feature = a.page.getByRole("button", {
    name: t.goals.feature("Viver do meu negócio"),
  });
  await feature.click();
  await expect(
    a.page.getByRole("button", {
      name: t.goals.unfeature("Viver do meu negócio"),
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      (await A.from("goals").select("title").eq("is_featured", true)).data?.map(
        (g) => g.title,
      ),
    )
    .toEqual(["Viver do meu negócio"]);
  // A second featured goal replaces the first (one per user).
  await a.page
    .getByRole("button", { name: t.goals.feature("Ler 3 livros") })
    .click();
  await expect
    .poll(async () =>
      (await A.from("goals").select("title").eq("is_featured", true)).data?.map(
        (g) => g.title,
      ),
    )
    .toEqual(["Ler 3 livros"]);
  await a.page
    .getByRole("radio", { name: t.goals.sections.mirror, exact: true })
    .click();
  await a.page
    .getByRole("button", { name: t.goals.feature("Eu adio o que é difícil.") })
    .click();
  await expect(a.page.getByText(t.goals.featured).first()).toBeVisible();
  // The label is optimistic: wait for the write before leaving the page.
  await expect
    .poll(async () =>
      (
        await A.from("accountability_items")
          .select("text")
          .eq("is_featured", true)
      ).data?.map((m) => m.text),
    )
    .toEqual(["Eu adio o que é difícil."]);

  // Client navigation back to Today: the page re-reads the North Star.
  await a.page
    // "HOJE" in the phone tabs, "Hoje" in the desktop sidebar.
    .getByRole("link", { name: new RegExp(`^${t.pageTitles.today}$`, "i") })
    .first()
    .click();
  await expect(a.page).toHaveURL(/\/today$/);
  await openStar(a.page);
  await expect(star(a.page).getByTestId("north-star-goal")).toContainText(
    "Ler 3 livros",
  );
  await expect(star(a.page).getByTestId("north-star-mirror")).toContainText(
    "Eu adio o que é difícil.",
  );
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("3: archiving the featured vision → fallback; achieving the goal is never META ATUAL", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const v = await one(
    A.from("vision_items")
      .select("id")
      .eq("title", "Ter um corpo forte")
      .single(),
  );
  await A.from("vision_items").update({ is_featured: true }).eq("id", v.id);
  const a = await open(browser, users.a);
  await openStar(a.page);
  await expect(star(a.page).getByTestId("north-star-vision")).toContainText(
    "Ter um corpo forte",
  );

  // Archive it through /goals.
  await a.page.goto("/goals");
  await a.page.getByText("Ter um corpo forte").click();
  await dialog(a.page)
    .getByRole("button", { name: t.goals.archive, exact: true })
    .click();
  await expect(dialog(a.page)).toHaveCount(0);
  const after = await one(
    A.from("vision_items")
      .select("is_featured, is_archived")
      .eq("id", v.id)
      .single(),
  );
  expect(after).toEqual({ is_featured: false, is_archived: true });

  // Achieve the featured goal via the API (the /goals UI was tested in Phase 3).
  await A.from("goals")
    .update({ status: "achieved" })
    .eq("title", "Ler 3 livros");
  await a.page.goto("/today");
  await openStar(a.page);
  await expect(star(a.page).getByTestId("north-star-vision")).toContainText(
    "Ter independência financeira",
  );
  await expect(star(a.page).getByTestId("north-star-goal")).toContainText(
    "Lançar um produto pago",
  );
  await expect(star(a.page)).not.toContainText("Ler 3 livros");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4 + 5: Top 3 of real tasks; the fourth needs a replacement; completion stays", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  for (const title of [
    "Estudar Física",
    "Treinar",
    "Ler 20 páginas",
    "Revisar Química",
  ])
    await addTask(A, title);
  const a = await open(browser, users.a);
  const section = top3(a.page);
  await section.getByRole("button", { name: t.top3.define }).click();
  const sheet = dialog(a.page);
  for (const name of ["Treinar", "Estudar Física", "Ler 20 páginas"])
    await sheet.getByRole("button", { name: t.top3.pick(name) }).click();
  await expect(sheet.getByTestId("top3-count")).toHaveText("3 / 3");
  await expect(
    sheet.getByRole("button", { name: t.top3.pick("Revisar Química") }),
  ).toBeDisabled();
  // Order: move "Estudar Física" to the top.
  await sheet
    .getByRole("button", { name: t.top3.moveUp("Estudar Física") })
    .click();
  await sheet.getByRole("button", { name: t.top3.save }).click();
  await expect(sheet).toHaveCount(0);
  const ranks = async () =>
    (
      await A.from("daily_tasks")
        .select("title, priority_rank")
        .eq("owner_id", aId)
        .not("priority_rank", "is", null)
        .order("priority_rank")
    ).data;
  await expect.poll(ranks).toEqual([
    { title: "Estudar Física", priority_rank: 1 },
    { title: "Treinar", priority_rank: 2 },
    { title: "Ler 20 páginas", priority_rank: 3 },
  ]);
  await expect(
    section.getByRole("checkbox", {
      name: t.top3.rankAria(1, "Estudar Física"),
    }),
  ).toBeVisible();

  // The fourth one from the task's options: must replace one of the three.
  await a.page
    .getByRole("button", { name: t.taskRow.optionsFor("Revisar Química") })
    .click();
  await dialog(a.page).getByRole("button", { name: t.top3.mark }).click();
  await expect(dialog(a.page).getByText(t.top3.fullTitle)).toBeVisible();
  expect((await ranks())!.length).toBe(3);
  await dialog(a.page)
    .getByRole("button", { name: t.top3.replace("Treinar") })
    .click();
  await expect.poll(ranks).toEqual([
    { title: "Estudar Física", priority_rank: 1 },
    { title: "Revisar Química", priority_rank: 2 },
    { title: "Ler 20 páginas", priority_rank: 3 },
  ]);

  // 5 · Completing a priority keeps it in the Top 3, marked done.
  const first = section.getByRole("checkbox", {
    name: t.top3.rankAria(1, "Estudar Física"),
  });
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "true");
  // Saved before the reload (the toggle is optimistic).
  await expect
    .poll(
      async () =>
        (
          await A.from("daily_tasks")
            .select("status")
            .eq("owner_id", aId)
            .eq("title", "Estudar Física")
            .single()
        ).data?.status,
    )
    .toBe("completed");
  await a.page.reload();
  const again = top3(a.page).getByRole("checkbox", {
    name: t.top3.rankAria(1, "Estudar Física"),
  });
  await expect(again).toHaveAttribute("aria-checked", "true");
  await expect(top3(a.page).getByText(t.top3.done)).toBeVisible();
  // Also still a normal task in its section.
  await expect(
    a.page.getByRole("checkbox", { name: "Estudar Física", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("6: a private priority stays private for the partner", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const secret = await addTask(A, "Consulta particular", false);
  const shared = (await ranks(A)).map((r) => r.id);
  await A.rpc("set_my_priorities", { p_ids: [...shared.slice(0, 2), secret] });
  expect((await ranks(A)).map((r) => r.title)).toContain("Consulta particular");

  // The partner's API: the private row (and its rank) is not readable.
  const seen = await B.from("daily_tasks")
    .select("id, title, priority_rank")
    .eq("owner_id", aId);
  expect(seen.error).toBeNull();
  expect(seen.data!.map((r) => r.title)).not.toContain("Consulta particular");
  expect(seen.data!.find((r) => r.id === secret)).toBeUndefined();
  // The partner cannot change A's Top 3.
  const hack = await B.rpc("set_my_priorities", { p_ids: [secret] });
  expect(hack.error?.message).toContain("LI_NOT_FOUND");
  await B.from("daily_tasks")
    .update({ priority_rank: null })
    .eq("id", shared[0]);
  expect((await ranks(A)).map((r) => r.id)).toContain(shared[0]);
  // The outsider sees nothing of A.
  expect(
    (await C.from("daily_tasks").select("id").eq("owner_id", aId)).data,
  ).toEqual([]);

  // B's screens never show the private title.
  const b = await open(browser, users.b, "/partner");
  await expect(b.page.getByRole("main")).toBeVisible();
  await b.page.waitForTimeout(1000);
  await expect(b.page.getByText("Consulta particular")).toHaveCount(0);
  expect(b.errors).toEqual([]);
  await b.context.close();
});

async function ranks(api: Api) {
  const { data } = await api
    .from("daily_tasks")
    .select("id, title, priority_rank")
    .eq("owner_id", await uid(api))
    .not("priority_rank", "is", null)
    .order("priority_rank");
  return data ?? [];
}

test("7: the morning card shows once per day, closes, and comes back the next day", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await briefing(A, true);
  const a = await open(browser, users.a);
  const card = morning(a.page);
  await expect(card).toBeVisible();
  // V3.2 Morning Ritual: one "why" line — the current goal (the vision
  // is the fallback) — and the first step is the best-ranked open Top 3
  // task (the Top 3 itself is right below, not repeated).
  await expect(card).toContainText(t.morning.whyKey);
  await expect(card).toContainText("Lançar um produto pago");
  await expect(card).toContainText(t.morning.standardKey);
  const nextRank = a.page.locator(
    '[data-next="true"] [data-testid="task-rank"]',
  );
  await expect(nextRank).toHaveCount(1);
  await expect(card.getByTestId("morning-step")).toHaveText(
    (await a.page
      .locator('[data-next="true"] [role="checkbox"]')
      .getAttribute("aria-label"))!,
  );
  // Not a modal: Today stays usable behind it.
  await expect(a.page.getByRole("dialog")).toHaveCount(0);
  await card.getByTestId("morning-start").click();
  await expect(card).toHaveCount(0);

  await a.page.reload();
  await expect(star(a.page)).toBeVisible();
  await a.page.waitForTimeout(800);
  await expect(morning(a.page)).toHaveCount(0);

  // A new day for this device: the stored mark is yesterday's.
  await a.page.evaluate(
    ([key, day]) =>
      localStorage.setItem(key, JSON.stringify({ v: 1, briefing: day })),
    [`locked-in:v2:${aId}:daily`, addDays(T, -1)],
  );
  await a.page.reload();
  await expect(morning(a.page)).toBeVisible();
  // Keyboard: the close button works with Enter.
  await morning(a.page)
    .getByRole("button", { name: t.morning.close })
    .press("Enter");
  await expect(morning(a.page)).toHaveCount(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("8: same browser — A saw it, signs out; B still gets B's morning card", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await briefing(A, true);
  await briefing(B, true);
  const app = await launch(browser);
  // Old V1 unscoped key from before Phase 4: ignored and removed.
  await app.page.goto("/login");
  await app.page.evaluate(
    (day) => localStorage.setItem("li:briefing-shown", day),
    T,
  );
  await signInUI(app.page, users.a, "/today");
  await expect(morning(app.page)).toBeVisible();
  expect(
    await app.page.evaluate(() => localStorage.getItem("li:briefing-shown")),
  ).toBeNull();
  await morning(app.page).getByTestId("morning-start").click();

  await app.page.goto("/settings");
  await app.page
    .getByRole("button", { name: t.settings.signOut, exact: true })
    .click();
  await expect(app.page).toHaveURL(/\/login$/);
  await signInUI(app.page, users.b, "/today");
  await expect(morning(app.page)).toBeVisible();
  const keys = await app.page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((k) => k.includes(aId))).toEqual([]);
  expect(keys).toContain(`locked-in:v2:${bId}:daily`);
  expect(app.errors).toEqual([]);
  await app.context.close();
  await briefing(A, false);
  await briefing(B, false);
});

test("9: the next planner event appears in the morning", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await briefing(A, true);
  const { error } = await A.from("planner_events").insert([
    {
      title: "Prova bimestral",
      event_type: "exam",
      subject: "Física",
      event_date: addDays(T, 2),
    },
    {
      title: "Trabalho",
      event_type: "assignment",
      subject: "História",
      event_date: addDays(T, 9),
    },
  ]);
  if (error) throw new Error(error.message);
  const a = await open(browser, users.a);
  const card = morning(a.page);
  await expect(card).toBeVisible();
  await expect(card).toContainText(t.morning.next);
  await expect(card).toContainText(
    `${t.planner.types.exam} · FÍSICA · ${t.planner.countdown.inDays(2)}`,
  );
  await expect(card).not.toContainText("HISTÓRIA");
  expect(a.errors).toEqual([]);
  await a.context.close();
  await briefing(A, false);
});

test("10: without goals the North Star invites to set a direction", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const c = await open(browser, users.c);
  // One line on Today that opens /goals (docs/NAVIGATION.md).
  const empty = c.page.getByTestId("north-star-empty");
  await expect(empty).toContainText(t.northStar.emptyTitle);
  await expect(empty).toContainText(t.northStar.emptyText);
  await expect(empty).toHaveAccessibleName(
    `${t.northStar.emptyTitle}. ${t.northStar.emptyCta}`,
  );
  await empty.click();
  await expect(c.page).toHaveURL(/\/goals$/);
  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("11: mobile — the task list starts within the first screen, even with the morning card", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await briefing(A, true);
  const a = await open(browser, users.a);
  await expect(morning(a.page)).toBeVisible();
  const viewport = a.page.viewportSize()!;
  const tasks = a.page.getByRole("region", { name: t.todayScreen.tasksAria });
  const box = await tasks.boundingBox();
  expect(box).not.toBeNull();
  // The tasks begin within about two screens with everything open, and
  // within the first screen once the morning card is closed.
  expect(box!.y).toBeLessThan(viewport.height * 2);
  await morning(a.page).getByTestId("morning-start").click();
  const closed = (await tasks.boundingBox())!;
  expect(closed.y).toBeLessThan(viewport.height);
  // No horizontal scroll.
  const overflow = await a.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(a.errors).toEqual([]);
  await a.context.close();
  await briefing(A, false);
});

test("axe: Today with the morning card, Top 3 and North Star; the priorities sheet", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await briefing(A, true);
  await addTask(A, "Tarefa do axe"); // the Top 3 needs at least one task
  const a = await open(browser, users.a);
  await expect(morning(a.page)).toBeVisible();
  // Scan after the entry animations (a fading element has partial opacity).
  const settled = () =>
    a.page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (x) =>
            x.playState !== "running" ||
            x.effect?.getTiming().iterations === Infinity,
        ),
    );
  const scan = async () =>
    (await settled(),
    await new AxeBuilder({ page: a.page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()).violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  expect(await scan()).toEqual([]);
  // EDITAR after tests 4–6, DEFINIR TOP 3 when run alone.
  await top3(a.page)
    .getByRole("button", {
      name: new RegExp(`^(${t.top3.editAria}|${t.top3.define})$`),
    })
    .click();
  await expect(dialog(a.page)).toBeVisible();
  expect(await scan()).toEqual([]);
  await a.context.close();
  await briefing(A, false);
});
