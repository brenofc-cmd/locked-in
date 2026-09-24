/**
 * Supabase Auth error codes -> copy that is safe to show. Raw AuthApiError
 * messages, status codes and stack traces never reach the UI.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed:
    "Confirm your email first. Check your inbox for the link.",
  user_already_exists:
    "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Password is too weak. Use at least 8 characters.",
  same_password: "Choose a password different from your current one.",
  email_address_invalid: "Enter a valid email address.",
  validation_failed: "Check the email and password and try again.",
  signup_disabled: "Sign-ups are closed right now.",
  over_email_send_rate_limit:
    "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  user_banned: "This account is disabled.",
  session_not_found: "Your session expired. Request a new link.",
  otp_expired: "This link has expired. Request a new one.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again.";

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  if (error.status === 0 || error.code === "unexpected_failure") {
    return "Network error. Check your connection and try again.";
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
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "Passwords don't match.";
  return null;
}
