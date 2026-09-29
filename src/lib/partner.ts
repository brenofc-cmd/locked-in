import { t } from "@/i18n/pt-BR";
import { remainingSeconds } from "@/lib/focus";
import { formatClock } from "@/lib/format";
import { addDays, localDateISO, localTimeHM } from "@/lib/local-date";
import type { FeedEvent, Partner } from "@/types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type PartnerView = {
  /** "ONLINE" / "EM FOCO" / "OFFLINE" (display copy). */
  label: string;
  focusWord: string;
  /** dot / label colour class */
  live: boolean;
  pulse: string;
  done: number;
  total: number;
  pct: number;
  /** one-line summary under the partner card */
  line: string;
  lineTone: "muted" | "text" | "dim";
  /** "Online · Concluiu Morning Run às 09:27" */
  statusLine: string;
  /** V2: compact "visto há 12 min" while OFFLINE with a known last seen, else "". */
  seen: string;
  flashing: boolean;
};

/**
 * V2 Phase 2 — when the partner was last active (user_presence heartbeat or
 * the moment presence dropped), in the VIEWER's timezone like every other
 * time in the app. Pure; the only place that formats a last seen.
 */
export type LastSeen =
  | { kind: "now" }
  | { kind: "minutes"; n: number }
  | { kind: "today"; hm: string }
  | { kind: "yesterday"; hm: string }
  | { kind: "date"; dm: string; hm: string };

export function lastSeen(
  seenAtISO: string,
  nowMs: number,
  timeZone: string,
): LastSeen | null {
  const at = Date.parse(seenAtISO);
  if (!seenAtISO || Number.isNaN(at)) return null;
  const ago = Math.max(0, nowMs - at); // a clock ahead of ours reads as "now"
  if (ago < 60_000) return { kind: "now" };
  if (ago < 3_600_000) return { kind: "minutes", n: Math.floor(ago / 60_000) };
  const seenDay = localDateISO(timeZone, new Date(at));
  const today = localDateISO(timeZone, new Date(nowMs));
  const hm = localTimeHM(new Date(at), timeZone);
  if (seenDay === today) return { kind: "today", hm };
  if (seenDay === addDays(today, -1)) return { kind: "yesterday", hm };
  const [, m, d] = seenDay.split("-");
  return { kind: "date", dm: `${d}/${m}`, hm };
}

/** "Visto por último há 12 min" (long) or "visto há 12 min" (compact). */
export function lastSeenText(seen: LastSeen, compact = false): string {
  const c = compact ? t.lastSeen.short : t.lastSeen.long;
  switch (seen.kind) {
    case "now":
      return c.now;
    case "minutes":
      return c.minutes(seen.n);
    case "today":
      return c.today(seen.hm);
    case "yesterday":
      return c.yesterday(seen.hm);
    case "date":
      return c.date(seen.dm, seen.hm);
  }
}

/**
 * The partner's status everywhere in the app (one function, V2 Phase 2):
 *   1. a valid persistent focus session → EM FOCO
 *   2. Realtime Presence              → ONLINE
 *   3. neither                        → OFFLINE (+ last seen when known)
 * A recent last seen never makes the partner ONLINE. Counts come from
 * partner_today() (private tasks counted, never listed), `last` from the
 * real activity feed. `timeZone` is the viewer's (profile) timezone.
 */
export function partnerView(
  partner: Partner,
  counts: { done: number; total: number },
  feed: FeedEvent[],
  now: number,
  timeZone = "UTC",
): PartnerView {
  const { done, total } = counts;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const last = [...feed]
    .reverse()
    .find(
      (f) =>
        f.who === "partner" && (f.kind === "done" || f.kind === "focusdone"),
    );
  // Countdown derived locally from the partner's persistent session
  // (started_at, planned_seconds, pauses); nothing is streamed.
  const session = partner.focusSession;
  const timed = session !== null;
  const paused = session?.status === "paused";
  const left = session ? formatClock(remainingSeconds(session, now)) : "";
  const label = partner.focusLabel || t.partnerStatus.focusFallback;
  const flashing = now - partner.flashAt < 2200;

  if (partner.status === "focusing") {
    return {
      label: t.partnerStatus.focusing,
      focusWord: t.partnerStatus.focusingWord,
      live: true,
      pulse: "animate-[li-pulse_1.6s_ease-out_infinite]",
      done,
      total,
      pct,
      line: [
        label,
        timed ? (paused ? t.partnerStatus.pausedClock(left) : left) : "",
      ]
        .filter(Boolean)
        .join(" · "),
      lineTone: "text",
      statusLine: [
        paused ? t.partnerStatus.focusingPaused : t.partnerStatus.focusingWord,
        partner.focusLabel,
        timed ? t.partnerStatus.left(left) : "",
      ]
        .filter(Boolean)
        .join(" · "),
      seen: "",
      flashing,
    };
  }
  if (partner.status === "offline") {
    const seen = lastSeen(partner.seenAt, now, timeZone);
    return {
      label: t.partnerStatus.offline,
      focusWord: t.partnerStatus.offlineWord,
      live: false,
      pulse: "",
      done,
      total,
      pct,
      line: last ? `${last.t} · ${cap(last.text)}` : "",
      lineTone: "dim",
      statusLine: seen ? lastSeenText(seen) : t.partnerStatus.offlineWord,
      seen: seen ? lastSeenText(seen, true) : "",
      flashing,
    };
  }
  return {
    label: t.partnerStatus.online,
    focusWord: t.partnerStatus.onlineWord,
    live: true,
    pulse: "animate-[li-pulse_2.4s_ease-out_infinite]",
    done,
    total,
    pct,
    line: last ? `${last.t} · ${cap(last.text)}` : "",
    lineTone: "muted",
    statusLine: last
      ? t.partnerStatus.onlineWith(cap(last.text), last.t)
      : t.partnerStatus.onlineWord,
    seen: "",
    flashing,
  };
}
