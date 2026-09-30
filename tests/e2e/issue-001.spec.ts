import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { t } from "@/i18n/pt-BR";
import { apiAs, password, signInUI, users, type TestUser } from "./support";

/**
 * ISSUE-001 — the first /today after an idle session (docs/DECISIONS.md →
 * ADR-063), against the real DEV Auth and database. Time is controlled
 * through the session cookie instead of waiting an hour: rewriting its
 * `expires_at` into the past makes the proxy treat the access token as
 * expired and refresh it with the (valid or broken) refresh token, exactly
 * like a session left idle. Each test signs in fresh, so no other suite's
 * session is rotated. Alice / Bruno, after the V2 chain (same shared users).
 */
test.describe.configure({ mode: "serial" });

const CRASH = /This page couldn.t load/i;
const COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/;
const CHUNK = 3180;

type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string };
};

async function launch(browser: Browser) {
  const use = test.info().project.use;
  return browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
  });
}

async function signedIn(browser: Browser, user: TestUser) {
  const context = await launch(browser);
  const page = await context.newPage();
  await signInUI(page, user);
  return { context, page };
}

async function readSession(context: BrowserContext) {
  const parts = (await context.cookies())
    .filter((c) => COOKIE.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  expect(parts.length).toBeGreaterThan(0);
  const base = parts[0].name.replace(/\.\d+$/, "");
  const raw = parts.map((c) => decodeURIComponent(c.value)).join("");
  const session: Session = JSON.parse(
    Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString(),
  );
  return { base, parts, session };
}

/** Writes the session back the way @supabase/ssr does (base64, chunked). */
async function writeSession(
  context: BrowserContext,
  edit: (s: Session) => Session,
) {
  const { base, parts, session } = await readSession(context);
  const template = parts[0];
  const value = `base64-${Buffer.from(JSON.stringify(edit(session))).toString("base64url")}`;
  const chunks =
    value.length <= CHUNK
      ? [{ name: base, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
          name: `${base}.${i}`,
          value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        }));
  await context.clearCookies({ name: COOKIE });
  await context.addCookies(
    chunks.map((c) => ({
      ...c,
      domain: template.domain,
      path: template.path,
      expires: template.expires,
      httpOnly: template.httpOnly,
      secure: template.secure,
      sameSite: template.sameSite,
    })),
  );
}

/** As if the tab had been idle past the access token's lifetime. */
const idle = (s: Session): Session => ({
  ...s,
  expires_at: Math.floor(Date.now() / 1000) - 60,
});

async function displayName(user: TestUser) {
  const api = await apiAs(user);
  const { data } = await api.from("profiles").select("id, display_name");
  const { data: me } = await api.auth.getUser();
  await api.auth.signOut({ scope: "local" });
  return data!.find((p) => p.id === me.user!.id)!.display_name;
}

async function expectToday(page: Page, name: string) {
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: new RegExp(`, ${name.toUpperCase()}\\.$`),
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(CRASH)).toHaveCount(0);
}

let alice: string;
let bruno: string;

test.beforeAll(async () => {
  alice = await displayName(users.a);
  bruno = await displayName(users.b);
});

test("valid session: /today loads without a refresh", async ({ browser }) => {
  const { context, page } = await signedIn(browser, users.a);
  const before = (await readSession(context)).session;
  await page.goto("/today");
  await expectToday(page, alice);
  expect((await readSession(context)).session.refresh_token).toBe(
    before.refresh_token,
  );
  await context.close();
});

test("case A — idle session, valid refresh token: /today renews and loads", async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, users.a);
  const before = (await readSession(context)).session;
  await writeSession(context, idle);

  const responses: number[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/today") responses.push(r.status());
  });
  await page.goto("/today");
  await expectToday(page, alice);
  expect(responses).not.toContain(500);

  const after = (await readSession(context)).session;
  expect(after.user.id).toBe(before.user.id);
  expect(after.refresh_token).not.toBe(before.refresh_token); // rotated once
  expect(after.expires_at).toBeGreaterThan(Date.now() / 1000);

  // The renewed session keeps working on the next navigation.
  await page.reload();
  await expectToday(page, alice);
  await context.close();
});

test("case A — parallel first requests of an idle session all load", async ({
  browser,
}) => {
  const { context } = await signedIn(browser, users.a);
  await writeSession(context, idle);
  const pages = await Promise.all([1, 2, 3].map(() => context.newPage()));
  await Promise.all(pages.map((p) => p.goto("/today")));
  for (const p of pages) await expectToday(p, alice);
  await context.close();
});

test("case B — refresh token no longer valid: clean redirect to login", async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, users.a);
  await writeSession(context, (s) => ({
    ...idle(s),
    refresh_token: "issue001-invalid",
  }));
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/);
  await expect(page.getByPlaceholder("E-mail")).toBeVisible();
  await expect(page.getByText(CRASH)).toHaveCount(0);
  expect(
    (await context.cookies()).filter((c) => COOKIE.test(c.name) && c.value),
  ).toHaveLength(0);
  await context.close();
});

test("case B — unreadable session: clean redirect to login", async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, users.a);
  const { parts } = await readSession(context);
  await context.clearCookies({ name: COOKIE });
  await context.addCookies([
    { ...parts[0], name: parts[0].name.replace(/\.\d+$/, ""), value: "x" },
  ]);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(CRASH)).toHaveCount(0);
  await context.close();
});

test("session-ended login is shown to a signed-in browser and leads back to Today", async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, users.a);
  await page.goto("/login?reason=session");
  await expect(page).toHaveURL(/\/login\?reason=session$/); // not bounced: no loop
  await expect(page.getByText(t.auth.sessionEnded)).toBeVisible();
  // Signing in again from this very page replaces the session.
  await page.getByPlaceholder("E-mail").fill(users.a.email());
  await page.getByPlaceholder("Senha").fill(password());
  await page.getByRole("button", { name: "Entrar" }).click();
  await expectToday(page, alice);
  // Without the reason, a signed-in user still goes to Today.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/today$/);
  await context.close();
});

test("two idle users renewing at the same time each see only their own day", async ({
  browser,
}) => {
  const a = await signedIn(browser, users.a);
  const b = await signedIn(browser, users.b);
  const aId = (await readSession(a.context)).session.user.id;
  const bId = (await readSession(b.context)).session.user.id;
  await writeSession(a.context, idle);
  await writeSession(b.context, idle);
  await Promise.all([a.page.goto("/today"), b.page.goto("/today")]);
  await expectToday(a.page, alice);
  await expectToday(b.page, bruno);
  expect((await readSession(a.context)).session.user.id).toBe(aId);
  expect((await readSession(b.context)).session.user.id).toBe(bId);
  await a.context.close();
  await b.context.close();
});
