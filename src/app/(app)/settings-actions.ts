"use server";

import { revalidatePath } from "next/cache";
import { SETTING_COLUMNS, validSetting, type SettingKey } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Settings and onboarding (Stage 8). Identity comes from the session
 * cookie (auth.uid() in RLS); no user id is ever taken from the client.
 */
type Result = { ok: true } | { ok: false; error: string };
type SettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

const FAIL: Result = { ok: false, error: "Could not save. Try again." };

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
    if (!id)
      return { ok: false, error: "Your session expired. Sign in again." };
    const patch: SettingsUpdate = { [SETTING_COLUMNS[key]]: value };
    const { error } = await supabase
      .from("user_settings")
      .update(patch)
      .eq("user_id", id);
    if (error)
      return error.code === "23514"
        ? {
            ok: false,
            error: "Quiet hours need a start and an end that differ.",
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
  if (!valid) return { ok: false, error: "Choose a valid timezone." };
  try {
    const { supabase, id } = await userId();
    if (!id)
      return { ok: false, error: "Your session expired. Sign in again." };
    const { error } = await supabase
      .from("profiles")
      .update({ timezone: timeZone })
      .eq("id", id);
    if (error)
      return error.code === "22023"
        ? { ok: false, error: "Choose a valid timezone." }
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
    if (!id)
      return { ok: false, error: "Your session expired. Sign in again." };
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
