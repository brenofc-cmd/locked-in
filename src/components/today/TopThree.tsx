"use client";

import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { CheckPath, cx } from "@/components/ui";
import { topThree } from "@/lib/north-star";

/**
 * TOP 3 DE HOJE (V2 Phase 4): up to three of today's real tasks, in the
 * user's order. Not a second list — each row is the task itself (same
 * toggle); a completed or skipped priority stays, so the day shows whether
 * the three things that mattered were done.
 */
export function TopThree() {
  const app = useApp();
  const top = topThree(app.tasks);
  if (app.tasks.length === 0) return null;
  return (
    <section aria-labelledby="top3-title" className="flex flex-col">
      <div className="flex items-center justify-between">
        <h2
          id="top3-title"
          className="font-mono text-[11px] font-normal tracking-[.18em]"
        >
          {t.top3.title}
        </h2>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "priorities" })}
          aria-label={top.length ? t.top3.editAria : undefined}
          className={cx(
            "flex h-10 items-center font-mono text-[11px] tracking-[.14em]",
            top.length ? "text-dim hover:text-text" : "text-accent",
          )}
        >
          {top.length ? t.top3.edit : t.top3.define}
        </button>
      </div>
      {top.length > 0 && (
        <ol className="flex flex-col">
          {top.map((task) => {
            const skipped = task.skip !== null;
            return (
              <li key={task.id} className="border-t border-white/6">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={t.top3.rankAria(task.priority!, task.name)}
                  aria-describedby={
                    skipped ? `top3-${task.id}-skip` : undefined
                  }
                  onClick={() => app.toggleTask(task.id)}
                  className="flex min-h-[52px] w-full items-center gap-3.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 font-mono text-[12px] text-accent tabular-nums"
                  >
                    {task.priority}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px]",
                      skipped ? "border-dashed border-white/10" : "",
                      task.done
                        ? "border-accent bg-accent"
                        : !skipped && "border-white/24",
                    )}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16">
                      <CheckPath drawn={task.done} />
                    </svg>
                  </span>
                  <span
                    className={cx(
                      "min-w-0 flex-1 truncate text-[15px]",
                      task.done || skipped ? "text-quiet" : "text-text",
                      task.done && "line-through decoration-white/25",
                    )}
                  >
                    {task.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[.08em] text-dim">
                    {skipped ? (
                      <span id={`top3-${task.id}-skip`}>{task.skip}</span>
                    ) : task.done ? (
                      t.top3.done
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
