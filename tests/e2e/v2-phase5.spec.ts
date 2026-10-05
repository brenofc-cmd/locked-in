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
 * V2 Phase 5 — Goal → Action → Proof (docs/GOAL_PROOF.md). Alice (A) and
 * Bruno (B) are a duo, Carla (C) is an outsider. Proof comes only from real
 * actions; goals stay private (the partner sees EM FOCO and shared task
 * titles, never a goal). Runs after Phase 4 (same shared users).
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let aId: string;
let bGoal: string;
const goal: Record<"study" | "body" | "done" | "old", string> = {
  study: "",
  body: "",
  done: "",
  old: "",
};
const STUDY = "Passar no vestibular";
const BODY = "Melhorar o físico";
const LIVE = 15_000;

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  user: TestUser,
  path: string,
  viewport?: { width: number; height: number },
): Promise<Opened> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: viewport ?? use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: viewport ? viewport.width < 780 : use.isMobile,
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

async function clearGoals(api: Api) {
  const { data } = await api.auth.getUser();
  const id = data.user!.id;
  await api.from("goals").delete().eq("owner_id", id);
  await api.from("vision_items").delete().eq("owner_id", id);
  await api.from("accountability_items").delete().eq("owner_id", id);
}

async function newGoal(api: Api, title: string, type = "90_day") {
  const { data, error } = await api
    .from("goals")
    .insert({ title, goal_type: type })
    .select("id")
    .single();
  if (error) throw new Error(`goal: ${error.message}`);
  return data.id;
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

const proofs = async (api: Api, goalId: string) =>
  (await api.rpc("my_goal_proofs", { p_goal_id: goalId, p_limit: 50 })).data ??
  [];

async function weekOf(api: Api, goalId: string) {
  const today = (await api.rpc("my_today")).data!;
  const { data } = await api.rpc("my_goal_proof_summaries", {
    p_from: "2000-01-01",
    p_to: today,
  });
  return data?.find((s) => s.goal_id === goalId) ?? null;
}

const row = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true });

test.beforeAll(async () => {
  test.setTimeout(120_000);
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
  goal.study = await newGoal(A, STUDY);
  goal.body = await newGoal(A, BODY, "monthly");
  goal.done = await newGoal(A, "Meta concluída", "monthly");
  goal.old = await newGoal(A, "Meta arquivada", "long_term");
  bGoal = await newGoal(B, "Meta do Bruno");
});

test.afterAll(async () => {
  for (const api of [A, B, C]) {
    await finishFocus(api);
    await clearGoals(api);
  }
});

test("1: a task linked to a goal in Quick Add becomes proof when completed", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/today");
  const writes = trackWrites(a.page);
  await a.page
    .getByRole("button", { name: t.todayScreen.addTaskAria })
    .first()
    .click();
  const add = a.page.getByRole("dialog", { name: t.sheetLabels.add });
  await add
    .getByRole("textbox", { name: t.taskSheet.nameAria })
    .fill("Estudar Física");
  await add.getByRole("button", { name: t.taskSheet.moreOptions }).click();
  await add.getByLabel(t.goalPicker.aria).selectOption({ label: STUDY });
  await expect(add.getByText(t.goalPicker.tag(STUDY))).toBeVisible();
  await add.getByRole("button", { name: t.taskSheet.add, exact: true }).click();
  await expect(row(a.page, "Estudar Física")).toBeVisible();
  await writes.idle();
  await a.page.reload();
  await expect(
    a.page.getByTestId("task-goal").filter({ hasText: STUDY }),
  ).toBeVisible();
  await row(a.page, "Estudar Física").click();
  await writes.idle();

  await a.page.goto(`/goals/${goal.study}`);
  await expect(
    a.page.getByRole("heading", { level: 1, name: STUDY }),
  ).toBeVisible();
  await expect(a.page.getByTestId("proof-week")).toContainText("1 ação");
  const timeline = a.page.getByTestId("proof-timeline");
  await expect(timeline.getByText("Estudar Física")).toBeVisible();
  await expect(
    timeline.getByText(/Tarefa concluída · \d\d:\d\d/),
  ).toBeVisible();
  await expect(timeline.getByRole("heading", { name: "HOJE" })).toBeVisible();
  // Scan after the entry animations (a fading element has partial opacity).
  await a.page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (x) =>
          x.playState !== "running" ||
          x.effect?.getTiming().iterations === Infinity,
      ),
  );
  const axe = await new AxeBuilder({ page: a.page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2: an unlinked completed task is not proof of any goal", async () => {
  const id = await oneOff(A, "Sem meta");
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", id);
  for (const g of Object.values(goal))
    expect((await proofs(A, g)).some((p) => p.title === "Sem meta")).toBe(
      false,
    );
});

test("3: a routine linked from the goal page seeds today's task; completing it is proof once", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { error } = await A.rpc("create_routine_item", {
    p_title: "Academia",
    p_days: [1, 2, 3, 4, 5, 6, 7],
    p_category: "body",
  });
  expect(error).toBeNull();
  const a = await open(browser, users.a, `/goals/${goal.body}`);
  const writes = trackWrites(a.page);
  await a.page.getByRole("button", { name: `+ ${t.proof.linkAction}` }).click();
  await a.page
    .getByRole("button", { name: t.proof.linkRoutine("Academia") })
    .click();
  await writes.idle();
  await expect(
    a.page.getByRole("list", { name: t.proof.routines }).getByText("Academia"),
  ).toBeVisible();

  await a.page.goto("/today");
  await expect(
    a.page.getByTestId("task-goal").filter({ hasText: BODY }),
  ).toBeVisible();
  await row(a.page, "Academia").click();
  await writes.idle();
  const p = await proofs(A, goal.body);
  expect(p.filter((x) => x.title === "Academia")).toHaveLength(1);
  expect((await weekOf(A, goal.body))?.actions).toBe(1);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("4 + 5: focus started from a goal is proof after completion; paused time never counts", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await finishFocus(A);
  const a = await open(browser, users.a, `/goals/${goal.study}`);
  await a.page.getByRole("link", { name: t.proof.startFocus }).click();
  await expect(a.page).toHaveURL(/\/focus\?goal=/);
  await expect(a.page.getByLabel(t.goalPicker.focusAria)).toHaveValue(
    goal.study,
  );
  await a.page
    .getByRole("radio", { name: t.focusUi.minutesAria("25") })
    .click();
  await a.page.getByRole("button", { name: "LOCK IN" }).click();
  const overlay = a.page.getByRole("dialog", { name: t.focusUi.sessionAria });
  await expect(overlay.getByLabel(t.goalPicker.focusAria)).toHaveValue(
    goal.study,
  );

  // Running: not proof yet.
  expect((await proofs(A, goal.study)).some((x) => x.kind === "focus")).toBe(
    false,
  );

  // Pause ~3 s, resume, end: the proof is the effective time only.
  const { data: active } = await A.rpc("my_active_focus");
  const id = active![0].id;
  await A.rpc("pause_focus_session", { p_id: id });
  await a.page.waitForTimeout(3000);
  await A.rpc("resume_focus_session", { p_id: id });
  const { data: done } = await A.rpc("complete_focus_session", { p_id: id });
  const s = done![0];
  expect(s.goal_id).toBe(goal.study);
  expect(s.accumulated_pause_seconds).toBeGreaterThanOrEqual(2);
  const elapsed = Math.floor(
    (Date.parse(s.ended_at!) - Date.parse(s.started_at)) / 1000,
  );
  expect(s.actual_focus_seconds).toBeLessThanOrEqual(
    elapsed - s.accumulated_pause_seconds,
  );
  const focusProof = (await proofs(A, goal.study)).find((x) => x.id === id);
  expect(focusProof?.focus_seconds).toBe(s.actual_focus_seconds);

  await a.page.goto(`/goals/${goal.study}`);
  await expect(
    a.page.getByTestId("proof-timeline").locator('[data-kind="focus"]'),
  ).toHaveCount(1);
  await a.context.close();
});

test("6: the partner sees EM FOCO, never the goal", async ({ browser }) => {
  test.setTimeout(90_000);
  await finishFocus(A);
  const started = await A.rpc("start_focus_session", {
    p_title: "Física",
    p_planned_seconds: 1500,
    p_goal_id: goal.study,
  });
  expect(started.error).toBeNull();
  const b = await open(browser, users.b, "/today");
  await expect(
    b.page.getByRole("link", { name: /^Alice: em foco,/ }),
  ).toBeVisible({
    timeout: LIVE,
  });
  await expect(b.page.getByText(STUDY)).toHaveCount(0);
  const projection = await B.rpc("partner_current_focus");
  expect(projection.data).toHaveLength(1);
  expect(Object.keys(projection.data![0]).some((k) => k.includes("goal"))).toBe(
    false,
  );
  expect(JSON.stringify(projection.data)).not.toContain(goal.study);
  await b.page.goto("/partner");
  await expect(b.page.getByText(STUDY)).toHaveCount(0);
  await finishFocus(A);
  await b.context.close();
});

test("7: a private task linked to a goal leaks nothing to the partner", async () => {
  const id = await oneOff(A, "Tarefa privada", false);
  expect(
    (
      await A.from("daily_task_goals").insert({
        daily_task_id: id,
        goal_id: goal.study,
      })
    ).error,
  ).toBeNull();
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", id);
  expect((await B.from("daily_tasks").select("id").eq("id", id)).data).toEqual(
    [],
  );
  expect((await B.from("daily_task_goals").select("*")).data).toEqual([]);
  expect((await B.from("routine_item_goals").select("*")).data).toEqual([]);
  expect((await B.from("goals").select("id").eq("owner_id", aId)).data).toEqual(
    [],
  );
  const feed = await B.from("activity_events").select("title:title_snapshot");
  expect(JSON.stringify(feed.data)).not.toContain(STUDY);
  expect(JSON.stringify(feed.data)).not.toContain(BODY);
  // The shared linked task is visible as a task, with no goal attached.
  const shared = await B.from("daily_tasks")
    .select("*")
    .eq("title", "Estudar Física");
  expect(shared.data).toHaveLength(1);
  expect(JSON.stringify(shared.data)).not.toContain(goal.study);
});

test("8 + 9: achieved and archived goals keep their proof and take no new action", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  for (const g of [goal.done, goal.old]) {
    const id = await oneOff(A, `Prova ${g.slice(0, 4)}`);
    await A.from("daily_task_goals").insert({ daily_task_id: id, goal_id: g });
    await A.from("daily_tasks").update({ status: "completed" }).eq("id", id);
  }
  await A.from("goals").update({ status: "achieved" }).eq("id", goal.done);
  await A.from("goals").update({ status: "archived" }).eq("id", goal.old);
  for (const g of [goal.done, goal.old]) {
    expect((await proofs(A, g)).length).toBe(1);
    const extra = await oneOff(A, "Nova ação");
    const res = await A.from("daily_task_goals").insert({
      daily_task_id: extra,
      goal_id: g,
    });
    expect(res.error?.message).toContain("LI_GOAL_INACTIVE");
  }

  const a = await open(browser, users.a, "/today");
  await a.page
    .getByRole("button", { name: t.todayScreen.addTaskAria })
    .first()
    .click();
  const add = a.page.getByRole("dialog", { name: t.sheetLabels.add });
  await add.getByRole("button", { name: t.taskSheet.moreOptions }).click();
  const options = await add
    .getByLabel(t.goalPicker.aria)
    .locator("option")
    .allTextContents();
  expect(options).toContain(STUDY);
  expect(options).not.toContain("Meta concluída");
  expect(options).not.toContain("Meta arquivada");

  await a.page.goto(`/goals/${goal.old}`);
  await expect(a.page.getByText(t.proof.inactive)).toBeVisible();
  await expect(a.page.getByTestId("proof-timeline").locator("li")).toHaveCount(
    1,
  );
  await expect(
    a.page.getByRole("link", { name: t.proof.startFocus }),
  ).toHaveCount(0);
  await a.context.close();
});

test("10: IDOR — A cannot link to, read or open B's goal", async ({
  browser,
}) => {
  const id = await oneOff(A, "Tentativa");
  const res = await A.from("daily_task_goals").insert({
    daily_task_id: id,
    goal_id: bGoal,
  });
  expect(res.error).not.toBeNull();
  const focus = await A.rpc("start_focus_session", {
    p_title: "X",
    p_planned_seconds: 60,
    p_goal_id: bGoal,
  });
  expect(focus.error).not.toBeNull();
  expect((await A.from("goals").select("id").eq("id", bGoal)).data).toEqual([]);
  expect((await proofs(A, bGoal)).length).toBe(0);
  expect((await proofs(C, goal.study)).length).toBe(0);
  const a = await open(browser, users.a, "/today");
  const resp = await a.page.goto(`/goals/${bGoal}`);
  expect(resp?.status()).toBe(404);
  await expect(a.page.getByText("Meta do Bruno")).toHaveCount(0);
  await a.context.close();
});

test("11: Progress shows the goals with proof in the period", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/progress");
  const section = a.page.getByTestId("goal-progress");
  await expect(
    section.getByRole("link", { name: new RegExp(STUDY) }),
  ).toBeVisible();
  await expect(
    section.getByRole("link", { name: new RegExp(BODY) }),
  ).toBeVisible();
  await expect(section.getByText(/\d+ aç(ão|ões)/).first()).toBeVisible();
  expect(await section.getByRole("listitem").count()).toBeLessThanOrEqual(3);
  await a.context.close();
});

test("12: the North Star shows this week's proof of the featured goal", async ({
  browser,
}) => {
  await A.from("goals").update({ is_featured: true }).eq("id", goal.study);
  const a = await open(browser, users.a, "/today");
  const star = a.page.getByTestId("north-star");
  // One line on Today; opening it shows the goal and its proof.
  const toggle = star.getByRole("button", { name: /LEMBRE-SE DO PORQUÊ/ });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(star.getByTestId("north-star-goal")).toContainText(STUDY);
  await expect(star.getByTestId("north-star-proof")).toContainText(
    /Esta semana: \d+ aç/,
  );
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("13: a closed day's task can never be linked afterwards", async () => {
  const today = (await A.rpc("my_today")).data!;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const [id] = (await fixture(A, "dev_fixture_add_tasks", {
    p_rows: [
      {
        task_date: d.toISOString().slice(0, 10),
        title: "Ontem",
        status: "completed",
      },
    ],
  })) as string[];
  const res = await A.from("daily_task_goals").insert({
    daily_task_id: id,
    goal_id: goal.study,
  });
  expect(res.error?.message).toContain("LI_HISTORY_LOCKED");
});

test("responsive: the goal page has no horizontal overflow from 375 to 1440", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  for (const width of [375, 390, 430, 768, 1180, 1440]) {
    const a = await open(browser, users.a, `/goals/${goal.study}`, {
      width,
      height: 900,
    });
    await expect(
      a.page.getByRole("heading", { level: 1, name: STUDY }),
    ).toBeVisible();
    const overflow = await a.page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    await a.context.close();
  }
});

// Visual review only (LI_SHOTS=<dir>): the new screens with real proof.
test("screens (visual review)", async ({ browser }) => {
  const dir = process.env.LI_SHOTS;
  test.skip(!dir, "set LI_SHOTS to capture the Phase 5 screens");
  test.setTimeout(120_000);
  for (const width of [390, 1440]) {
    const a = await open(browser, users.a, `/goals/${goal.study}`, {
      width,
      height: width < 780 ? 844 : 900,
    });
    await a.page.screenshot({
      path: `${dir}/goal-${width}.png`,
      fullPage: true,
    });
    await a.page.goto("/goals");
    await a.page
      .getByRole("radio", { name: t.goals.sections.goals, exact: true })
      .click();
    await a.page.screenshot({
      path: `${dir}/goals-${width}.png`,
      fullPage: true,
    });
    await a.page.goto("/today");
    await a.page.screenshot({
      path: `${dir}/today-${width}.png`,
      fullPage: true,
    });
    await a.page.goto("/progress");
    await a.page.getByTestId("goal-progress").scrollIntoViewIfNeeded();
    await a.page.screenshot({ path: `${dir}/progress-${width}.png` });
    await a.page.goto(`/focus?goal=${goal.study}`);
    await a.page.screenshot({
      path: `${dir}/focus-${width}.png`,
      fullPage: true,
    });
    await a.context.close();
  }
});
