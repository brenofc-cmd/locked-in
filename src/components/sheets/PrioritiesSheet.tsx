"use client";

import { t } from "@/i18n/pt-BR";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { cx } from "@/components/ui";
import {
  MAX_PRIORITIES,
  addPriority,
  movePriority,
  priorityIds,
  removePriority,
} from "@/lib/north-star";

const monoLabel = "font-mono text-meta tracking-eyebrow text-dim";
const iconBtn =
  "flex size-10 shrink-0 items-center justify-center rounded-lg text-dim hover:text-text disabled:opacity-25";

/**
 * Choose / order today's Top 3 (V2 Phase 4): pick up to three of today's
 * tasks in order of importance, move them with ↑ / ↓, save once. The user
 * decides — nothing is chosen automatically.
 */
export function PrioritiesSheet() {
  const app = useApp();
  const tasks = app.tasks.filter((x) => !x.id.startsWith("tmp-"));
  const [ids, setIds] = useState(() => priorityIds(tasks));
  const [saving, setSaving] = useState(false);
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const chosen = ids.flatMap((id) => byId.get(id) ?? []);
  const others = tasks.filter((x) => !ids.includes(x.id));
  const full = ids.length >= MAX_PRIORITIES;

  async function save() {
    if (saving) return;
    setSaving(true);
    const ok = await app.setPriorities(ids);
    setSaving(false);
    if (!ok) return;
    app.toast({ text: t.top3.saved, sub: t.top3.toastSub });
    app.closeSheet();
  }

  if (tasks.length === 0)
    return <p className="text-body text-muted">{t.top3.noTasks}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <span className={monoLabel}>{t.top3.title}</span>
        <span
          className={cx(monoLabel, "tabular-nums")}
          aria-live="polite"
          data-testid="top3-count"
        >
          {t.top3.count(ids.length)}
        </span>
      </div>
      {chosen.length > 0 && (
        <ol className="flex flex-col">
          {chosen.map((task, i) => (
            <li
              key={task.id}
              className="flex min-h-[52px] items-center gap-2 border-t border-line"
            >
              <span
                aria-hidden="true"
                className="w-5 font-mono text-small text-accent tabular-nums"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-body">
                {task.name}
              </span>
              <button
                type="button"
                aria-label={t.top3.moveUp(task.name)}
                disabled={i === 0}
                onClick={() => setIds((x) => movePriority(x, task.id, -1) ?? x)}
                className={iconBtn}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t.top3.moveDown(task.name)}
                disabled={i === chosen.length - 1}
                onClick={() => setIds((x) => movePriority(x, task.id, 1) ?? x)}
                className={iconBtn}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={t.top3.remove(task.name)}
                onClick={() => setIds((x) => removePriority(x, task.id))}
                className={iconBtn}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-small text-dim">
          {full ? t.top3.max : t.top3.pickerHint}
        </span>
        <ul className="flex flex-col">
          {others.map((task) => (
            <li key={task.id} className="border-t border-line">
              <button
                type="button"
                disabled={full}
                aria-label={t.top3.pick(task.name)}
                onClick={() => setIds((x) => addPriority(x, task.id) ?? x)}
                className="flex min-h-[48px] w-full items-center gap-3 text-left text-body disabled:text-dim"
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 items-center justify-center rounded-full border border-line-bold text-small text-dim"
                >
                  +
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate",
                    (task.done || task.skip) && "text-dim",
                  )}
                >
                  {task.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        aria-disabled={saving}
        className="h-14 rounded-2xl btn-primary font-mono text-small font-semibold tracking-brand"
      >
        {t.top3.save}
      </button>
    </div>
  );
}
