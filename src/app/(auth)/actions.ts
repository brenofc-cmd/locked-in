"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorMessage, validatePassword } from "@/lib/auth-errors";
import { safeNext } from "@/lib/auth-routes";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  /** Set when an email was sent (confirmation or reset). */
  sentTo?: string;
  /** Echo of non-secret inputs so a failed submit does not wipe them. */
  name?: string;
  email?: string;
};

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Absolute origin for links inside auth emails. */
async function origin() {
  const h = await headers();
  const fromHeader = h.get("origin");
  if (fromHeader) return fromHeader;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signIn(
  _: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const email = text(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (!email || !password)
    return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), email };

  redirect(safeNext(text(fd, "next")));
}

export async function signUp(
  _: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const name = text(fd, "name").slice(0, 40);
  const email = text(fd, "email");
  const password = String(fd.get("password") ?? "");
  const echo = { name, email };
  if (!name) return { error: "Enter your name.", ...echo };
  if (!email) return { error: "Enter your email.", ...echo };
  const invalid = validatePassword(password, String(fd.get("confirm") ?? ""));
  if (invalid) return { error: invalid, ...echo };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by private.handle_new_user(); the database validates both.
      data: { display_name: name, timezone: text(fd, "timezone") },
      emailRedirectTo: `${await origin()}/auth/confirm?next=/today`,
    },
  });
  if (error) return { error: authErrorMessage(error), ...echo };

  // Email confirmation off: already signed in.
  if (data.session) redirect("/today");
  return { sentTo: email };
}

export async function requestPasswordReset(
  _: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const email = text(fd, "email");
  if (!email) return { error: "Enter your email.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirm?next=/reset-password`,
  });
  // Only rate limits are surfaced: the response must not reveal whether an
  // account exists for this email.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { error: authErrorMessage(error), email };
  }
  return { sentTo: email };
}

export async function updatePassword(
  _: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const password = String(fd.get("password") ?? "");
  const invalid = validatePassword(password, String(fd.get("confirm") ?? ""));
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };

  redirect("/today");
}
