import { formatClock } from "@/lib/format";
import type { FeedEvent, Partner } from "@/types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type PartnerView = {
  label: "ONLINE" | "FOCUSING" | "OFFLINE";
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
  /** "Online · Completed Morning Run at 09:27" */
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
  // Countdown computed locally from the start instant shared once via Presence.
  const timed = partner.focusEnd > 0;
  const left = formatClock(Math.max(0, (partner.focusEnd - now) / 1000));
  const flashing = now - partner.flashAt < 2200;

  if (partner.status === "focusing") {
    return {
      label: "FOCUSING",
      focusWord: "Focusing",
      live: true,
      pulse: "animate-[li-pulse_1.6s_ease-out_infinite]",
      done,
      total,
      pct,
      line: [partner.focusLabel, timed ? left : ""].filter(Boolean).join(" · "),
      lineTone: "text",
      statusLine: ["Focusing", partner.focusLabel, timed ? `${left} left` : ""]
        .filter(Boolean)
        .join(" · "),
      flashing,
    };
  }
  if (partner.status === "offline") {
    // No "last seen" by design: only ONLINE / FOCUSING / OFFLINE.
    return {
      label: "OFFLINE",
      focusWord: "Offline",
      live: false,
      pulse: "",
      done,
      total,
      pct,
      line: last ? `${last.t} · ${cap(last.text)}` : "",
      lineTone: "dim",
      statusLine: "Offline",
      flashing,
    };
  }
  return {
    label: "ONLINE",
    focusWord: "Online",
    live: true,
    pulse: "animate-[li-pulse_2.4s_ease-out_infinite]",
    done,
    total,
    pct,
    line: last ? `${last.t} · ${cap(last.text)}` : "",
    lineTone: "muted",
    statusLine: last ? `Online · ${cap(last.text)} at ${last.t}` : "Online",
    flashing,
  };
}
