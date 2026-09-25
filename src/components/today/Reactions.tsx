"use client";

import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";
import { reactionLabel } from "@/lib/reactions";

/**
 * React to a partner event (Stage 8, persisted). Shows my current reaction
 * and opens the sheet to set, change or remove it.
 */
export function ReactButton({
  eventId,
  title,
  name,
}: {
  eventId: string;
  /** Sheet title, e.g. "Lucas completed Morning Run". */
  title: string;
  /** Short label for the button's accessible name, e.g. "Morning Run". */
  name: string;
}) {
  const { reactions, openSheet } = useApp();
  const { me } = useSession();
  const mine = reactions[eventId]?.[me.id] ?? null;
  return (
    <button
      type="button"
      onClick={() => openSheet({ kind: "react", eventId, title })}
      aria-label={
        mine
          ? `You reacted ${reactionLabel(mine)} to ${name}. Change reaction`
          : `React to ${name}`
      }
      data-testid="react-button"
      className={cx(
        "h-9 min-w-11 shrink-0 rounded-full border px-2.5 text-xs",
        mine ? "border-accent-line text-text" : "border-white/9 text-muted",
      )}
    >
      {mine ? reactionLabel(mine) : "React"}
    </button>
  );
}

/** My partner's reaction to one of my events: "🔥 Lucas". */
export function ReceivedReaction({ eventId }: { eventId: string }) {
  const { reactions, partner } = useApp();
  const { me } = useSession();
  const byEvent = reactions[eventId] ?? {};
  const theirs = Object.entries(byEvent).find(([user]) => user !== me.id)?.[1];
  if (!theirs) return null;
  return (
    <span
      data-testid="received-reaction"
      className="shrink-0 rounded-full border border-white/9 px-2.5 py-1 text-xs text-muted"
    >
      {reactionLabel(theirs)} <span className="text-dim">{partner.name}</span>
    </span>
  );
}
