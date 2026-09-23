"use client";

import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import type { FeedEvent } from "@/types";

const DOT: Record<FeedEvent["kind"], string> = {
  done: "bg-accent",
  focusdone: "bg-accent",
  focus: "bg-text",
  react: "bg-muted",
  start: "bg-faint",
};

/** One line of the live feed. Partner completions can be reacted to. */
export function ActivityItem({ event }: { event: FeedEvent }) {
  const { userName, partner, openSheet } = useApp();
  const canReact =
    event.who === "partner" &&
    (event.kind === "done" || event.kind === "focusdone");
  const name = event.who === "me" ? userName : partner.name;

  return (
    <div className="flex min-h-12 items-center gap-3 border-t border-white/5 py-1.5 animate-[li-enter_.55s_cubic-bezier(.2,.8,.2,1)]">
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
      {canReact && (
        <button
          type="button"
          disabled={event.reacted !== null}
          onClick={() =>
            openSheet({
              kind: "react",
              source: "feed",
              id: event.id,
              title: `${partner.name} ${event.text}`,
            })
          }
          aria-label={
            event.reacted
              ? `${event.reacted} sent`
              : `React to ${partner.name} ${event.text}`
          }
          className={cx(
            "h-9 min-w-11 shrink-0 rounded-full border border-white/9 px-2.5 text-xs",
            event.reacted ? "text-dim" : "text-muted",
          )}
        >
          {event.reacted ? `${event.reacted} sent` : "React"}
        </button>
      )}
    </div>
  );
}
