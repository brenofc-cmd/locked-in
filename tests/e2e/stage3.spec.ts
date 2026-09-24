import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiAs, resetDuo, signInUI, users, type TestUser } from "./support";

/**
 * Stage 3: real Supabase Auth + Duo against the DEV project.
 * Uses the shared Alice / Bruno / Carla test users, so the file runs serially
 * in its own Playwright project ("stage3") and resets their duos first.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetDuo(users.a, users.b, users.c);
});
test.afterAll(async () => {
  await resetDuo(users.a, users.b, users.c);
});

async function signedInPage(browser: Browser, user: TestUser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signInUI(page, user);
  return page;
}

const greeting = (page: Page, name: string) =>
  page.getByRole("heading", { name: `GOOD MORNING, ${name.toUpperCase()}.` });

test("private routes redirect to sign in without rendering private content", async ({
  page,
}) => {
  for (const path of [
    "/today",
    "/partner",
    "/focus",
    "/progress",
    "/more",
    "/routine",
    "/challenges",
    "/duo",
    "/settings",
  ]) {
    const response = await page.goto(path);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    // The redirect happens on the server: the private page never reached the browser.
    expect(response?.request().redirectedFrom()?.url()).toContain(path);
    await expect(page.getByText("GOOD MORNING")).toHaveCount(0);
  }
});

test("wrong password shows a friendly error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(users.a.email());
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(`p[role="alert"]`)).toHaveText(
    "Wrong email or password.",
  );
  await expect(page.getByText(/AuthApiError|invalid_credentials/)).toHaveCount(
    0,
  );
});

test("sign up validates locally and detects the browser timezone", async ({
  browser,
}) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  await page.goto("/signup");
  await expect(page.locator('input[name="timezone"]')).toHaveValue(
    "Asia/Tokyo",
  );
  await page.getByPlaceholder("Name").fill("Test");
  await page.getByPlaceholder("Email").fill("nobody@example.com");
  await page.getByPlaceholder("Password", { exact: true }).fill("longenough1");
  await page.getByPlaceholder("Confirm password").fill("different11");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(`p[role="alert"]`)).toHaveText(
    "Passwords don't match.",
  );
  await context.close();
});

test("A creates a duo, B joins, both see each other, C is refused; state survives refresh and re-login", async ({
  browser,
}) => {
  const a = await signedInPage(browser, users.a);
  const b = await signedInPage(browser, users.b);
  const c = await signedInPage(browser, users.c);

  // Real names from profiles.
  await expect(greeting(a, "Alice")).toBeVisible();
  await expect(greeting(b, "Bruno")).toBeVisible();

  // A: no duo -> create -> waiting with a real invite code.
  await a.goto("/duo");
  await expect(a.getByTestId("duo-state")).toHaveText(
    "Two people. One standard. Invite your partner.",
  );
  await a.getByRole("button", { name: "CREATE DUO" }).click();
  const codeEl = a.getByTestId("invite-code");
  await expect(codeEl).toHaveText(/^LKD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  const code = (await codeEl.textContent())!;
  await expect(a.getByTestId("duo-state")).toHaveText(
    "Waiting for your partner. Share your code.",
  );

  // No fake partner while waiting.
  await a.goto("/today");
  await expect(a.getByText("WAITING FOR YOUR PARTNER")).toBeVisible();
  await expect(a.getByText("Lucas")).toHaveCount(0);

  // B: joins with a sloppy code (lower case, no dash).
  await b.goto("/duo");
  await b
    .getByLabel("JOIN WITH A CODE")
    .fill(code.toLowerCase().replace("-", " "));
  await b.getByRole("button", { name: "Join" }).click();
  await expect(b.getByTestId("duo-state")).toHaveText(
    "You and Alice see each other's day.",
  );
  await expect(b.getByTestId("duo-partner-name")).toHaveText("Alice");

  // A sees B after a refresh (no realtime until Stage 5).
  await a.goto("/duo");
  await expect(a.getByTestId("duo-partner-name")).toHaveText("Bruno");
  await a.goto("/today");
  await expect(a.getByRole("link", { name: /^Bruno:/ })).toBeVisible();

  // C: the duo is full.
  await c.goto("/duo");
  await c.getByLabel("JOIN WITH A CODE").fill(code);
  await c.getByRole("button", { name: "Join" }).click();
  await expect(c.locator(`p[role="alert"]`)).toHaveText(
    "That duo is already full. Duos are two people.",
  );
  await c.reload();
  await expect(c.getByTestId("duo-state")).toHaveText(
    "Two people. One standard. Invite your partner.",
  );

  // Invalid code is caught with friendly copy.
  await c.getByLabel("JOIN WITH A CODE").fill("LKD-ZZZZZZ");
  await c.getByRole("button", { name: "Join" }).click();
  await expect(c.locator(`p[role="alert"]`)).toHaveText(
    "That code doesn't match any duo. Check it and try again.",
  );

  // Refresh keeps everyone signed in and the duo intact.
  await b.reload();
  await expect(b.getByTestId("duo-partner-name")).toHaveText("Alice");

  // A: sign out -> private routes are closed -> sign in again -> duo is still there.
  await a.goto("/settings");
  await a.getByRole("button", { name: "Sign out" }).click();
  await expect(a).toHaveURL(/\/login$/);
  await a.goto("/today");
  await expect(a).toHaveURL(/\/login\?next=%2Ftoday$/);
  await a.reload();
  await expect(a).toHaveURL(/\/login/);
  await signInUI(a, users.a, "/duo");
  await expect(a.getByTestId("duo-partner-name")).toHaveText("Bruno");

  // A closes the tab and opens a new one in the same browser: still signed in.
  const again = await a.context().newPage();
  await a.close();
  await again.goto("/today");
  await expect(greeting(again, "Alice")).toBeVisible();
});

test("database rules hold through the public API: RLS and concurrent joins", async () => {
  await resetDuo(users.a, users.b, users.c);
  const [a, b, c] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);

  for (let round = 0; round < 5; round++) {
    await Promise.all([a, b, c].map((x) => x.rpc("leave_duo")));
    const created = await a.rpc("create_duo");
    expect(created.error).toBeNull();
    const code = created.data![0].invite_code;

    // B and C race for the second seat: exactly one wins.
    const [rb, rc] = await Promise.all([
      b.rpc("join_duo", { p_code: code }),
      c.rpc("join_duo", { p_code: code }),
    ]);
    const errors = [rb.error, rc.error].filter(Boolean);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("LI_DUO_FULL");
    const members = await a.from("duo_members").select("user_id");
    expect(members.data).toHaveLength(2);
  }

  // Leave a known state: A + B together, C outside.
  await Promise.all([a, b, c].map((x) => x.rpc("leave_duo")));
  const { data } = await a.rpc("create_duo");
  await b.rpc("join_duo", { p_code: data![0].invite_code });

  // C (outsider) sees nothing of A/B and cannot change their profiles.
  expect((await c.from("duos").select("id")).data).toHaveLength(0);
  expect((await c.from("duo_members").select("user_id")).data).toHaveLength(0);
  expect((await c.from("profiles").select("id")).data).toHaveLength(1);
  const aId = (await a.auth.getUser()).data.user!.id;
  const bId = (await b.auth.getUser()).data.user!.id;
  const hack = await c
    .from("profiles")
    .update({ display_name: "hacked" })
    .eq("id", aId)
    .select();
  expect(hack.data).toHaveLength(0);

  // A cannot change partner B; A cannot join a second duo; C cannot enter as third.
  expect(
    (
      await a
        .from("profiles")
        .update({ display_name: "hacked" })
        .eq("id", bId)
        .select()
    ).data,
  ).toHaveLength(0);
  const cDuo = await c.rpc("create_duo");
  expect(
    (await a.rpc("join_duo", { p_code: cDuo.data![0].invite_code })).error
      ?.message,
  ).toContain("LI_ALREADY_IN_DUO");
  expect(
    (await c.rpc("join_duo", { p_code: data![0].invite_code })).error?.message,
  ).toContain("LI_ALREADY_IN_DUO");
  await c.rpc("leave_duo");
  expect(
    (await c.rpc("join_duo", { p_code: data![0].invite_code })).error?.message,
  ).toContain("LI_DUO_FULL");

  // A and B see each other.
  expect(
    (await a.from("profiles").select("display_name").order("display_name"))
      .data,
  ).toEqual([{ display_name: "Alice" }, { display_name: "Bruno" }]);
  expect((await b.from("duo_members").select("user_id")).data).toHaveLength(2);

  // Direct writes are refused by grants, not just RLS.
  expect(
    (
      await c
        .from("duo_members")
        .insert({ duo_id: cDuo.data![0].duo_id, user_id: aId, seat: 2 })
    ).error?.code,
  ).toBe("42501");
});
