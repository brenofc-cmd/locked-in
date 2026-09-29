import { t } from "@/i18n/pt-BR";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays } from "@/lib/local-date";
import { focusLabel } from "@/lib/progress";
import type { Database } from "@/types/database";
import {
  addTasksOn,
  apiAs,
  makeDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
  type TestUser,
} from "./support";

/**
 * Stage 8: the complete product on the DEV project with Alice (A), Bruno (B)
 * and Carla (C): onboarding (alone and with a duo), persistent realtime
 * reactions, challenges, settings, notification preferences, reviews and
 * history, the morning briefing, ending a duo and a new partner's privacy,
 * and the PWA manifest. Live updates are asserted without reloading.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let T: string;
const LIVE = 15_000;

async function uid(api: Api) {
  return (await api.auth.getUser()).data.user!.id;
}

async function settings(
  api: Api,
  patch: Database["public"]["Tables"]["user_settings"]["Update"],
) {
  const { error } = await api
    .from("user_settings")
    .update(patch)
    .eq("user_id", await uid(api));
  if (error) throw new Error(error.message);
}

/** A brand-new account's state: no routine, no duo, onboarding open. */
async function fresh(api: Api) {
  await resetTasks(api);
  await api.rpc("leave_duo");
  await settings(api, { onboarding_completed_at: null });
}

async function task(
  api: Api,
  title: string,
  opts: { date?: string; status?: string; visible?: boolean } = {},
) {
  if (opts.date && opts.date !== T) {
    // A closed day: only the DEV fixture can write it (Stage 9).
    const [id] = await addTasksOn(api, [
      {
        task_date: opts.date,
        title,
        status: opts.status ?? "pending",
        visible_to_partner: opts.visible ?? true,
      },
    ]);
    return id;
  }
  const { data, error } = await api
    .from("daily_tasks")
    .insert({
      owner_id: await uid(api),
      task_date: opts.date ?? T,
      title,
      status: opts.status ?? "pending",
      visible_to_partner: opts.visible ?? true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  T = (await A.rpc("my_today")).data!;
});

test.afterAll(async () => {
  // Back to the defaults the other suites expect (onboarded, no overlays).
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await Promise.all([A, B, C].map((x) => x.rpc("leave_duo")));
  for (const [api, name] of [
    [A, "Alice"],
    [B, "Bruno"],
    [C, "Carla"],
  ] as const) {
    await api
      .from("profiles")
      .update({
        display_name: name,
        daily_standard_percent: 80,
        timezone: "America/Sao_Paulo",
      })
      .eq("id", await uid(api));
  }
});

async function open(browser: Browser, user: TestUser, path: string) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await signInUI(page, user, path);
  return { context, page, errors };
}

/**
 * Reload and wait until the duo channel has joined: the browser reads the
 * partner's day (rpc/partner_today) only after SUBSCRIBED.
 */
async function reloadConnected(page: Page) {
  const joined = page.waitForResponse((r) =>
    r.url().includes("/rest/v1/rpc/partner_today"),
  );
  await page.reload();
  await joined;
  // Database broadcasts sent in the first moments after a join can be
  // missed by that new subscription (the app recovers them on the next
  // refetch, but not as a live notice): give it a moment.
  await page.waitForTimeout(2000);
}

const onboarding = (page: Page) =>
  page.getByRole("dialog", { name: "Boas-vindas ao LOCKED IN" });

async function throughRoutine(page: Page, name: string, template: string) {
  const ob = onboarding(page);
  await expect(ob).toBeVisible();
  await ob.getByRole("button", { name: "COMEÇAR" }).click();
  await ob.getByLabel("SEU NOME").fill(name);
  await ob.getByRole("button", { name: "CONTINUAR" }).click();
  await ob.getByRole("radio", { name: /Começar com um modelo/ }).click();
  await ob.getByRole("button", { name: "CONTINUAR" }).click();
  await ob.getByRole("radio", { name: template }).click();
}

test("onboarding: a fresh user builds a routine, skips the duo, lands on Today and never sees it again", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await fresh(C);
  const c = await open(browser, users.c, "/today");
  const page = c.page;

  await throughRoutine(page, "Carla", "Rotina de estudos");
  const ob = onboarding(page);
  // Edit the template before it becomes real: untick one item.
  await ob.getByRole("checkbox", { name: "Resolver exercícios" }).click();
  await ob.getByRole("button", { name: "CONTINUAR" }).click();
  await expect(
    ob.getByRole("heading", { name: /CONVIDE SUA\s*DUPLA/ }),
  ).toBeVisible();
  await ob.getByRole("button", { name: "Fazer isso depois" }).click();

  await expect(ob).toBeHidden({ timeout: LIVE });
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: /CARLA\./ })).toBeVisible();
  for (const t of ["Bloco de estudo", "Ler", "Revisar anotações"])
    await expect(
      page.getByRole("checkbox", { name: t, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Resolver exercícios" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Bloco de estudo" }),
  ).toBeVisible();
  await expect(onboarding(page)).toHaveCount(0);
  const row = (await C.from("user_settings").select("*").single()).data!;
  expect(row.onboarding_completed_at).not.toBeNull();
  expect(
    (await C.from("routine_items").select("title").is("end_date", null)).data,
  ).toHaveLength(3);

  // Interrupted after the routine: it resumes at the duo step (no duplicates).
  await settings(C, { onboarding_completed_at: null });
  await page.reload();
  await expect(
    onboarding(page).getByRole("heading", { name: /CONVIDE SUA\s*DUPLA/ }),
  ).toBeVisible();
  await onboarding(page)
    .getByRole("button", { name: "Fazer isso depois" })
    .click();
  await expect(onboarding(page)).toBeHidden({ timeout: LIVE });
  expect(
    (await C.from("routine_items").select("title").is("end_date", null)).data,
  ).toHaveLength(3);

  expect(c.errors).toEqual([]);
  await c.context.close();
});

test("onboarding with a duo: A creates the invitation, B joins with the code, both continue", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await Promise.all([fresh(A), fresh(B)]);
  const a = await open(browser, users.a, "/today");
  const b = await open(browser, users.b, "/today");

  await throughRoutine(a.page, "Alice", "Rotina da manhã");
  await onboarding(a.page).getByRole("button", { name: "CONTINUAR" }).click();
  await onboarding(a.page)
    .getByRole("button", { name: "CRIAR CONVITE" })
    .click();
  const code = onboarding(a.page).getByTestId("onboarding-code");
  await expect(code).toHaveText(/^LKD-[A-Z0-9]{6}$/, { timeout: LIVE });
  const invite = (await code.textContent())!;

  await throughRoutine(b.page, "Bruno", "Treino");
  await onboarding(b.page).getByRole("button", { name: "CONTINUAR" }).click();
  await onboarding(b.page).getByLabel("Código da dupla").fill(invite);
  await onboarding(b.page).getByRole("button", { name: "Entrar" }).click();
  await expect(onboarding(b.page).getByTestId("onboarding-partner")).toHaveText(
    /Você e Alice/,
    { timeout: LIVE },
  );
  // A learns it live (duo_joined) while still in onboarding.
  await expect(onboarding(a.page).getByTestId("onboarding-partner")).toHaveText(
    /Você e Bruno/,
    { timeout: LIVE },
  );

  for (const p of [a.page, b.page]) {
    await onboarding(p)
      .getByRole("button", { name: "ENTRAR NO LOCKED IN" })
      .click();
    await expect(onboarding(p)).toBeHidden({ timeout: LIVE });
    await expect(p).toHaveURL(/\/today$/);
  }
  await expect(
    a.page.getByRole("link", { name: /^Bruno: (online|offline),/ }),
  ).toBeVisible({ timeout: LIVE });

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("reactions persist, update live on both sides and never leave the duo", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/partner");
  const b = await open(browser, users.b, "/partner");
  const aFeed = a.page.getByRole("region", { name: "Atividade" });
  const bFeed = b.page.getByRole("region", { name: "Atividade" });
  await expect(
    a.page.getByRole("heading", { level: 1, name: "BRUNO" }),
  ).toBeVisible();

  // A completes a shared task (through the app's database path).
  const runId = await task(A, "Morning Run");
  await A.from("daily_tasks").update({ status: "completed" }).eq("id", runId);
  await expect(bFeed.getByText("concluiu Morning Run")).toBeVisible({
    timeout: LIVE,
  });

  // B reacts 🔥: A sees it on the line and gets a notice, no reload.
  await bFeed
    .getByRole("button", { name: "Reagir a Alice concluiu Morning Run" })
    .click();
  await b.page
    .getByRole("dialog", { name: "Reagir" })
    .getByRole("button", { name: "Reagir 🔥" })
    .click();
  const aReceived = aFeed.getByTestId("received-reaction");
  await expect(aReceived).toHaveText(/🔥\s*Bruno/, { timeout: LIVE });

  // Both refresh: it is persisted.
  await Promise.all([a.page.reload(), b.page.reload()]);
  await expect(aReceived).toHaveText(/🔥\s*Bruno/);
  const bButton = bFeed.getByRole("button", {
    name: /^Você reagiu 🔥 a Alice concluiu Morning Run/,
  });
  await expect(bButton).toBeVisible();

  // B changes it to 🫡: one reaction, replaced on both sides.
  await bButton.click();
  await b.page
    .getByRole("dialog", { name: "Reagir" })
    .getByRole("button", { name: "Reagir 🫡" })
    .click();
  await expect(aReceived).toHaveText(/🫡\s*Bruno/, { timeout: LIVE });
  await expect(
    bFeed.getByRole("button", { name: /^Você reagiu 🫡/ }),
  ).toBeVisible();
  const rows = (await A.from("reactions").select("reaction_type, from_user_id"))
    .data!;
  expect(rows).toEqual([
    { reaction_type: "salute", from_user_id: await uid(B) },
  ]);

  // Nobody reacts to their own line; an outsider reads nothing.
  await expect(
    aFeed.getByRole("button", { name: /Reagir a Alice/ }),
  ).toHaveCount(0);
  expect((await C.from("reactions").select("id")).data).toEqual([]);

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("challenges: created together, progress derived from real tasks and focus, live", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/challenges");
  const b = await open(browser, users.b, "/challenges");
  const bWrites = trackWrites(b.page);
  await expect(a.page.getByText("NENHUM DESAFIO ATIVO")).toBeVisible();

  // A creates a standard-days challenge in the sheet.
  await a.page.getByRole("button", { name: "Novo desafio" }).click();
  const sheet = a.page.getByRole("dialog", { name: "Novo desafio" });
  await sheet.getByLabel("TÍTULO", { exact: true }).fill("No zero days");
  await sheet.getByLabel(/^META/).fill("3");
  await sheet.getByLabel("FIM", { exact: true }).fill(addDays(T, 6));
  await sheet.getByRole("button", { name: "CRIAR" }).click();
  await expect(sheet).toBeHidden({ timeout: LIVE });

  // B sees it without reload (challenges_changed).
  const bCard = b.page.getByRole("article", { name: "No zero days" });
  await expect(bCard).toBeVisible({ timeout: LIVE });
  await expect(bCard.getByTestId("challenge-status")).toHaveText(
    "FALTAM 7 DIAS",
  );
  await expect(bCard.getByTestId("challenge-me")).toHaveText("0 dias");

  // B completes today's routine (Training, from onboarding): 3 / 3 meets
  // the standard, so B's day counts — A's screen updates live.
  await b.page.goto("/today");
  for (const t of ["Corrida matinal", "Academia", "Alongamento"])
    await b.page.getByRole("checkbox", { name: t, exact: true }).click();
  await bWrites.idle();
  const aCard = a.page.getByRole("article", { name: "No zero days" });
  await expect(aCard.getByTestId("challenge-partner")).toHaveText("1 dia", {
    timeout: LIVE,
  });
  await expect(aCard.getByTestId("challenge-verdict")).toHaveText(
    "BRUNO LIDERA",
  );

  // A focus challenge: completed sessions only, from the database.
  const { error } = await A.from("challenges").insert({
    title: "Deep work week",
    challenge_type: "focus_seconds",
    target_value: 36000,
    start_date: T,
    end_date: addDays(T, 6),
  });
  expect(error).toBeNull();
  // Earlier suites leave completed sessions today: measure the change.
  const focusOf = async () =>
    (await A.rpc("duo_challenges")).data!.find(
      (c) => c.title === "Deep work week",
    )!;
  const before = await focusOf();
  const started = (
    await B.rpc("start_focus_session", {
      p_title: "Deep",
      p_planned_seconds: 1500,
    })
  ).data![0];
  await new Promise((r) => setTimeout(r, 2500));
  await B.rpc("complete_focus_session", { p_id: started.id });
  const after = await focusOf();
  expect(after.me_value).toBe(before.me_value);
  expect(after.partner_value! - before.partner_value!).toBeGreaterThanOrEqual(
    2,
  );
  await expect(
    a.page.getByRole("article", { name: "Deep work week" }),
  ).toBeVisible({ timeout: LIVE });

  // An outsider sees none of it.
  expect((await C.from("challenges").select("id")).data).toEqual([]);

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("settings persist: name, standard, timezone, briefing and notification preferences", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/settings");
  const page = a.page;
  const writes = trackWrites(page);

  await page.getByLabel(/Nome de exibição/).fill("Alice R");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("radio", { name: "90%" })).toBeVisible();
  await page.getByRole("radio", { name: "90%" }).click();
  await page.getByRole("switch", { name: /Mostrar resumo da manhã/ }).click();
  await page.getByRole("switch", { name: /Atividade da dupla/ }).click();
  await page.getByRole("switch", { name: /Horário silencioso/ }).click();
  await page.getByLabel("Início do horário silencioso").fill("21:30");
  await page.getByLabel("Fim do horário silencioso").fill("06:45");
  await writes.idle();
  // Same offset, no DST: "today" cannot move.
  await page.getByLabel(/Fuso horário/).selectOption("America/Bahia");
  // The app reloads itself once saved ("today" may have moved).
  await expect
    .poll(
      async () =>
        (
          await A.from("profiles")
            .select("timezone")
            .eq("id", await uid(A))
        ).data?.[0]?.timezone,
      { timeout: LIVE },
    )
    .toBe("America/Bahia");
  await page.waitForTimeout(1500); // let the app's own reload finish
  await page.goto("/settings");
  await expect(page.getByLabel(/Nome de exibição/)).toHaveValue("Alice R");
  await expect(page.getByRole("radio", { name: "90%" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Test users start with the briefing off (support.testSettings): now on.
  await expect(
    page.getByRole("switch", { name: /Mostrar resumo da manhã/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("switch", { name: /Atividade da dupla/ }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Início do horário silencioso")).toHaveValue(
    "21:30",
  );
  await expect(page.getByLabel("Fim do horário silencioso")).toHaveValue(
    "06:45",
  );
  await expect(page.getByLabel(/Fuso horário/)).toHaveValue("America/Bahia");

  const s = (await A.from("user_settings").select("*").single()).data!;
  expect(s).toMatchObject({
    show_morning_briefing: true,
    notify_partner_activity: false,
    quiet_hours_enabled: true,
    quiet_hours_start: "21:30:00",
    quiet_hours_end: "06:45:00",
  });
  const p = (
    await A.from("profiles")
      .select("*")
      .eq("id", await uid(A))
      .single()
  ).data!;
  expect(p).toMatchObject({
    display_name: "Alice R",
    daily_standard_percent: 90,
    timezone: "America/Bahia",
  });

  // The partner cannot read my settings.
  expect((await B.from("user_settings").select("user_id")).data).toEqual([
    { user_id: await uid(B) },
  ]);

  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("notification preferences: off = no notice, on = in-app notice, quiet hours = no browser notification", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Record Notification API use instead of the OS UI.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => {
    const w = window as unknown as {
      __notes: string[];
      __asked: number;
      __vis: DocumentVisibilityState;
      Notification: unknown;
    };
    w.__notes = [];
    w.__asked = 0;
    w.__vis = "visible";
    class FakeNotification {
      static permission: NotificationPermission = "granted";
      static async requestPermission() {
        w.__asked++;
        return "granted" as const;
      }
      constructor(_title: string, options?: { body?: string }) {
        w.__notes.push(options?.body ?? "");
      }
    }
    Object.defineProperty(window, "Notification", {
      value: FakeNotification,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      get: () => w.__vis,
    });
  });
  const page = await context.newPage();
  await signInUI(page, users.a, "/today");
  const toasts = page.getByRole("status");
  expect(await page.evaluate(() => Notification.permission)).toBe("granted");

  // Partner activity is OFF (previous test): nothing shows, nothing is asked
  // (connected first, so the event really reaches the page).
  await reloadConnected(page);
  await task(B, "Silent task", { status: "completed" });
  await expect(page.getByRole("link", { name: /^Bruno: / })).toBeVisible({
    timeout: LIVE,
  });
  await page.waitForTimeout(4000);
  await expect(toasts.getByText("Bruno concluiu Silent task")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __asked: number }).__asked,
    ),
  ).toBe(0);

  // ON, quiet hours around now, app in the background: in-app yes, browser no.
  const nowHM = new Date().toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const h = Number(nowHM.slice(0, 2));
  const pad = (n: number) => String((n + 24) % 24).padStart(2, "0");
  await settings(A, {
    notify_partner_activity: true,
    quiet_hours_enabled: true,
    quiet_hours_start: `${pad(h - 1)}:00`,
    quiet_hours_end: `${pad(h + 2)}:00`,
  });
  await reloadConnected(page);
  await expect(page.getByRole("heading", { name: /ALICE/ })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __vis: string }).__vis = "hidden";
  });
  await task(B, "Quiet task", { status: "completed" });
  await expect(toasts.getByText("Bruno concluiu Quiet task")).toBeVisible({
    timeout: LIVE,
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { __notes: string[] }).__notes,
    ),
  ).toEqual([]);

  // Quiet hours off: the background tab also gets the browser notification.
  await settings(A, { quiet_hours_enabled: false });
  await reloadConnected(page);
  await expect(page.getByRole("heading", { name: /ALICE/ })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __vis: string }).__vis = "hidden";
  });
  expect(await page.evaluate(() => document.visibilityState)).toBe("hidden");
  await task(B, "Loud task", { status: "completed" });
  await expect(toasts.getByText("Bruno concluiu Loud task")).toBeVisible({
    timeout: LIVE,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __notes: string[] }).__notes,
        ),
      {
        timeout: LIVE,
      },
    )
    .toEqual(["Bruno concluiu Loud task"]);
  await context.close();
});

test("morning briefing: real numbers once a day, skippable, preference persisted", async ({
  browser,
}) => {
  // V2 Phase 4: the briefing is an inline card on Today (not a dialog),
  // once per user and day (docs/NORTH_STAR.md).
  test.setTimeout(90_000);
  await settings(A, { show_morning_briefing: true });
  await task(A, "Yesterday done", {
    date: addDays(T, -1),
    status: "completed",
  });
  await task(A, "Yesterday open", { date: addDays(T, -1) });
  const a = await open(browser, users.a, "/today");
  const brief = a.page.getByRole("region", { name: t.morning.aria });
  await expect(brief).toBeVisible({ timeout: LIVE });
  await expect(brief.getByText(/ONTEM 50%/)).toBeVisible(); // yesterday 1 / 2
  await expect(brief.getByText("BRUNO")).toBeVisible();
  await expect(a.page.getByRole("dialog")).toHaveCount(0);
  await brief.getByRole("button", { name: t.morning.close }).click();
  await expect(brief).toBeHidden();
  await expect(a.page.getByRole("heading", { name: /ALICE/ })).toBeVisible();

  // Once a day: not again after a reload.
  await a.page.reload();
  await expect(a.page.getByRole("heading", { name: /ALICE/ })).toBeVisible();
  await a.page.waitForTimeout(1000);
  await expect(brief).toHaveCount(0);

  // Turning it off inside the briefing persists.
  const aId = await uid(A);
  await a.page.evaluate(
    (key) => localStorage.removeItem(key),
    `locked-in:v2:${aId}:daily`,
  );
  await a.page.reload();
  await expect(brief).toBeVisible({ timeout: LIVE });
  await brief.getByRole("switch", { name: t.morning.autoShow }).click();
  await expect
    .poll(
      async () =>
        (await A.from("user_settings").select("*").single()).data!
          .show_morning_briefing,
    )
    .toBe(false);
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("reviews and history match the recorded numbers", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await open(browser, users.a, "/today");
  const page = a.page;

  // Day review = Today's numbers.
  const todayPct = (await page.getByTestId("today-pct").textContent())!.replace(
    /\D/g,
    "",
  );
  await page.getByRole("button", { name: /Revisar o dia/ }).click();
  const review = page.getByRole("dialog", { name: "Revisão do dia" });
  await expect(review.getByTestId("review-pct")).toHaveText(
    new RegExp(`^${todayPct}%`),
  );
  await expect(review.getByTestId("review-focus")).toHaveText(/DE FOCO$/);
  await review.getByRole("button", { name: "PRONTO" }).click();

  // Weekly review of the current week: a leader, never a winner.
  await page.goto("/partner");
  await page.getByRole("button", { name: "Revisar esta semana" }).click();
  const weekly = page.getByRole("dialog", { name: /^Revisão da semana \d+$/ });
  await expect(weekly.getByTestId("weekly-title")).toHaveText(/EM ANDAMENTO$/);
  await expect(weekly.getByTestId("weekly-verdict")).toHaveText(
    /^(LÍDER ATUAL|SEM PLACAR AINDA)/,
  );
  await weekly.getByRole("button", { name: "FECHAR" }).click();

  // History: yesterday from the calendar = its task snapshots and focus.
  await page.goto("/progress");
  const y = addDays(T, -1);
  if (y.slice(0, 7) !== T.slice(0, 7))
    await page.getByRole("button", { name: "Mês anterior" }).click();
  // The calendar names a day "Set 27": first three letters of the month.
  const long = t.dates.monthsLong[Number(y.slice(5, 7)) - 1];
  const mon = long.charAt(0) + long.slice(1, 3).toLowerCase();
  await page
    .getByRole("button", {
      name: new RegExp(`^${mon} ${Number(y.slice(8))}: `),
    })
    .click();
  const day = page.getByRole("dialog", { name: "Detalhes do dia" });
  await expect(day.getByTestId("day-pct")).toHaveText("50%");
  await expect(day.getByText("Yesterday done")).toBeVisible();
  await expect(day.getByText("Yesterday open")).toBeVisible();
  // Focus of that day = the database series (earlier suites leave sessions).
  const series = (await A.rpc("my_daily_progress", { p_from: y, p_to: y }))
    .data![0];
  await expect(day.getByTestId("day-focus")).toHaveText(
    new RegExp(
      `^${focusLabel(series.focus_seconds)} · ${series.focus_sessions} `,
    ),
  );
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("ending the duo: confirmed, both see NO PARTNER YET live, personal data stays; a new partner sees nothing of it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const aTasksBefore = (
    await A.from("daily_tasks")
      .select("id")
      .eq("owner_id", await uid(A))
  ).data!.length;
  const a = await open(browser, users.a, "/duo");
  const b = await open(browser, users.b, "/partner");
  await expect(
    b.page.getByRole("heading", { level: 1, name: /ALICE/ }),
  ).toBeVisible();

  await a.page.getByRole("button", { name: "Sair da dupla" }).click();
  const confirm = a.page.getByRole("alertdialog", {
    name: "Encerrar esta dupla?",
  });
  await expect(confirm).toContainText(
    "Sair encerra esta Dupla para os dois membros.",
  );
  await confirm.getByRole("button", { name: "Encerrar para os dois" }).click();
  await expect(a.page.getByTestId("duo-state")).toHaveText(
    /Duas pessoas\. Um padrão\./,
    { timeout: LIVE },
  );
  // B's app learns it live (duo_ended), without a reload.
  await expect(
    b.page.getByRole("heading", { name: "SEM DUPLA POR ENQUANTO" }),
  ).toBeVisible({
    timeout: LIVE,
  });
  await a.page.goto("/partner");
  await expect(
    a.page.getByRole("heading", { name: "SEM DUPLA POR ENQUANTO" }),
  ).toBeVisible();

  // Personal history stays.
  expect(
    (
      await A.from("daily_tasks")
        .select("id")
        .eq("owner_id", await uid(A))
    ).data!.length,
  ).toBe(aTasksBefore);
  await a.page.goto("/today");
  await expect(a.page.getByTestId("today-count")).toBeVisible();

  // A pairs with C: C sees nothing of the A / B duo.
  await task(A, "Before C", { date: addDays(T, -2), status: "completed" });
  await C.rpc("leave_duo");
  await makeDuo(A, C);
  expect((await C.from("activity_events").select("id")).data).toEqual([]);
  expect((await C.from("reactions").select("id")).data).toEqual([]);
  expect((await C.from("challenges").select("id")).data).toEqual([]);
  expect((await C.rpc("duo_challenges")).data).toEqual([]);
  const old = await C.from("daily_tasks")
    .select("id")
    .eq("owner_id", await uid(A))
    .lt("task_date", T);
  expect(old.data).toEqual([]);
  const c = await open(browser, users.c, "/challenges");
  await expect(c.page.getByText("NENHUM DESAFIO ATIVO")).toBeVisible();
  await c.page.goto("/partner");
  const cFeed = c.page.getByRole("region", { name: "Atividade" });
  await expect(cFeed.getByText("Morning Run")).toHaveCount(0);

  for (const x of [a, b, c]) expect(x.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("installable: manifest, icons and app metadata, no session needed", async ({
  request,
  page,
}) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({
    name: "LOCKED IN",
    short_name: "LOCKED IN",
    display: "standalone",
    start_url: "/", // V2 Phase 1: "/" restores the last route (ADR-055)
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
  });
  for (const icon of m.icons as { src: string; sizes: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);

  const errors: string[] = [];
  page.on(
    "console",
    (msg) => msg.type() === "error" && errors.push(msg.text()),
  );
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0a0a0b",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /apple-touch-icon\.png/,
  );
  await expect(
    page
      .locator(
        'meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]',
      )
      .first(),
  ).toHaveAttribute("content", "yes");
  expect(errors).toEqual([]);
});
