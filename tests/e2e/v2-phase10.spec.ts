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
import { weekStartOf } from "@/lib/progress";
import {
  apiAs,
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
 * V2 Phase 10 — Web Push + reminders + PWA (docs/WEB_PUSH.md). Alice (A),
 * Bruno (B) and Carla (C), shared DEV test users. The browser's push service
 * is replaced by a fake PushManager (headless Chromium has no push service):
 * everything from the permission prompt to the stored row, the scheduler and
 * the service worker is real. Reminder windows are run at a chosen moment
 * through dev_fixture_push_enqueue (the scheduler's own SQL, caller only).
 * Every run starts from no device and no delivery (dev_fixture_reset_push).
 */
test.describe.configure({ mode: "serial" });
// The full Chromium in its new headless mode: the default headless shell
// denies notifications to service workers, so a push could not be shown.
test.use({ channel: "chromium" });

const P = t.push;
const SP = "-03:00"; // America/Sao_Paulo (no DST), the test users' timezone

let A: Api;
let B: Api;
let C: Api;
let T: string;

/** A local São Paulo moment as an ISO instant. */
const at = (date: string, hm: string) => `${date}T${hm}:00${SP}`;

const P256DH =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";

type FakePush = {
  /** Notification.permission when the page opens. */
  permission: NotificationPermission;
  /** What the browser prompt answers. */
  answer?: NotificationPermission;
  /** false: no Push API in this browser. */
  supported?: boolean;
};

/**
 * Replaces the browser's push service, keeping one subscription per browser
 * profile (localStorage), like a real one across reloads and accounts.
 */
async function fakePush(context: BrowserContext, opts: FakePush) {
  await context.addInitScript(
    ({ permission, answer, supported, p256dh, auth }) => {
      const w = window as unknown as {
        __push: { asked: number; unsubscribed: number; subscribed: number };
      };
      w.__push = { asked: 0, unsubscribed: 0, subscribed: 0 };
      const KEY = "__fake_push_endpoint";
      if (!supported) {
        delete (window as { PushManager?: unknown }).PushManager;
        return;
      }
      // Like a real browser, a granted / denied answer outlives a reload.
      const PERM = "__fake_push_permission";
      let perm = (localStorage.getItem(PERM) ??
        permission) as NotificationPermission;
      Object.defineProperty(Notification, "permission", {
        get: () => perm,
        configurable: true,
      });
      Notification.requestPermission = async () => {
        w.__push.asked++;
        perm = answer;
        localStorage.setItem(PERM, perm);
        return perm;
      };
      const make = (endpoint: string) => ({
        endpoint,
        expirationTime: null,
        options: { applicationServerKey: null, userVisibleOnly: true },
        toJSON: () => ({
          endpoint,
          expirationTime: null,
          keys: { p256dh, auth },
        }),
        unsubscribe: async () => {
          localStorage.removeItem(KEY);
          w.__push.unsubscribed++;
          return true;
        },
      });
      PushManager.prototype.subscribe = async function () {
        const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${crypto.randomUUID()}`;
        localStorage.setItem(KEY, endpoint);
        w.__push.subscribed++;
        return make(endpoint) as unknown as PushSubscription;
      };
      PushManager.prototype.getSubscription = async function () {
        const endpoint = localStorage.getItem(KEY);
        return endpoint
          ? (make(endpoint) as unknown as PushSubscription)
          : null;
      };
    },
    {
      permission: opts.permission,
      answer: opts.answer ?? opts.permission,
      supported: opts.supported ?? true,
      p256dh: P256DH,
      auth: AUTH,
    },
  );
}

type Opened = { context: BrowserContext; page: Page; errors: string[] };

async function open(
  browser: Browser,
  user: TestUser,
  path: string,
  push?: FakePush,
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
  if (push) await fakePush(context, push);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInUI(page, user, path);
  return { context, page, errors };
}

const state = (page: Page) => page.getByTestId("push-state");
const probe = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __push: { asked: number; unsubscribed: number; subscribed: number };
        }
      ).__push,
  );

async function devices(api: Api) {
  const { data, error } = await api
    .from("push_subscriptions")
    .select("endpoint, user_agent");
  if (error) throw new Error(error.message);
  return data;
}

async function deliveries(api: Api, kind?: string) {
  let q = api.from("notification_deliveries").select("kind, dedup_key, status");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

/** A device for the API user, as the Settings flow stores it. */
async function addDevice(api: Api, tag: string) {
  const { error } = await api.from("push_subscriptions").insert({
    endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${tag}-${Date.now()}`,
    p256dh: P256DH,
    auth: AUTH,
    user_agent: "Chrome · Linux",
  });
  if (error) throw new Error(error.message);
}

const enqueue = (api: Api, iso: string) =>
  fixture(api, "dev_fixture_push_enqueue", { p_now: iso });

async function event(
  api: Api,
  title: string,
  date: string,
  reminder: number,
  time: string | null = null,
) {
  const { data, error } = await api
    .from("planner_events")
    .insert({
      title,
      event_type: "exam",
      event_date: date,
      event_time: time,
      reminder_days_before: reminder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** No Planner event of a previous test can fall due in this one. */
async function clearEvents(api: Api) {
  const me = (await api.auth.getUser()).data.user!.id;
  await api.from("planner_events").delete().eq("owner_id", me);
}

async function reset(api: Api) {
  await fixture(api, "dev_fixture_reset_push");
  await fixture(api, "dev_fixture_reset_reflection");
  await fixture(api, "dev_fixture_reset_accountability");
  await resetTasks(api);
  const me = (await api.auth.getUser()).data.user!.id;
  await api.from("planner_events").delete().eq("owner_id", me);
  await api
    .from("user_settings")
    .update({
      quiet_hours_enabled: false,
      push_planner: true,
      push_nudges: true,
      push_reviews: true,
      push_weekly_plan: true,
      push_hide_details: false,
    })
    .eq("user_id", me);
  await api.rpc("leave_duo");
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  A = await apiAs(users.a);
  B = await apiAs(users.b);
  C = await apiAs(users.c);
  T = (await A.rpc("my_today")).data as string;
  for (const api of [A, B, C]) await reset(api);
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  for (const api of [A, B, C]) await reset(api);
});

// ----------------------------------------------------------- settings ----

test("1: a browser without Web Push: a neutral statement, nothing breaks", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    supported: false,
  });
  await expect(state(a.page)).toHaveAttribute("data-state", "unsupported");
  await expect(state(a.page)).toHaveText(P.state.unsupported);
  await expect(a.page.getByRole("button", { name: P.enable })).toHaveCount(0);
  await a.page.goto("/today");
  await expect(a.page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context.close();
});

test("2: permission default — no browser prompt until the user taps Ativar", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/today", {
    permission: "default",
    answer: "granted",
  });
  for (const path of ["/today", "/partner", "/progress", "/settings"]) {
    await a.page.goto(path);
    await a.page.waitForLoadState("networkidle");
  }
  expect((await probe(a.page)).asked).toBe(0);
  await expect(state(a.page)).toHaveAttribute("data-state", "off");
  await expect(state(a.page)).toHaveText(P.state.off);
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveAttribute("data-state", "on");
  expect((await probe(a.page)).asked).toBe(1);
  await a.context.close();
});

test("3: permission granted — this device's subscription is stored, once", async ({
  browser,
}) => {
  // Test 2 left Alice's device on; a fresh browser is another device.
  await fixture(A, "dev_fixture_reset_push");
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    answer: "granted",
  });
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  const rows = await devices(A);
  expect(rows).toHaveLength(1);
  expect(rows[0].endpoint).toMatch(
    /^https:\/\/fcm\.googleapis\.com\/fcm\/send\/e2e-/,
  );
  expect(rows[0].user_agent).not.toMatch(/Mozilla|AppleWebKit/); // a label, not the UA
  // Reopening the app keeps it (no second row, no new prompt).
  await a.page.reload();
  await expect(state(a.page)).toHaveText(P.state.on);
  expect(await devices(A)).toHaveLength(1);
  expect((await probe(a.page)).asked).toBe(0);
  // The kinds are offered once the device is on, all on by default.
  for (const name of [P.planner, P.nudges, P.reviews, P.weeklyPlan])
    await expect(
      a.page.getByRole("switch", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("aria-checked", "true");
  await expect(
    a.page.getByRole("switch", { name: new RegExp(`^${P.hideDetails}`) }),
  ).toHaveAttribute("aria-checked", "false");
  await a.context.close();
});

test("4: disable — this device is forgotten and gets nothing more", async ({
  browser,
}) => {
  await fixture(A, "dev_fixture_reset_push");
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    answer: "granted",
  });
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  expect(await devices(A)).toHaveLength(1);

  await a.page.getByRole("button", { name: P.disable }).click();
  await expect(state(a.page)).toHaveText(P.state.off);
  expect(await devices(A)).toHaveLength(0);
  expect((await probe(a.page)).unsubscribed).toBe(1);

  // A reminder that falls due now has no device to go to.
  await event(A, "[e2e] Prova sem aparelho", addDays(T, 3), 1);
  await enqueue(A, at(addDays(T, 2), "08:00"));
  expect(await deliveries(A, "planner")).toHaveLength(0);
  await a.context.close();
});

test("5: sign-out on a shared browser — the next account never gets the previous one's pushes", async ({
  browser,
}) => {
  await fixture(A, "dev_fixture_reset_push");
  await fixture(B, "dev_fixture_reset_push");
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    answer: "granted",
  });
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  expect(await devices(A)).toHaveLength(1);

  // Sair: the server drops this device in the same request.
  await a.page.getByRole("button", { name: t.settings.signOut }).click();
  await expect(a.page).toHaveURL(/\/login/);
  await expect.poll(async () => (await devices(A)).length).toBe(0);

  // Bruno on the same browser: off, nothing of Alice's.
  await signInUI(a.page, users.b, "/settings");
  await expect(state(a.page)).toHaveText(P.state.off);
  expect(await devices(B)).toHaveLength(0);

  // Bruno turns push on here; later his session simply ends (no Sair) and
  // Carla signs in on this browser: the subscription it still holds is
  // Bruno's, so it is dropped on her first open (his row dies at the push
  // service with 404 / 410 on the next send).
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  expect(await devices(B)).toHaveLength(1);
  await a.context.clearCookies();
  const before = (await probe(a.page)).unsubscribed;
  await signInUI(a.page, users.c, "/today");
  await expect
    .poll(async () => (await probe(a.page)).unsubscribed)
    .toBeGreaterThan(before);
  await a.page.goto("/settings");
  await expect(state(a.page)).toHaveText(P.state.off);
  expect(await devices(C)).toHaveLength(0);
  await fixture(B, "dev_fixture_reset_push");
  await a.context.close();
});

test("6: permission denied — a short explanation, never another prompt", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/settings", { permission: "denied" });
  await expect(state(a.page)).toHaveAttribute("data-state", "denied");
  await expect(state(a.page)).toHaveText(P.state.denied);
  await expect(a.page.getByRole("button", { name: P.enable })).toHaveCount(0);
  await a.page.reload();
  await a.page.goto("/today");
  expect((await probe(a.page)).asked).toBe(0);
  await a.context.close();
});

// ---------------------------------------------------------- reminders ----

test("7: a Planner event with a reminder becomes a due push at 08:00 of the reminder day", async () => {
  await fixture(A, "dev_fixture_reset_push");
  await clearEvents(A);
  await addDevice(A, "planner");
  const id = await event(A, "[e2e] Prova de Física", addDays(T, 3), 1);
  await enqueue(A, at(addDays(T, 2), "07:59"));
  expect(await deliveries(A, "planner")).toHaveLength(0);
  await enqueue(A, at(addDays(T, 2), "08:00"));
  expect(await deliveries(A, "planner")).toEqual([
    {
      kind: "planner",
      dedup_key: `planner:${id}:1:${addDays(T, 3)}`,
      status: expect.stringMatching(/pending|sending|sent|failed/),
    },
  ]);
});

test("8: quiet hours hold it back and release it when they end", async () => {
  await fixture(A, "dev_fixture_reset_push");
  await clearEvents(A);
  await addDevice(A, "quiet");
  const me = (await A.auth.getUser()).data.user!.id;
  await A.from("user_settings")
    .update({
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "09:00",
    })
    .eq("user_id", me);
  await event(A, "[e2e] Trabalho", addDays(T, 4), 1);
  await enqueue(A, at(addDays(T, 3), "08:00"));
  expect(await deliveries(A, "planner")).toHaveLength(0);
  await enqueue(A, at(addDays(T, 3), "09:00"));
  expect(await deliveries(A, "planner")).toHaveLength(1);
  await A.from("user_settings")
    .update({ quiet_hours_enabled: false })
    .eq("user_id", me);
});

test("9: the same reminder evaluated again — one delivery only", async () => {
  await fixture(A, "dev_fixture_reset_push");
  await clearEvents(A);
  await addDevice(A, "dedup");
  await event(A, "[e2e] Entrega", addDays(T, 5), 1);
  for (const hm of ["08:00", "08:01", "08:05", "12:00"])
    await enqueue(A, at(addDays(T, 4), hm));
  expect(await deliveries(A, "planner")).toHaveLength(1);
});

test("10: DAR UM TOQUE — one push candidate, no second nudge", async ({
  browser,
}) => {
  await fixture(A, "dev_fixture_reset_push");
  await makeDuo(A, B);
  await addDevice(A, "nudge");
  const { data, error } = await A.rpc("create_commitment", {
    p_title: "[e2e] Ler 30 min",
    p_kind: "simple",
  });
  if (error || !data?.[0]) throw new Error(`commitment: ${error?.message}`);
  const b = await open(browser, users.b, "/partner");
  const writes = trackWrites(b.page);
  const item = b.page
    .getByTestId("partner-commitment")
    .filter({ hasText: "[e2e] Ler 30 min" });
  await item.getByTestId("nudge-button").click();
  await expect(item.getByTestId("nudge-button")).toBeDisabled();
  // The button is disabled while sending: wait for the nudge to be stored
  // before the scheduler looks for it.
  await writes.idle();

  await enqueue(A, new Date().toISOString());
  await enqueue(A, new Date(Date.now() + 60_000).toISOString());
  const pushes = await deliveries(A, "nudge");
  expect(pushes).toHaveLength(1);
  expect(pushes[0].dedup_key).toMatch(/^nudge:/);
  // The Phase 6 limits are unchanged: the push did not create a nudge.
  const { count } = await A.from("nudges").select("*", {
    count: "exact",
    head: true,
  });
  expect(count).toBe(1);
  expect(await deliveries(B, "nudge")).toHaveLength(0);
  await b.context.close();
  await A.rpc("leave_duo");
});

test("11: Review semanal — once per week, not when written", async () => {
  await fixture(A, "dev_fixture_reset_push");
  await addDevice(A, "review");
  await A.from("daily_tasks").insert({ title: "[e2e] Semana" });
  const sunday = addDays(weekStartOf(T), 6);
  await enqueue(A, at(sunday, "19:00"));
  await enqueue(A, at(sunday, "19:30"));
  expect(await deliveries(A, "review_week")).toEqual([
    {
      kind: "review_week",
      dedup_key: `review-week:${weekStartOf(T)}`,
      status: expect.any(String),
    },
  ]);
});

test("12: Planejamento semanal — Monday once, never for a planned week", async () => {
  await fixture(A, "dev_fixture_reset_push");
  await addDevice(A, "plan");
  const monday = addDays(weekStartOf(T), 7);
  await enqueue(A, at(monday, "08:00"));
  await enqueue(A, at(monday, "10:00"));
  expect(await deliveries(A, "plan_week")).toHaveLength(1);
  // Planned (next week, from PLANEJAR): the following Monday stays quiet.
  await fixture(A, "dev_fixture_reset_push");
  await addDevice(A, "plan2");
  await A.from("weekly_priorities").insert({
    week_start: monday,
    position: 1,
    title: "[e2e] Prioridade",
  });
  await enqueue(A, at(monday, "08:00"));
  expect(await deliveries(A, "plan_week")).toHaveLength(0);
  await fixture(A, "dev_fixture_reset_reflection");
});

// ------------------------------------------------------ service worker ----

/** The page's service worker registration id, through the DevTools protocol. */
async function swSession(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const ids = new Set<string>();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    for (const r of e.registrations)
      if (!r.isDeleted && r.scopeURL.endsWith("/")) ids.add(r.registrationId);
  });
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => ids.size, { timeout: 15_000 }).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  return {
    push: (data: unknown) =>
      cdp.send("ServiceWorker.deliverPushMessage", {
        origin,
        registrationId: [...ids][0],
        data: JSON.stringify(data),
      }),
  };
}

const shown = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const list = (await reg?.getNotifications()) ?? [];
    return list.map((n) => ({
      title: n.title,
      body: n.body,
      route: (n.data as { route?: string } | null)?.route,
    }));
  });

/**
 * Taps the first notification shown: dispatches "notificationclick" in the
 * real service worker (a test cannot reach the system tray).
 */
async function clickNotification(context: BrowserContext) {
  const [worker] = context.serviceWorkers();
  await worker.evaluate(async () => {
    const scope = self as unknown as {
      registration: ServiceWorkerRegistration;
      dispatchEvent(event: Event): boolean;
    };
    const NotificationEvent = (
      globalThis as unknown as {
        NotificationEvent: new (
          type: string,
          init: { notification: Notification },
        ) => Event;
      }
    ).NotificationEvent;
    const [notification] = await scope.registration.getNotifications();
    scope.dispatchEvent(
      new NotificationEvent("notificationclick", { notification }),
    );
  });
}

async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

test("13: a push reaches the service worker and shows the safe payload", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/today");
  await a.context.grantPermissions(["notifications"]);
  await swReady(a.page);
  const sw = await swSession(a.page);
  await sw.push({
    k: "test",
    t: "LOCKED IN",
    b: "Notificação de teste. Está funcionando.",
    r: "settings",
    g: "test-e2e",
  });
  await expect
    .poll(() => shown(a.page))
    .toEqual([
      {
        title: "LOCKED IN",
        body: "Notificação de teste. Está funcionando.",
        route: "/settings",
      },
    ]);
  await a.context.close();
});

test("14: tapping a notification focuses the open LOCKED IN and goes to its route", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/progress");
  await a.context.grantPermissions(["notifications"]);
  await swReady(a.page);
  const sw = await swSession(a.page);
  await sw.push({
    k: "test",
    t: "Prova amanhã",
    b: "Física",
    r: "planner",
    g: "p-e2e",
  });
  await expect.poll(async () => (await shown(a.page)).length).toBe(1);
  await clickNotification(a.context);
  await expect(a.page).toHaveURL(/\/planner$/, { timeout: 15_000 });
  await a.context.close();
});

test("15: an unknown or malicious route in a payload opens Today", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/today");
  await a.context.grantPermissions(["notifications"]);
  await swReady(a.page);
  const sw = await swSession(a.page);
  await sw.push({
    k: "test",
    t: "x",
    b: "y",
    r: "https://evil.example/steal",
    g: "m1",
  });
  await sw.push({ k: "test", t: "x", b: "y", r: "/login", g: "m2" });
  await expect
    .poll(async () => (await shown(a.page)).map((n) => n.route))
    .toEqual(["/today", "/today"]);
  await a.context.close();
});

// ----------------------------------------------------------------- PWA ----

test("16: manifest, one service worker, the offline page and safe caching", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/today");
  const manifest = await (
    await a.page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest).toMatchObject({
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  await swReady(a.page);
  const regs = await a.page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => ({
      scope: r.scope,
      script: r.active?.scriptURL,
    })),
  );
  expect(regs).toHaveLength(1);
  expect(regs[0].script).toMatch(/\/sw\.js$/);

  const sw = await a.page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-store");
  // The offline page is public, static and has no data.
  const offline = await a.page.request.get("/offline", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain(t.offline.title);

  // Only the offline page is cached: never a page, an API answer or a token.
  const cached = await a.page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys())
        out.push(new URL(req.url).pathname);
    return out;
  });
  expect(cached).toEqual(["/offline"]);

  // Without network a navigation shows the offline page, not a blank one.
  await a.context.setOffline(true);
  await a.page.goto("/progress").catch(() => undefined);
  await expect(
    a.page.getByRole("heading", { name: t.offline.title }),
  ).toBeVisible();
  await a.context.setOffline(false);
  await a.page.goto("/today");
  await expect(a.page.getByRole("heading", { level: 1 })).toBeVisible();
  await a.context.close();
});

test("17: launching the installed app (/) still restores the last screen", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/progress");
  await swReady(a.page);
  await a.page.goto("/plan");
  await expect(a.page).toHaveURL(/\/plan$/);
  await a.page.waitForTimeout(500);
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/plan$/, { timeout: 15_000 });
  await a.context.close();
});

test("18: a notification's route beats Resume State", async ({ browser }) => {
  const a = await open(browser, users.a, "/progress");
  await a.context.grantPermissions(["notifications"]);
  await swReady(a.page);
  await a.page.waitForTimeout(500); // /progress is now the remembered route
  const sw = await swSession(a.page);
  await sw.push({
    k: "test",
    t: "Planejamento semanal",
    b: "x",
    r: "plan-week",
    g: "r-e2e",
  });
  await expect.poll(async () => (await shown(a.page)).length).toBe(1);
  await clickNotification(a.context);
  await expect(a.page).toHaveURL(/\/plan\/week$/, { timeout: 15_000 });
  await a.page.waitForTimeout(2_000);
  await expect(a.page).toHaveURL(/\/plan\/week$/);
  await a.context.close();
});

test("19: with push on, the app stays idle — no periodic request for 70 s", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await fixture(A, "dev_fixture_reset_push");
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    answer: "granted",
  });
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  await a.page.goto("/today");
  await a.page.waitForLoadState("networkidle");
  const seen: string[] = [];
  a.page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("data:") && !url.includes("/_next/static/"))
      seen.push(`${r.method()} ${url}`);
  });
  await a.page.waitForTimeout(70_000);
  expect(seen).toEqual([]);
  await a.context.close();
});

// ------------------------------------------------- final UI audit (V2) ----

test("20: axe — no serious / critical issue on push settings, next-week planning and the offline page", async ({
  browser,
}) => {
  await fixture(A, "dev_fixture_reset_push");
  await fixture(A, "dev_fixture_reset_reflection"); // next week starts empty
  const a = await open(browser, users.a, "/settings", {
    permission: "default",
    answer: "granted",
  });
  await a.page.getByRole("button", { name: P.enable }).click();
  await expect(state(a.page)).toHaveText(P.state.on);
  const report: string[] = [];
  for (const path of ["/settings", "/plan/week?w=next", "/offline"]) {
    await a.page.goto(path);
    await a.page.waitForLoadState("load");
    await a.page.waitForTimeout(600);
    const { violations } = await new AxeBuilder({ page: a.page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const v of violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ))
      report.push(`${path} ${v.id} (${v.impact})`);
  }
  expect(report).toEqual([]);
  // The next week says so (no "desta semana" on PRÓXIMA SEMANA).
  await a.page.goto("/plan/week?w=next");
  await expect(
    a.page.getByPlaceholder(t.weeklyPlan.placeholderNext),
  ).toBeVisible();
  await expect(a.page.getByText(t.weeklyPlan.emptyNext)).toBeVisible();
  await a.context.close();
});

test("21: responsive — no horizontal scroll on the main screens from 375 to 1440", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const a = await open(browser, users.a, "/today");
  const report: string[] = [];
  for (const width of [375, 390, 430, 768, 958, 1180, 1440]) {
    await a.page.setViewportSize({ width, height: 900 });
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
      await a.page.waitForTimeout(300);
      const over = await a.page.evaluate(() => {
        const doc = document.scrollingElement!;
        const main = document.querySelector("main");
        return {
          page: doc.scrollWidth - doc.clientWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
        };
      });
      if (over.page > 0 || over.main > 0)
        report.push(`${width} ${path} page+${over.page} main+${over.main}`);
    }
  }
  expect(report).toEqual([]);
  await a.context.close();
});

// ------------------------------------------------------- UI declutter ----

test("22: declutter — one-line event summaries, a compact activity feed, expandable rules", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await clearEvents(A);
  // No subject, and the title already says PROVA: never "PROVA · PROVA …".
  const ins = await A.from("planner_events").insert({
    title: "Prova de Matemática",
    event_type: "exam",
    event_date: addDays(T, 2),
  });
  if (ins.error) throw new Error(ins.error.message);

  // Bruno completes 8 shared tasks: Alice's feed has more than the preview.
  await makeDuo(A, B);
  await resetTasks(B);
  const titles = Array.from({ length: 8 }, (_, i) => `Declutter ${i + 1}`);
  for (const title of titles) {
    const { error } = await B.rpc("create_routine_item", {
      p_title: title,
      p_days: [1, 2, 3, 4, 5, 6, 7],
    });
    if (error) throw new Error(error.message);
  }
  for (const title of titles) {
    const upd = await B.from("daily_tasks")
      .update({ status: "completed" })
      .eq("task_date", T)
      .eq("title", title);
    if (upd.error) throw new Error(upd.error.message);
  }

  const a = await open(browser, users.a, "/today");
  const card = a.page.getByRole("region", { name: t.todayScreen.next });
  await expect(card).toContainText("PROVA DE MATEMÁTICA");
  await expect(card).not.toContainText("PROVA · PROVA");
  await a.page.goto("/plan");
  await expect(a.page.getByTestId("plan-next")).toContainText(
    "PROVA DE MATEMÁTICA",
  );
  await expect(a.page.getByTestId("plan-next")).not.toContainText(
    "PROVA · PROVA",
  );

  // DUPLA: the latest 6 lines, the rest one tap away, nothing lost.
  await a.page.goto("/partner");
  const feed = a.page.getByRole("region", {
    name: t.partnerScreen.activityAria,
  });
  const items = feed.getByTestId("activity-item");
  await expect(items).toHaveCount(6);
  for (const title of titles.slice(-3)) await expect(feed).toContainText(title);
  const more = feed.getByRole("button", { name: /Ver toda a atividade/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const label = (await more.textContent()) ?? "";
  const total = Number(/\((\d+)\)/.exec(label)?.[1]);
  expect(total).toBeGreaterThanOrEqual(8);
  await more.click();
  await expect(items).toHaveCount(total);
  for (const title of titles) await expect(feed).toContainText(title);
  const less = feed.getByRole("button", {
    name: t.partnerScreen.activityLess,
  });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  // Keyboard: Enter collapses back to the preview.
  await less.focus();
  await a.page.keyboard.press("Enter");
  await expect(items).toHaveCount(6);
  await expect(more).toBeFocused();

  // Duel and week rules: closed by default, the chevron turns when open,
  // the summary works from the keyboard.
  const rulesOf = (scope: ReturnType<Page["getByTestId"]>) => ({
    details: scope.locator("details"),
    summary: scope.locator("summary"),
    chevron: scope.locator("summary > span[aria-hidden='true']"),
  });
  const rotation = (l: ReturnType<Page["locator"]>) =>
    l.evaluate((el) => getComputedStyle(el).rotate);
  for (const scope of [
    a.page.getByTestId("duel-detailed"),
    a.page.getByRole("region", { name: t.partnerScreen.thisWeekAria }),
  ]) {
    const r = rulesOf(scope as ReturnType<Page["getByTestId"]>);
    await expect(r.summary).toHaveText(new RegExp(t.duel.rulesTitle));
    await expect(r.details).toHaveJSProperty("open", false);
    expect(await rotation(r.chevron)).toBe("none");
    await r.summary.focus();
    await a.page.keyboard.press("Enter");
    await expect(r.details).toHaveJSProperty("open", true);
    await expect.poll(() => rotation(r.chevron)).toBe("90deg");
    await a.page.keyboard.press("Space");
    await expect(r.details).toHaveJSProperty("open", false);
    await r.summary.click();
    await expect(r.details).toHaveJSProperty("open", true);
  }
  await expect(a.page.getByTestId("duel-detailed")).toContainText(
    t.duel.rules[0],
  );
  await expect(a.page.locator("main")).toContainText(t.partnerScreen.rule);

  // axe on DUPLA with everything expanded.
  await more.click();
  await expect(items).toHaveCount(total);
  await a.page.waitForTimeout(800); // the lines' entry animation (0.55 s)
  const { violations } = await new AxeBuilder({ page: a.page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  expect(a.errors).toEqual([]);
  await a.context.close();
  await clearEvents(A);
});
