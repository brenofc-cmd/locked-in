"use client";

import { t } from "@/i18n/pt-BR";
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
  /** Sheet title, e.g. "Lucas concluiu Morning Run". */
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
          ? t.reactButton.reacted(reactionLabel(mine), name)
          : t.reactButton.reactTo(name)
      }
      data-testid="react-button"
      className={cx(
        "h-9 min-w-11 shrink-0 rounded-full border px-2.5 text-small",
        mine ? "border-accent-line text-text" : "border-line-strong text-muted",
      )}
    >
      {mine ? reactionLabel(mine) : t.reactButton.react}
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
      className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-small text-muted"
    >
      {reactionLabel(theirs)} <span className="text-dim">{partner.name}</span>
    </span>
  );
}
