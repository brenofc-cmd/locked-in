/**
 * Invite codes: "LKD-" + 6 symbols from an alphabet without 0/O/1/I/L.
 * Mirrors public.normalize_invite_code() in the database, which stays the
 * authority; this copy only lets the UI reject obvious typos before a round trip.
 */
import { t } from "@/i18n/pt-BR";

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
const DUO_ERRORS: Record<string, string> = t.duoErrors;

export const NETWORK_ERROR = t.errors.network;
const GENERIC_ERROR = t.errors.generic;

/** Maps a Postgres/PostgREST error message to copy that is safe to show. */
export function duoErrorMessage(message: string | null | undefined): string {
  if (!message) return GENERIC_ERROR;
  const code = Object.keys(DUO_ERRORS).find((k) => message.includes(k));
  if (code) return DUO_ERRORS[code];
  if (/fetch|network/i.test(message)) return NETWORK_ERROR;
  return GENERIC_ERROR;
}
