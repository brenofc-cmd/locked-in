"use client";

import { useApp } from "@/components/app-state";
import { ReactButton, ReceivedReaction } from "@/components/today/Reactions";
import { cx } from "@/components/ui";
import { isProofKind } from "@/lib/realtime-model";
import type { FeedEvent } from "@/types";

const DOT: Record<FeedEvent["kind"], string> = {
  done: "bg-accent",
  focusdone: "bg-accent",
  commit: "bg-accent",
  focus: "bg-text",
  react: "bg-muted",
  start: "bg-faint",
};

/**
 * One line of the live feed. Partner completions can be reacted to; my own
 * lines show my partner's reaction (Stage 8, persisted).
 */
export function ActivityItem({ event }: { event: FeedEvent }) {
  const { userName, partner } = useApp();
  const done = isProofKind(event.kind);
  const real = !event.id.startsWith("local-");
  const name = event.who === "me" ? userName : partner.name;

  return (
    <div
      data-testid="activity-item"
      className="flex min-h-12 items-center gap-3 border-t border-white/5 py-1.5 animate-[li-enter_.55s_cubic-bezier(.2,.8,.2,1)]"
    >
      <span className="w-[38px] shrink-0 font-mono text-[11.5px] text-dim tabular-nums">
        {event.t}
      </span>
      <span
        aria-hidden="true"
        className={cx("size-1.5 shrink-0 rounded-full", DOT[event.kind])}
      />
      <span className="flex-1 text-[13.5px] leading-[1.4] text-muted">
        <span className="font-medium text-text">{name}</span> {event.text}
      </span>
      {done && real && event.who === "partner" && (
        <ReactButton
          eventId={event.id}
          title={`${partner.name} ${event.text}`}
          name={`${partner.name} ${event.text}`}
        />
      )}
      {done && real && event.who === "me" && (
        <ReceivedReaction eventId={event.id} />
      )}
    </div>
  );
}
