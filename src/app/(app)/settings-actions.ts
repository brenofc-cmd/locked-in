"use server";

import { t } from "@/i18n/pt-BR";
import { revalidatePath } from "next/cache";
import { authErrorMessage, validatePassword } from "@/lib/auth-errors";
import { authOrigin } from "@/lib/auth-origin";
import { SETTING_COLUMNS, validSetting, type SettingKey } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Settings and onboarding (Stage 8). Identity comes from the session
 * cookie (auth.uid() in RLS); no user id is ever taken from the client.
 */
type Result = { ok: true } | { ok: false; error: string };
type SettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

const FAIL: Result = { ok: false, error: t.actionErrors.saveFailed };

async function userId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  return { supabase, id: typeof id === "string" ? id : null };
}

/** One preference (switch, quiet hours time). */
export async function updateSetting(
  key: SettingKey,
  value: boolean | string,
): Promise<Result> {
  if (!(key in SETTING_COLUMNS) || !validSetting(key, value)) return FAIL;
  try {
    const { supabase, id } = await userId();
    if (!id) return { ok: false, error: t.errors.sessionExpired };
    const patch: SettingsUpdate = { [SETTING_COLUMNS[key]]: value };
    const { error } = await supabase
      .from("user_settings")
      .update(patch)
      .eq("user_id", id);
    if (error)
      return error.code === "23514"
        ? {
            ok: false,
            error: t.actionErrors.quietHoursDiffer,
          }
        : FAIL;
  } catch {
    return FAIL;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Timezone of "today" from now on; history keeps its stored dates. */
export async function updateTimezone(timeZone: string): Promise<Result> {
  let valid = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    valid = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(timeZone);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: t.actionErrors.timezoneInvalid };
  try {
    const { supabase, id } = await userId();
    if (!id) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase
      .from("profiles")
      .update({ timezone: timeZone })
      .eq("id", id);
    if (error)
      return error.code === "22023"
        ? { ok: false, error: t.actionErrors.timezoneInvalid }
        : FAIL;
  } catch {
    return FAIL;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Onboarding finished: the database stores its own time. */
export async function completeOnboarding(): Promise<Result> {
  try {
    const { supabase, id } = await userId();
    if (!id) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase
      .from("user_settings")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", id);
    if (error) return FAIL;
  } catch {
    return FAIL;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Change my password while signed in (Supabase Auth `updateUser`). When the
 * project asks for a recent sign-in, the error says so and the screen offers
 * the e-mail link instead. Raw auth messages never reach the user.
 */
export async function changePassword(
  password: string,
  confirm: string,
): Promise<Result> {
  const invalid = validatePassword(String(password), String(confirm));
  if (invalid) return { ok: false, error: invalid };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub)
      return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase.auth.updateUser({ password });
    if (error)
      return {
        ok: false,
        error:
          error.code === "reauthentication_needed"
            ? t.account.reauth
            : authErrorMessage(error),
      };
  } catch {
    return { ok: false, error: t.errors.network };
  }
  return { ok: true };
}

/**
 * Send a password link to my own e-mail (the same flow as "Esqueci a
 * senha": /auth/confirm → /reset-password). The address comes from the
 * session, never from the client.
 */
export async function sendPasswordLink(): Promise<Result> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await authOrigin()}/auth/confirm?next=/reset-password`,
    });
    if (error) return { ok: false, error: authErrorMessage(error) };
  } catch {
    return { ok: false, error: t.errors.network };
  }
  return { ok: true };
}
