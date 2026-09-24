/**
 * Invite codes: "LKD-" + 6 symbols from an alphabet without 0/O/1/I/L.
 * Mirrors public.normalize_invite_code() in the database, which stays the
 * authority; this copy only lets the UI reject obvious typos before a round trip.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_RE = new RegExp(`^LKD-[${ALPHABET}]{6}$`);

/** "lkd 8x29ab", "8X29AB", "LKD-8X29AB" -> "LKD-8X29AB". */
export function normalizeInviteCode(input: string): string {
  const raw = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^LKD/, "");
  return `LKD-${raw}`;
}

export function isValidInviteCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Stable error codes raised by the duo RPCs (see supabase/migrations/*_duo_functions.sql). */
const DUO_ERRORS: Record<string, string> = {
  LI_INVALID_CODE: "That code doesn't match any duo. Check it and try again.",
  LI_DUO_FULL: "That duo is already full. Duos are two people.",
  LI_ALREADY_IN_DUO: "You're already in a duo. Leave it first to join another.",
  LI_NOT_IN_DUO: "You're not in a duo.",
  LI_NOT_AUTHENTICATED: "Your session expired. Sign in again.",
};

export const NETWORK_ERROR =
  "Network error. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Try again.";

/** Maps a Postgres/PostgREST error message to copy that is safe to show. */
export function duoErrorMessage(message: string | null | undefined): string {
  if (!message) return GENERIC_ERROR;
  const code = Object.keys(DUO_ERRORS).find((k) => message.includes(k));
  if (code) return DUO_ERRORS[code];
  if (/fetch|network/i.test(message)) return NETWORK_ERROR;
  return GENERIC_ERROR;
}
