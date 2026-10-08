"use client";

import { t } from "@/i18n/pt-BR";
import { useRef, useState, type PointerEvent } from "react";
import { useApp } from "@/components/app-state";
import { CheckPath, cx } from "@/components/ui";
import type { Task } from "@/types";

type Gesture = {
  x0: number;
  y0: number;
  lock: "x" | "y" | null;
  moved: boolean;
};

/**
 * A task on Today (V3): the check on the right edge toggles (Space/Enter
 * too); the rest of the row opens the options. Swipe right past 80px
 * completes / undoes, swipe left opens options, long-press / right-click
 * opens options.
 */
export function TaskRow({
  task,
  popping,
  flashing,
  next = false,
  onToggle,
  onOptions,
}: {
  task: Task;
  popping: boolean;
  /** V3: the task Today points at (lib/today → nextTaskId). */
  next?: boolean;
  flashing: boolean;
  onToggle: () => void;
  onOptions: () => void;
}) {
  const app = useApp();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  const skipped = task.skip !== null;
  const muted = task.done || skipped;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    gesture.current = {
      x0: e.clientX,
      y0: e.clientY,
      lock: null,
      moved: false,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const ddx = e.clientX - g.x0;
    const ddy = e.clientY - g.y0;
    if (!g.lock) {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy) * 1.2) {
        g.lock = "x";
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is an enhancement; the gesture still works without it.
        }
      } else if (Math.abs(ddy) > 8) {
        g.lock = "y";
      }
    }
    if (g.lock !== "x") return;
    g.moved = true;
    let v = ddx;
    if (v > 0) v = Math.min(150, v * 0.85);
    setDx(Math.max(-120, v));
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g || !g.moved) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 60);
    const v = dx;
    setDx(0);
    if (v > 80) {
      if (!task.done) tick();
      onToggle();
    } else if (v < -90) onOptions();
  }

  const leftOpacity = dx > 0 ? Math.min(1, dx / 80) : 0;

  return (
    <div className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="absolute inset-0 flex justify-between">
        <div
          className={cx(
            "flex flex-1 items-center pl-5 font-mono text-meta tracking-eyebrow text-accent",
            dx > 80 ? "bg-accent-strong" : "bg-accent-swipe",
          )}
          style={{ opacity: leftOpacity }}
        >
          {task.done ? t.taskRow.undo : t.taskRow.complete}
        </div>
        <div
          className="flex flex-1 items-center justify-end bg-chip pr-5 font-mono text-meta tracking-eyebrow text-muted"
          style={{ opacity: dx < 0 ? 1 : 0 }}
        >
          {t.taskRow.options}
        </div>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          onOptions();
        }}
        className={cx(
          "relative flex touch-pan-y items-center gap-1.5 select-none",
          flashing ? "bg-accent-wash" : "bg-bg",
        )}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging
            ? "background .6s ease"
            : "transform .34s cubic-bezier(.2,.9,.25,1), background .6s ease",
        }}
      >
        {/* V3: the row's text opens the options; the check sits on the
            right edge (thumb side) with a 52 px target. */}
        <button
          type="button"
          onClick={() => {
            if (suppressClick.current) return;
            onOptions();
          }}
          aria-label={t.taskRow.optionsFor(task.name)}
          className="flex min-h-[66px] min-w-0 flex-1 items-center gap-4 py-2.5 text-left"
        >
          <span className="hidden w-[42px] shrink-0 font-mono text-small text-dim tabular-nums desk:block">
            {task.time || "—"}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {next && (
              // A visual pointer only: the list order is unchanged, and row
              // descriptions stay what they announce today (v2-phase9).
              <span
                aria-hidden="true"
                data-testid="task-next"
                className="font-mono text-tab tracking-eyebrow text-accent"
              >
                {t.taskRow.next}
              </span>
            )}
            <span className="flex min-w-0 items-baseline gap-2">
              {task.priority !== null && (
                // Top 3 rank, discreet: the task is listed once (V2 Phase 4).
                <span
                  aria-hidden="true"
                  data-testid="task-rank"
                  className="shrink-0 font-mono text-meta text-accent tabular-nums"
                >
                  {task.priority}
                </span>
              )}
              <span
                className={cx(
                  "text-lead font-medium [overflow-wrap:anywhere] decoration-strike transition-colors duration-300",
                  muted ? "text-dim" : "text-text",
                  task.done && "line-through",
                )}
              >
                {task.name}
              </span>
            </span>
            <TaskMeta task={task} />
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-1.5 font-mono text-tab tracking-meta text-dim">
          {task.unsynced && (
            <span
              title={t.taskRow.willSync}
              aria-label={t.taskRow.willSync}
              className="size-2 rounded-full border-[1.5px] border-dim"
            />
          )}
          {skipped ? (
            <span id={`${task.id}-skip`} className="max-w-28 truncate">
              {task.skip}
            </span>
          ) : task.done ? (
            // The completion time is detail: desktop only (it has the room).
            <span className="hidden desk:inline">
              {t.taskRow.done}
              {task.doneAt}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.name}
          aria-describedby={
            [
              skipped && `${task.id}-skip`,
              app.taskGoals[task.id] && `${task.id}-goal`,
              app.taskFlags[task.id] && `${task.id}-nn`,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onClick={() => {
            if (suppressClick.current) return;
            if (!task.done) tick();
            onToggle();
          }}
          className="-mr-2.5 flex size-[52px] shrink-0 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className={cx(
              "flex size-8 items-center justify-center rounded-[11px] border-[1.5px] transition-[background-color,border-color,scale] duration-200 ease-[var(--ease-spring)]",
              skipped ? "border-dashed" : "border-solid",
              // Completing: a bright beat of lime, then it settles to a
              // quiet done state so open work stays the loudest thing.
              task.done && popping
                ? "scale-[.9] border-accent bg-accent"
                : task.done
                  ? "border-accent-done bg-accent-strong"
                  : skipped
                    ? "border-ghost"
                    : next
                      ? "border-accent"
                      : "border-line-check",
            )}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <CheckPath
                drawn={task.done}
                color={popping ? "var(--color-bg)" : "var(--color-accent)"}
              />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * A very light haptic on completion, where the browser allows it (Android
 * Chrome); only ever from the user's own tap. An enhancement, never needed.
 */
function tick() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Not supported or not allowed: nothing to do.
  }
}

function TaskMeta({ task }: { task: Task }) {
  const app = useApp();
  const mobile = [task.time, task.meta].filter(Boolean).join(" · ");
  const cls = "font-mono text-meta tracking-meta text-dim";
  // V2 Phase 5: my own goal link only (the map never holds a partner task).
  const goalId = app.taskGoals[task.id];
  const goal = goalId ? app.goals.find((g) => g.id === goalId) : undefined;
  // V2 Phase 9: discreet, mine only (the map never holds a partner task).
  const nonNegotiable = app.taskFlags[task.id] ?? false;
  return (
    <>
      {nonNegotiable && (
        <span
          id={`${task.id}-nn`}
          data-testid="task-non-negotiable"
          className={cx(cls, "text-dim")}
        >
          {t.nonNegotiable.label}
        </span>
      )}
      {mobile && <span className={cx(cls, "desk:hidden")}>{mobile}</span>}
      {task.meta && (
        <span className={cx(cls, "hidden desk:inline")}>{task.meta}</span>
      )}
      {goal && (
        <span
          id={`${task.id}-goal`}
          data-testid="task-goal"
          className={cx(cls, "truncate text-dim")}
        >
          {t.goalPicker.tag(goal.title)}
        </span>
      )}
    </>
  );
}
