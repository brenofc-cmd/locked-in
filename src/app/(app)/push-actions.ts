"use server";

import { t } from "@/i18n/pt-BR";
import { deviceLabel, subscriptionInput } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

/**
 * Web Push on this device (V2 Phase 10, docs/WEB_PUSH.md). Identity comes
 * from the session cookie (RLS: own rows only); the client sends only the
 * subscription it holds, never a user id.
 */
export type PushResult =
  { ok: true } | { ok: false; error: string; code?: "taken" | "rate_limited" };

const FAIL: PushResult = { ok: false, error: t.push.errors.failed };

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  return { supabase, signedIn: typeof id === "string" };
}

/**
 * Stores (or refreshes) this device's subscription. An endpoint that still
 * belongs to someone else (a shared browser) is refused by RLS → "taken":
 * the client drops that subscription and makes a new one.
 */
export async function savePushSubscription(
  json: unknown,
  userAgent: string,
): Promise<PushResult> {
  const input = subscriptionInput(json);
  if (!input) return FAIL;
  try {
    const { supabase, signedIn } = await client();
    if (!signedIn) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        ...input,
        user_agent: deviceLabel(String(userAgent).slice(0, 300)),
      },
      { onConflict: "endpoint" },
    );
    if (error)
      return error.code === "42501"
        ? { ok: false, error: t.push.errors.failed, code: "taken" }
        : FAIL;
  } catch {
    return FAIL;
  }
  return { ok: true };
}

/** Forgets this device (disable here). Only the caller's own row can go. */
export async function removePushSubscription(
  endpoint: string,
): Promise<PushResult> {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return FAIL;
  try {
    const { supabase, signedIn } = await client();
    if (!signedIn) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    if (error) return FAIL;
  } catch {
    return FAIL;
  }
  return { ok: true };
}

/** Is the subscription this browser holds the signed-in user's own? */
export async function isMyPushSubscription(
  endpoint: string,
): Promise<boolean | null> {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return null;
  try {
    const { supabase, signedIn } = await client();
    if (!signedIn) return null;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) return null;
    return data !== null;
  } catch {
    return null;
  }
}

/** ENVIAR NOTIFICAÇÃO DE TESTE: at most one a minute (database rule). */
export async function requestTestPush(): Promise<PushResult> {
  try {
    const { supabase, signedIn } = await client();
    if (!signedIn) return { ok: false, error: t.errors.sessionExpired };
    const { error } = await supabase
      .from("notification_deliveries")
      .insert({ kind: "test" });
    if (error)
      return error.message.includes("LI_RATE_LIMITED") || error.code === "23505"
        ? {
            ok: false,
            error: t.push.errors.rateLimited,
            code: "rate_limited",
          }
        : FAIL;
  } catch {
    return FAIL;
  }
  return { ok: true };
}
