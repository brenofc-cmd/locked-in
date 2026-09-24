import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "@/types/database";

/** Loaded by playwright.config.ts from .env.local and .env.test.local (git-ignored). */
function env(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is missing. See docs/DATABASE.md → "Test users".`);
  return v;
}

export const users = {
  brendon: { email: () => env("E2E_BRENDON_EMAIL"), name: "Brendon" },
  lucas: { email: () => env("E2E_LUCAS_EMAIL"), name: "Lucas" },
  a: { email: () => env("E2E_A_EMAIL"), name: "Alice" },
  b: { email: () => env("E2E_B_EMAIL"), name: "Bruno" },
  c: { email: () => env("E2E_C_EMAIL"), name: "Carla" },
};
export type TestUser = (typeof users)[keyof typeof users];

export const password = () => env("E2E_PASSWORD");

/** A Supabase client signed in as a test user, using only the public key (RLS applies). */
export async function apiAs(user: TestUser) {
  const client = createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: user.email(),
    password: password(),
  });
  if (error)
    throw new Error(`Sign-in failed for ${user.email()}: ${error.code}`);
  return client;
}

/** Leaves any duo (ignores "not in a duo"). */
export async function resetDuo(...users: TestUser[]) {
  for (const u of users) {
    const c = await apiAs(u);
    await c.rpc("leave_duo");
    await c.auth.signOut();
  }
}

export async function signInUI(page: Page, user: TestUser, next = "/today") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByPlaceholder("Email").fill(user.email());
  await page.getByPlaceholder("Password").fill(password());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}
