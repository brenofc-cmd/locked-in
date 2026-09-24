import { test as setup } from "@playwright/test";
import {
  apiAs,
  makeDuo,
  seedDesignDay,
  signInUI,
  users,
  type TestUser,
} from "./support";

/**
 * Real data for the Stage 2 UI suite. Each Playwright project has its own
 * user so parallel projects never share mutable tasks:
 *   mobile-390   -> Brendon (duo with Lucas)
 *   desktop-1440 -> "Brendon" desk user (duo with a second "Lucas")
 *   mobile-375 / mobile-430 -> "Brendon" layout user (read-only tests)
 * Each gets the approved design's Today (12 tasks, 8 done) as real routine
 * items and daily tasks, then signs in through /login; cookies are saved.
 */
async function prepare(
  page: import("@playwright/test").Page,
  user: TestUser,
  partner: TestUser | null,
  state: string,
) {
  const api = await apiAs(user);
  await seedDesignDay(api);
  if (partner) await makeDuo(api, await apiAs(partner));
  else await api.rpc("leave_duo");
  await signInUI(page, user);
  await page.context().storageState({ path: state });
  await page.context().clearCookies();
}

setup("seed and sign in the UI suite users", async ({ page }) => {
  setup.setTimeout(120_000);
  await prepare(
    page,
    users.brendon,
    users.lucas,
    "tests/e2e/.auth/brendon.json",
  );
  await prepare(page, users.desk, users.lucas2, "tests/e2e/.auth/desk.json");
  await prepare(page, users.layout, null, "tests/e2e/.auth/layout.json");
});
