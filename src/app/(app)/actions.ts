"use server";

import { t } from "@/i18n/pt-BR";
import { revalidatePath } from "next/cache";
import {
  duoErrorMessage,
  isValidInviteCode,
  normalizeInviteCode,
} from "@/lib/invite-code";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Re-render the (app) layout so SessionProvider gets the new duo / profile. */
function refreshSession() {
  revalidatePath("/", "layout");
}

async function run(
  fn: () => Promise<{ error: { message: string } | null }>,
): Promise<ActionResult> {
  try {
    const { error } = await fn();
    if (error) return { ok: false, error: duoErrorMessage(error.message) };
  } catch (e) {
    return {
      ok: false,
      error: duoErrorMessage(e instanceof Error ? e.message : null),
    };
  }
  refreshSession();
  return { ok: true };
}

/** Atomic in the database: duo row + creator membership + invite code. */
export async function createDuo(): Promise<ActionResult> {
  const supabase = await createClient();
  return run(async () => supabase.rpc("create_duo"));
}

export async function joinDuo(input: string): Promise<ActionResult> {
  const code = normalizeInviteCode(input);
  if (!isValidInviteCode(code)) {
    return { ok: false, error: duoErrorMessage("LI_INVALID_CODE") };
  }
  const supabase = await createClient();
  return run(async () => supabase.rpc("join_duo", { p_code: code }));
}

/** V1: leaving ends the duo for both members (see ADR-016). */
export async function leaveDuo(): Promise<ActionResult> {
  const supabase = await createClient();
  return run(async () => supabase.rpc("leave_duo"));
}

export async function updateDisplayName(name: string): Promise<ActionResult> {
  const displayName = name.trim().slice(0, 40);
  if (!displayName) return { ok: false, error: t.actionErrors.enterName };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { ok: false, error: duoErrorMessage("LI_NOT_AUTHENTICATED") };
  return run(async () =>
    supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", id),
  );
}
