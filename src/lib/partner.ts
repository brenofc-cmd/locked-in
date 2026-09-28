import { t } from "@/i18n/pt-BR";
import { remainingSeconds } from "@/lib/focus";
import { formatClock } from "@/lib/format";
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
  flashing: boolean;
};

/**
 * The partner's status line / card. Status and focus come from Presence,
 * counts from partner_today() (their own local day, private tasks counted
 * but never listed), `last` from the real activity feed.
 */
export function partnerView(
  partner: Partner,
  counts: { done: number; total: number },
  feed: FeedEvent[],
  now: number,
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
      flashing,
    };
  }
  if (partner.status === "offline") {
    // No "last seen" by design: only ONLINE / FOCUSING / OFFLINE.
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
      statusLine: t.partnerStatus.offlineWord,
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
    flashing,
  };
}
