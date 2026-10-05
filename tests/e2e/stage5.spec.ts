import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { Database } from "@/types/database";
import {
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
 * Stage 5: realtime between two real users (Alice = A, Bruno = B) on the
 * DEV project, and isolation from an outsider (Carla = C). Every assertion
 * on the watching side is made WITHOUT reloading that page.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;
let duoId: string;
const LIVE = 15_000; // generous: proves arrival, not a latency budget

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await C.rpc("leave_duo");
  await makeDuo(A, B);
  duoId = (await A.from("duos").select("id").single()).data!.id;
  for (const [title, visible] of [
    ["Morning Run", true],
    ["Gym", true],
    ["Secret journal", false],
  ] as const) {
    const { error } = await A.rpc("create_routine_item", {
      p_title: title,
      p_days: [1, 2, 3, 4, 5, 6, 7],
      p_visible: visible,
    });
    if (error) throw new Error(error.message);
  }
});

test.afterAll(async () => {
  await Promise.all([resetTasks(A), resetTasks(B)]);
  await Promise.all([A, B, C].map((x) => x.rpc("leave_duo")));
});

async function open(browser: Browser, user: TestUser, path: string) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || /duplicate|subscribe multiple/i.test(m.text()))
      errors.push(m.text());
  });
  await signInUI(page, user, path);
  return { context, page, errors };
}

/** The partner card on Today: "<Name>: <status>, …". */
const partnerCard = (
  page: Page,
  name: string,
  status: "online" | "offline" | "em foco",
) => page.getByRole("link", { name: new RegExp(`^${name}: ${status},`) });

const activity = (page: Page) =>
  page.getByRole("region", { name: "Atividade" });

test("A completes a task and B sees it live; undo withdraws it; a private task never shows", async ({
  browser,
}) => {
  const a = await open(browser, users.a, "/today");
  const b = await open(browser, users.b, "/partner");
  const writes = trackWrites(a.page);

  // Both connected and see each other.
  await expect(partnerCard(a.page, "Bruno", "online")).toBeVisible({
    timeout: LIVE,
  });
  await expect(
    b.page.getByText("Online", { exact: false }).first(),
  ).toBeVisible({ timeout: LIVE });

  // A: tap Morning Run. B (on /partner, no reload): activity + task list update.
  await a.page.getByRole("checkbox", { name: "Morning Run" }).click();
  await expect(activity(b.page).getByText("concluiu Morning Run")).toBeVisible({
    timeout: LIVE,
  });
  const bTask = b.page.getByRole("region", { name: "Alice hoje" });
  await expect(bTask.getByText("Morning Run, feita")).toBeAttached({
    timeout: LIVE,
  });
  await writes.idle();

  // A's own feed shows it once (optimistic line replaced by the real event).
  await a.page.goto("/partner");
  await expect(activity(a.page).getByText("concluiu Morning Run")).toHaveCount(
    1,
  );
  await a.page.goto("/today");

  // Undo: B's feed stops showing it (the feed never lies).
  await a.page.getByRole("checkbox", { name: "Morning Run" }).click();
  await expect(activity(b.page).getByText("concluiu Morning Run")).toHaveCount(
    0,
    { timeout: LIVE },
  );
  await writes.idle();

  // Private task: nothing reaches B (no feed line, no title, no toast).
  await a.page.getByRole("checkbox", { name: "Secret journal" }).click();
  await writes.idle();
  await b.page.waitForTimeout(3000);
  await expect(b.page.getByText("Secret journal")).toHaveCount(0);

  // A completes Gym while B is on Today: B gets a toast, also without reload.
  await b.page.getByRole("link", { name: /hoje/i }).first().click();
  await a.page.getByRole("checkbox", { name: "Gym" }).click();
  await expect(
    b.page.getByRole("status").getByText("Alice concluiu Gym"),
  ).toBeVisible({ timeout: LIVE });
  await writes.idle();

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("presence: online, focusing, back online, offline on close, multiple tabs", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await open(browser, users.a, "/today");
  const b = await open(browser, users.b, "/focus");

  await expect(partnerCard(a.page, "Bruno", "online")).toBeVisible({
    timeout: LIVE,
  });

  // B starts a local focus session -> A sees FOCUSING (one presence update, no timer stream).
  await b.page.getByRole("button", { name: "LOCK IN" }).click();
  await expect(
    b.page.getByRole("dialog", { name: "Sessão de Foco" }),
  ).toBeVisible();
  await expect(partnerCard(a.page, "Bruno", "em foco")).toBeVisible({
    timeout: LIVE,
  });
  // The partner card left Today on a phone (docs/NAVIGATION.md): the header
  // chip opens DUPLA, which shows the running clock. The chip stays in the
  // header, so the checks below hold on DUPLA too.
  await partnerCard(a.page, "Bruno", "em foco").click();
  await expect(a.page).toHaveURL(/\/partner$/);
  await expect(a.page.getByTestId("partner-status")).toHaveText(
    /· faltam \d\d:\d\d$/,
  );

  // B ends it -> A sees ONLINE again.
  await b.page
    .getByRole("dialog", { name: "Sessão de Foco" })
    .getByRole("button", { name: "Encerrar sessão" })
    .click();
  await expect(partnerCard(a.page, "Bruno", "online")).toBeVisible({
    timeout: LIVE,
  });

  // Second tab for B, then close the first: B stays online.
  const tab2 = await b.context.newPage();
  await tab2.goto("/today");
  await expect(
    tab2.getByRole("heading", { name: /(BOM DIA|BOA TARDE|BOA NOITE), BRUNO/ }),
  ).toBeVisible();
  await b.page.close();
  await a.page.waitForTimeout(5000);
  await expect(partnerCard(a.page, "Bruno", "online")).toBeVisible();

  // Close the last tab: B goes offline.
  await tab2.close();
  await expect(partnerCard(a.page, "Bruno", "offline")).toBeVisible({
    timeout: 30_000,
  });

  // B comes back: online again.
  const back = await b.context.newPage();
  await back.goto("/today");
  await expect(partnerCard(a.page, "Bruno", "online")).toBeVisible({
    timeout: LIVE,
  });

  expect(a.errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test("missed while offline comes back from the database; connection loss shows and recovers", async ({
  browser,
}) => {
  // B is not connected at all while A completes Gym again (re-completion).
  await A.from("daily_tasks").update({ status: "pending" }).eq("title", "Gym");
  await A.from("daily_tasks")
    .update({ status: "completed" })
    .eq("title", "Gym");

  const b = await open(browser, users.b, "/partner");
  await expect(activity(b.page).getByText("concluiu Gym")).toBeVisible();

  // Network drop on B -> "Offline" pill; back -> pill gone, state refetched.
  await b.context.setOffline(true);
  await expect(
    b.page.getByRole("status").filter({ hasText: "Offline" }),
  ).toBeVisible({ timeout: LIVE });
  await A.from("daily_tasks")
    .update({ status: "completed" })
    .eq("title", "Morning Run");
  await b.context.setOffline(false);
  await expect(
    b.page.getByRole("status").filter({ hasText: /Offline|Reconectando/ }),
  ).toHaveCount(0, {
    timeout: 30_000,
  });
  // The completion that happened while B was offline arrives via refetch.
  await expect(activity(b.page).getByText("concluiu Morning Run")).toBeVisible({
    timeout: LIVE,
  });
  await b.context.close();
});

type Probe = {
  status: string;
  events: string[];
  close: () => Promise<unknown>;
};
type RealtimeCapable = Pick<Api, "channel" | "removeChannel">;

/** Joins a private channel and records broadcasts. */
function join(api: RealtimeCapable, topic: string): Promise<Probe> {
  const events: string[] = [];
  return new Promise((resolve) => {
    const ch = api.channel(topic, { config: { private: true } });
    ch.on("broadcast", { event: "*" }, (m) =>
      events.push(`${m.event}:${JSON.stringify(m.payload)}`),
    );
    const done = (status: string) =>
      resolve({ status, events, close: () => api.removeChannel(ch) });
    const timer = setTimeout(() => done("TIMEOUT"), 12_000);
    ch.subscribe((status, err) => {
      // First join of the day can hit a transient MissingPartition; the client retries by itself.
      if (
        status === "CHANNEL_ERROR" &&
        err?.message?.includes("MissingPartition")
      )
        return;
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        clearTimeout(timer);
        done(status);
      }
    });
  });
}

/** Same library, no session: only the publishable key. */
function anonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

test("realtime authorization: only the duo's members join; broadcasts carry no private data", async () => {
  test.setTimeout(90_000);
  const topic = `duo:${duoId}`;
  await Promise.all([A, B, C].map((x) => x.realtime.setAuth()));
  const anon = anonClient();

  const [pa, pb, pc, fake, pAnon] = await Promise.all([
    join(A, topic),
    join(B, topic),
    join(C, topic),
    join(A, "duo:00000000-0000-4000-8000-000000000000"),
    join(anon, topic),
  ]);
  expect(pa.status).toBe("SUBSCRIBED");
  expect(pb.status).toBe("SUBSCRIBED");
  expect(pc.status).toBe("CHANNEL_ERROR");
  expect(fake.status).toBe("CHANNEL_ERROR");
  expect(pAnon.status).not.toBe("SUBSCRIBED");

  // A completes a shared and a private task: B gets exactly the shared one.
  await A.from("daily_tasks")
    .update({ status: "pending" })
    .in("title", ["Gym", "Secret journal"]);
  await new Promise((r) => setTimeout(r, 1500));
  pb.events.length = 0;
  pc.events.length = 0;
  await A.from("daily_tasks")
    .update({ status: "completed" })
    .eq("title", "Secret journal");
  await A.from("daily_tasks")
    .update({ status: "completed" })
    .eq("title", "Gym");
  await expect
    .poll(() => pb.events.filter((e) => e.startsWith("activity:")).length, {
      timeout: LIVE,
    })
    .toBe(1);
  const payload = pb.events.find((e) => e.startsWith("activity:"))!;
  expect(payload).toContain('"title":"Gym"');
  expect(payload).not.toContain("Secret journal");
  expect(payload).not.toMatch(/notes|timezone|email/);
  expect(pc.events).toEqual([]);

  // Outsider cannot read the persisted feed either; the partner can.
  expect((await C.from("activity_events").select("id")).data).toEqual([]);
  expect(
    (await B.from("activity_events").select("title_snapshot")).data!.map(
      (e) => e.title_snapshot,
    ),
  ).not.toContain("Secret journal");

  await Promise.all([pa, pb, pc, fake, pAnon].map((p) => p.close()));
});
