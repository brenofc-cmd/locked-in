"use client";

import { t } from "@/i18n/pt-BR";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import { SECTION_OF, scheduleLabel } from "@/lib/today";

export function RoutineScreen() {
  const app = useApp();
  // Real routine items (Stage 4). Order is persisted on drop.
  const items = app.routines;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function onHandleDown(id: string, e: PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Without capture the drag still works while the pointer stays on the list.
    }
    setDrag(id);
    setOver(id);
  }

  function onHandleMove(e: PointerEvent<HTMLSpanElement>) {
    if (!drag) return;
    const row = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-rid]");
    const rid = row?.dataset.rid;
    if (rid && rid !== over) setOver(rid);
  }

  function onHandleUp() {
    if (drag && over) app.moveRoutine(drag, over);
    setDrag(null);
    setOver(null);
  }

  function onHandleKey(index: number, e: KeyboardEvent<HTMLSpanElement>) {
    const target =
      e.key === "ArrowUp"
        ? items[index - 1]
        : e.key === "ArrowDown"
          ? items[index + 1]
          : undefined;
    if (!target) return;
    e.preventDefault();
    app.moveRoutine(items[index].id, target.id);
  }

  return (
    <div className="flex flex-col gap-[26px] animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
          {t.routineScreen.title}
        </h1>
        <span className="text-[14.5px] text-muted">
          {t.routineScreen.subtitle}
        </span>
      </header>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "add", repeat: true })}
          className="h-11 rounded-xl bg-text px-4 text-sm font-semibold text-bg active:scale-[.97]"
        >
          {t.routineScreen.addItem}
        </button>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "template" })}
          className="h-11 rounded-xl border border-white/12 px-4 text-sm"
        >
          {t.routineScreen.useTemplate}
        </button>
      </div>
      {items.length === 0 && (
        <span className="text-[13.5px] text-dim">{t.routineScreen.empty}</span>
      )}
      <ul className="flex flex-col border-t border-white/9">
        {items.map((r, i) => {
          const dragging = drag === r.id;
          const sched = [r.time, scheduleLabel(r.days), SECTION_OF[r.category]]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={r.id}
              data-rid={r.id}
              className={cx(
                "relative flex min-h-[62px] items-center gap-2 border-b border-t-2 border-b-white/5 transition-[background,box-shadow,transform] duration-200",
                drag && over === r.id && !dragging
                  ? "border-t-accent"
                  : "border-t-transparent",
                dragging
                  ? "z-[3] scale-[1.015] rounded-xl bg-chip shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
                  : "z-[1] bg-bg",
              )}
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={t.routineScreen.reorderAria(r.name)}
                onPointerDown={(e) => onHandleDown(r.id, e)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onKeyDown={(e) => onHandleKey(i, e)}
                className="flex size-11 shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-1 rounded-[10px] hover:bg-white/4"
              >
                {[0, 1, 2].map((k) => (
                  <span
                    key={k}
                    aria-hidden="true"
                    className={cx(
                      "h-[1.5px] w-4 rounded-[1px]",
                      dragging ? "bg-accent" : "bg-ghost",
                    )}
                  />
                ))}
              </span>
              <button
                type="button"
                onClick={() =>
                  app.openSheet({ kind: "editRoutine", routineId: r.id })
                }
                className="flex min-h-[58px] min-w-0 flex-1 items-center justify-between gap-2.5 pr-1 text-left"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15.5px]">{r.name}</span>
                  <span className="truncate font-mono text-[10.5px] tracking-[.08em] text-dim">
                    {sched}
                  </span>
                </span>
                <span aria-hidden="true" className="text-faint">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
