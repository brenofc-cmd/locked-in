import { t } from "@/i18n/pt-BR";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { password, signInUI, users } from "./support";

/**
 * Ajustes → SENHA: wrong input is refused in words and never reaches Auth;
 * a valid change works (sign in with the new password), then the original
 * password is put back so the rest of the suite is unaffected.
 */
test.describe.configure({ mode: "serial" });

const user = users.c;
const TEMP = `${password()}-tmp9`;

async function signInWith(pw: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: user.email(),
    password: pw,
  });
  return { client, error };
}

test.afterAll(async () => {
  // Whatever happened, leave the original password in place.
  const temp = await signInWith(TEMP);
  if (!temp.error) await temp.client.auth.updateUser({ password: password() });
});

test("change the password from Ajustes, then sign in with it", async ({
  page,
}) => {
  await signInUI(page, user, "/settings");
  const section = page.getByRole("region", { name: t.account.password });
  const fresh = section.getByLabel(t.account.newPassword, { exact: true });
  const confirm = section.getByLabel(t.account.confirmPassword, {
    exact: true,
  });
  const save = section.getByRole("button", { name: t.account.savePassword });

  await fresh.fill("short");
  await confirm.fill("short");
  await save.click();
  await expect(section.getByRole("alert")).toHaveText(
    t.authErrors.passwordTooShort(8),
  );

  await fresh.fill(TEMP);
  await confirm.fill(`${TEMP}x`);
  await save.click();
  await expect(section.getByRole("alert")).toHaveText(
    t.authErrors.passwordsDontMatch,
  );

  await confirm.fill(TEMP);
  await save.click();
  await expect(page.getByText(t.account.passwordSaved)).toBeVisible({
    timeout: 15_000,
  });
  await expect(fresh).toHaveValue("");

  const withNew = await signInWith(TEMP);
  expect(withNew.error).toBeNull();
  const withOld = await signInWith(password());
  expect(withOld.error?.code).toBe("invalid_credentials");

  // Put the original back (also covered by afterAll).
  const back = await withNew.client.auth.updateUser({ password: password() });
  expect(back.error).toBeNull();
  expect((await signInWith(password())).error).toBeNull();
});
