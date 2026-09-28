/**
 * Supabase Auth error codes -> copy that is safe to show. Raw AuthApiError
 * messages, status codes and stack traces never reach the UI.
 */
import { t } from "@/i18n/pt-BR";

const MESSAGES: Record<string, string> = {
  invalid_credentials: t.authErrors.invalid_credentials,
  email_not_confirmed: t.authErrors.email_not_confirmed,
  user_already_exists: t.authErrors.user_already_exists,
  email_exists: t.authErrors.email_exists,
  weak_password: t.authErrors.weak_password,
  same_password: t.authErrors.same_password,
  email_address_invalid: t.authErrors.email_address_invalid,
  validation_failed: t.authErrors.validation_failed,
  signup_disabled: t.authErrors.signup_disabled,
  over_email_send_rate_limit: t.authErrors.over_email_send_rate_limit,
  over_request_rate_limit: t.authErrors.over_request_rate_limit,
  user_banned: t.authErrors.user_banned,
  session_not_found: t.authErrors.session_not_found,
  otp_expired: t.authErrors.otp_expired,
};

export const GENERIC_AUTH_ERROR = t.errors.generic;

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  if (error.status === 0 || error.code === "unexpected_failure") {
    return t.errors.network;
  }
  return GENERIC_AUTH_ERROR;
}

export const MIN_PASSWORD = 8;

/** Client and server share the same rules for the sign-up / reset forms. */
export function validatePassword(
  password: string,
  confirm: string,
): string | null {
  if (password.length < MIN_PASSWORD)
    return t.authErrors.passwordTooShort(MIN_PASSWORD);
  if (password !== confirm) return t.authErrors.passwordsDontMatch;
  return null;
}
