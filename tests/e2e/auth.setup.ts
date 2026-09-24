import { test as setup } from "@playwright/test";
import { apiAs, resetDuo, signInUI, users } from "./support";

/**
 * Real sign-in for the UI suite: Brendon and Lucas (DEV test users) form a
 * fresh duo, then Brendon signs in through /login and the cookies are saved.
 */
setup("sign in as Brendon with Lucas as partner", async ({ page }) => {
  await resetDuo(users.brendon, users.lucas);
  const brendon = await apiAs(users.brendon);
  const { data, error } = await brendon.rpc("create_duo");
  if (error || !data?.[0])
    throw new Error(`create_duo failed: ${error?.message}`);
  const lucas = await apiAs(users.lucas);
  const joined = await lucas.rpc("join_duo", { p_code: data[0].invite_code });
  if (joined.error) throw new Error(`join_duo failed: ${joined.error.message}`);

  await signInUI(page, users.brendon);
  await page.context().storageState({ path: "tests/e2e/.auth/brendon.json" });
});
