"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { cx } from "@/components/ui";

/** Snackbar (Undo), toasts (partner events) and the connection pill. */
export function Feedback() {
  const { toasts, snack, conn } = useApp();

  return (
    <>
      {snack && (
        <div className="pointer-events-none absolute inset-x-2.5 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[68] flex justify-center desk:inset-x-auto desk:bottom-6 desk:left-[calc(50%+114px)] desk:w-[380px] desk:-translate-x-1/2">
          <div
            key={snack.id}
            role="status"
            className="pointer-events-auto flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-line-strong bg-raised py-1.5 pr-1.5 pl-4 shadow-[0_14px_40px_rgba(0,0,0,0.5)] animate-[li-rise_.3s_cubic-bezier(.2,.8,.2,1)]"
          >
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-lg bg-accent">
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="var(--color-bg)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-body">
              {snack.text}
            </span>
            {snack.action && (
              <button
                type="button"
                onClick={snack.action.run}
                className="h-10 rounded-xl px-3.5 font-mono text-meta font-semibold tracking-eyebrow text-accent"
              >
                {snack.action.label}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-2.5 top-2.5 z-[70] flex flex-col-reverse items-stretch gap-2 desk:inset-x-auto desk:top-auto desk:right-6 desk:bottom-6 desk:items-end"
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-line-strong bg-raised py-2.5 pr-2.5 pl-4 shadow-[0_14px_40px_rgba(0,0,0,0.5)] animate-[li-enter_.45s_cubic-bezier(.2,.8,.2,1)] desk:max-w-[360px]"
          >
            {x.rook ? (
              <Rook
                pose={x.rook === "tap" ? "supportive" : "proud"}
                core="proof"
                act={x.rook}
                size={32}
                className="-my-1"
              />
            ) : x.emoji ? (
              <span className="text-title leading-none" aria-hidden="true">
                {x.emoji}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="size-[7px] shrink-0 rounded-full bg-accent"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-small">{x.text}</span>
              <span className="font-mono text-meta tracking-meta text-dim">
                {x.sub}
              </span>
            </span>
            {x.actions && x.actions.length > 0 && (
              <span className="pointer-events-auto flex gap-1.5">
                {x.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.run}
                    aria-label={a.aria}
                    className="h-11 min-w-11 rounded-3xl border border-line-strong bg-avatar px-0 text-lead transition-transform duration-100 active:scale-[.86]"
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      {conn !== "connected" && (
        <div className="pointer-events-none absolute inset-x-0 top-[60px] z-[72] flex justify-center desk:top-4">
          <div
            role="status"
            className="flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-chip px-3.5 text-small text-muted animate-[li-fade-up_.3s_ease]"
          >
            <span
              aria-hidden="true"
              className={cx(
                "size-1.5 rounded-full",
                conn === "offline"
                  ? "bg-faint"
                  : "bg-muted animate-[li-breathe_1.4s_ease-in-out_infinite]",
              )}
            />
            {conn === "offline"
              ? t.connection.offline
              : t.connection.reconnecting}
          </div>
        </div>
      )}
    </>
  );
}
