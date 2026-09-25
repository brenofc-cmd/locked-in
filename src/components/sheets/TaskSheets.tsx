"use client";

import { useState } from "react";
import { useApp, type TaskInput } from "@/components/app-state";
import { SwitchTrack, chipTone, cx } from "@/components/ui";
import { DAYS, DAY_LETTERS } from "@/lib/local-date";
import { SKIP_REASONS } from "@/lib/constants";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  validateTaskInput,
} from "@/lib/task-model";
import { SECTION_OF, scheduleLabel } from "@/lib/today";
import type { Category, Day, RoutineItem, Task } from "@/types";

const WEEKDAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
type Repeat = "Every day" | "Weekdays" | "Custom";

const monoLabel = "font-mono text-[10.5px] tracking-[.16em] text-dim";
const field =
  "rounded-xl border border-white/10 bg-bg text-text outline-none focus:border-white/30";

function repeatOf(days: Day[]): Repeat {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d)))
    return "Weekdays";
  return "Custom";
}

/**
 * Add task (Quick Add / new routine item), edit today's task, or edit a
 * routine item from the Routine screen. Editing a routine occurrence from
 * Today asks "APPLY CHANGE TO": Today only | Today and future days.
 */
export function TaskFormSheet({
  editing,
  routine,
  repeatByDefault = false,
}: {
  editing?: Task;
  routine?: RoutineItem;
  repeatByDefault?: boolean;
}) {
  const app = useApp();
  const source = editing ?? routine;
  const [name, setName] = useState(source?.name ?? "");
  const [repeat, setRepeat] = useState(
    routine ? true : editing ? !editing.once : repeatByDefault,
  );
  const [repeatMode, setRepeatMode] = useState<Repeat>(
    source && source.days.length ? repeatOf(source.days) : "Every day",
  );
  const [days, setDays] = useState<Day[]>(
    source && source.days.length ? source.days : DAYS,
  );
  const [more, setMore] = useState(false);
  const [time, setTime] = useState(source?.time ?? "");
  const [reminder, setReminder] = useState(source?.reminder ?? false);
  const [category, setCategory] = useState<Category>(
    source?.category ?? "custom",
  );
  const [visible, setVisible] = useState(
    source?.visible ?? app.settings.shareNewTasks,
  );
  const [notes, setNotes] = useState(source?.notes ?? "");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  function input(): TaskInput {
    const d: Day[] = !repeat
      ? []
      : repeatMode === "Every day"
        ? DAYS
        : repeatMode === "Weekdays"
          ? WEEKDAYS
          : days;
    return {
      name,
      category,
      time,
      days: d,
      once: !repeat,
      visible,
      reminder,
      notes,
    };
  }

  /** Close at once (the change is optimistic or fast); errors come back as toasts. */
  function run(action: () => Promise<boolean>) {
    app.closeSheet();
    void action();
  }

  function save() {
    if (!valid) return;
    const data = input();
    const invalid = validateTaskInput(data);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (routine) return run(() => app.updateRoutine(routine.id, data));
    if (editing?.routineId) {
      setConfirm(true);
      return;
    }
    if (editing) return run(() => app.updateToday(editing.id, data));
    run(() => app.addTask(data));
  }

  function remove() {
    if (routine) return run(() => app.archiveRoutine(routine.id));
    if (editing) run(() => app.deleteTask(editing.id));
  }

  if (confirm && editing?.routineId) {
    const routineId = editing.routineId;
    return (
      <div className="flex flex-col gap-2 animate-[li-fade-up_.2s_ease]">
        <span className="pb-2 font-mono text-[11px] tracking-[.18em] text-muted">
          APPLY CHANGE TO
        </span>
        <button
          type="button"
          onClick={() => run(() => app.updateToday(editing.id, input()))}
          className="h-14 rounded-[14px] border border-white/10 bg-raised text-base"
        >
          Today only
        </button>
        <button
          type="button"
          onClick={() => run(() => app.updateRoutine(routineId, input()))}
          className="h-14 rounded-[14px] bg-text text-base font-semibold text-bg"
        >
          Today and future days
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="h-12 text-sm text-dim"
        >
          Cancel
        </button>
      </div>
    );
  }

  const moreSummary = [CATEGORY_LABEL[category], time]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex min-h-8 items-center justify-between">
        <span className="font-mono text-[11px] tracking-[.18em] text-muted">
          {source ? "EDIT TASK" : "ADD TASK"}
        </span>
        {source && (
          <button
            type="button"
            onClick={remove}
            className="h-9 rounded-lg px-2.5 text-sm text-danger"
          >
            Delete
          </button>
        )}
      </div>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={80}
        placeholder="Finish Physics exercise"
        aria-label="Task name"
        enterKeyHint="done"
        className="h-14 rounded-[14px] border border-white/12 bg-bg px-4 text-[17px] outline-none focus:border-white/30"
      />
      {!source && (
        <div role="radiogroup" aria-label="When" className="flex gap-1.5">
          {(["Today", "Repeat"] as const).map((w) => {
            const on = (w === "Repeat") === repeat;
            return (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRepeat(w === "Repeat")}
                className={cx(
                  "h-11 flex-1 rounded-xl border text-sm",
                  chipTone(on),
                )}
              >
                {w}
              </button>
            );
          })}
        </div>
      )}
      {repeat && (
        <div className="flex flex-col gap-2.5 animate-[li-fade-up_.2s_ease]">
          <span className={monoLabel}>REPEAT</span>
          <div role="radiogroup" aria-label="Repeat" className="flex gap-1.5">
            {(["Every day", "Weekdays", "Custom"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={repeatMode === r}
                onClick={() => setRepeatMode(r)}
                className={cx(
                  "h-11 flex-1 rounded-xl border text-sm",
                  chipTone(repeatMode === r),
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {repeatMode === "Custom" && (
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={d}
                    aria-pressed={on}
                    onClick={() =>
                      setDays(
                        on
                          ? days.filter((x) => x !== d)
                          : DAYS.filter((x) => x === d || days.includes(x)),
                      )
                    }
                    className={cx(
                      "h-12 rounded-xl border p-0 text-[15px] font-semibold active:scale-[.92]",
                      chipTone(on),
                    )}
                  >
                    {DAY_LETTERS[i]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="flex h-12 items-center justify-between border-t border-white/6 text-sm text-muted"
      >
        <span>More options</span>
        <span className="text-xs text-dim">
          {moreSummary}{" "}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200"
            style={{ transform: more ? "rotate(90deg)" : "none" }}
          >
            ›
          </span>
        </span>
      </button>
      {more && (
        <div className="flex flex-col gap-4 animate-[li-fade-up_.2s_ease]">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-2">
              <span className={monoLabel}>TIME</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={cx(
                  field,
                  "h-[46px] min-w-0 px-3 text-base [color-scheme:dark]",
                )}
              />
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={reminder}
              onClick={() => setReminder((r) => !r)}
              className="flex flex-col gap-2 text-left"
            >
              <span className={monoLabel}>REMINDER</span>
              <span className="flex h-[46px] w-full items-center justify-between rounded-xl border border-white/10 px-3 text-sm">
                {reminder ? "On" : "Off"}
                <SwitchTrack on={reminder} compact />
              </span>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className={monoLabel}>SECTION</span>
            <div
              role="radiogroup"
              aria-label="Section"
              className="flex flex-wrap gap-1.5"
            >
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={cx(
                    "h-[38px] rounded-[10px] border px-[13px] text-[13.5px]",
                    chipTone(category === c),
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            onClick={() => setVisible((v) => !v)}
            className="flex min-h-[52px] items-center justify-between text-left"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="text-[14.5px]">
                Visible to {app.partner.name}
              </span>
              <span className="text-xs text-dim">
                Hidden tasks still count toward your score.
              </span>
            </span>
            <SwitchTrack on={visible} />
          </button>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            aria-label="Notes"
            maxLength={200}
            className={cx(field, "h-[46px] px-3.5 text-base")}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="-mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={!valid}
        className={cx(
          "h-14 rounded-2xl font-mono text-[12.5px] font-semibold tracking-[.28em] transition-all duration-200 active:scale-[.97]",
          valid ? "bg-accent text-bg" : "bg-selected text-ghost",
        )}
      >
        {source ? "SAVE" : "ADD"}
      </button>
    </form>
  );
}

/** Skip / edit / delete for one task. */
export function TaskOptionsSheet({ task }: { task: Task }) {
  const app = useApp();
  const meta = [
    SECTION_OF[task.category],
    task.time,
    task.once ? "TODAY ONLY" : scheduleLabel(task.days),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <span className="text-[19px] font-medium">{task.name}</span>
        <span className="font-mono text-[10.5px] tracking-[.1em] text-dim">
          {meta}
        </span>
      </div>
      {task.skip === null ? (
        <div className="flex flex-col gap-2.5">
          <span className={monoLabel}>SKIP TODAY</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => app.skipTask(task.id, r)}
                className="h-12 rounded-xl border border-white/10 bg-raised text-sm active:scale-[.96]"
              >
                {r}
              </button>
            ))}
          </div>
          <span className="text-xs text-dim">
            Skipped tasks stay in today&apos;s total and don&apos;t count as
            done.
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => app.unskipTask(task.id)}
          className="h-[52px] rounded-[14px] border border-white/10 bg-raised text-[15px]"
        >
          Unskip · {task.skip.replace("SKIPPED · ", "").toLowerCase()}
        </button>
      )}
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "edit", taskId: task.id })}
          className="flex h-[54px] items-center justify-between border-t border-white/6 text-[15.5px]"
        >
          <span>Edit</span>
          <span aria-hidden="true" className="text-faint">
            ›
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            app.closeSheet();
            void app.deleteTask(task.id);
          }}
          className="flex h-[54px] items-center border-t border-white/6 text-[15.5px] text-danger"
        >
          {task.once ? "Delete" : "Remove from routine"}
        </button>
      </div>
    </div>
  );
}
