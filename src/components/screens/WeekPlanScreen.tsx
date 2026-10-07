"use client";

/**
 * Weekly Planning (V2 Phase 9, docs/WEEKLY_PLANNING.md): up to 3 priorities
 * for this week or the next, open / done, owner-only and self-declared (a
 * plan, never proof). Each change saves at once — no draft. Reached from
 * PLANEJAR and from the Weekly Review's PLANEJAR PRÓXIMA SEMANA.
 */
import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { cx } from "@/components/ui";
import { weekRangeLabel } from "@/lib/records";
import {
  PRIORITY_TITLE_MAX,
  freePosition,
  planWeeks,
  prioritiesOf,
  validatePriorityTitle,
  type Priority,
} from "@/lib/weekly-plan";

const W = t.weeklyPlan;
const field =
  "h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3.5 text-base outline-none focus:border-line-bold";

export function WeekPlanScreen({
  initialWeek,
}: {
  initialWeek: "current" | "next";
}) {
  const app = useApp();
  const weeks = planWeeks(app.today);
  const [tab, setTab] = useState<"current" | "next">(initialWeek);
  const weekStart = weeks[tab];
  const list = prioritiesOf(app.priorities, weekStart);
  const full = freePosition(list) === null;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 animate-[li-fade-up_.4s_ease]">
      <Link
        href="/plan"
        className="-mb-2 w-fit font-mono text-meta tracking-eyebrow text-dim"
      >
        ‹ {W.back}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="page-title">{W.title}</h1>
        <span className="text-body text-muted">{W.subtitle}</span>
      </header>
      <div role="radiogroup" aria-label={W.tabsAria} className="flex gap-1.5">
        {(["current", "next"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border",
              tab === k
                ? "border-line-bold bg-selected text-text"
                : "border-line text-muted",
            )}
          >
            <span className="font-mono text-meta tracking-eyebrow">
              {k === "current" ? W.current : W.next}
            </span>
            <span className="font-mono text-meta tracking-meta text-dim">
              {weekRangeLabel(weeks[k])}
            </span>
          </button>
        ))}
      </div>

      <section aria-label={W.aria} data-testid="week-priorities">
        <ol className="m-0 flex list-none flex-col p-0">
          {list.map((p) => (
            <PriorityLine key={p.id} p={p} />
          ))}
        </ol>
        {list.length === 0 && (
          // An empty week is ground to prepare, not a missing record.
          <div className="flex items-center gap-4 py-3">
            <Rook pose="ready" size={56} />
            <p className="m-0 text-body text-muted">
              {tab === "next" ? W.emptyNext : W.empty}
            </p>
          </div>
        )}
        {full ? (
          <p
            data-testid="week-full"
            className="m-0 border-t border-line pt-3 text-small text-dim"
          >
            {W.full}
          </p>
        ) : (
          <AddPriority
            key={weekStart}
            weekStart={weekStart}
            next={tab === "next"}
          />
        )}
      </section>
      <p className="m-0 text-small text-dim">{W.selfDeclared}</p>
    </div>
  );
}

function AddPriority({
  weekStart,
  next,
}: {
  weekStart: string;
  next: boolean;
}) {
  const app = useApp();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const invalid = validatePriorityTitle(title);
    if (invalid) return setError(invalid);
    setBusy(true);
    const ok = await app.addPriority(weekStart, title);
    setBusy(false);
    if (ok) setTitle("");
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void add();
      }}
    >
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          maxLength={PRIORITY_TITLE_MAX}
          placeholder={next ? W.placeholderNext : W.placeholder}
          aria-label={W.add}
          enterKeyHint="done"
          className={field}
        />
        <button
          type="submit"
          aria-disabled={busy || !title.trim()}
          className={cx(
            "h-12 shrink-0 rounded-xl px-4 font-mono text-meta font-semibold tracking-eyebrow",
            title.trim() ? "bg-accent text-bg" : "bg-selected text-ghost",
          )}
        >
          {W.save}
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function PriorityLine({ p }: { p: Priority }) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [error, setError] = useState<string | null>(null);
  const done = p.status === "done";

  if (editing) {
    return (
      <li className="flex flex-col gap-2 border-t border-line py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const invalid = validatePriorityTitle(title);
            if (invalid) return setError(invalid);
            setEditing(false);
            if (title.trim() !== p.title)
              void app.updatePriority(p.id, { title });
          }}
        >
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            maxLength={PRIORITY_TITLE_MAX}
            aria-label={W.edit}
            autoFocus
            className={field}
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-xl bg-text px-4 font-mono text-meta font-semibold tracking-eyebrow text-bg"
          >
            {W.save}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setTitle(p.title);
            setError(null);
            setEditing(false);
          }}
          className="h-9 w-fit text-small text-dim"
        >
          {W.cancel}
        </button>
        {error && (
          <p role="alert" className="m-0 text-small text-danger">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li
      data-testid="week-priority"
      data-status={p.status}
      className="flex min-h-[60px] items-center gap-2 border-t border-line"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={W.toggleAria(p.title)}
        onClick={() =>
          void app.updatePriority(p.id, { status: done ? "open" : "done" })
        }
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <span
          aria-hidden="true"
          className={cx(
            "flex size-[30px] shrink-0 items-center justify-center rounded-xl border-[1.5px] font-mono text-meta",
            done
              ? "border-accent bg-accent text-bg"
              : "border-line-bold text-dim",
          )}
        >
          {done ? "✓" : p.position}
        </span>
        <span
          className={cx(
            "min-w-0 flex-1 text-body break-words",
            done && "text-muted line-through decoration-white/30",
          )}
        >
          {p.title}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-10 shrink-0 rounded-lg px-2 text-small text-dim"
      >
        {W.edit}
      </button>
      <button
        type="button"
        aria-label={`${W.remove}: ${p.title}`}
        onClick={() => void app.removePriority(p.id)}
        className="h-10 shrink-0 rounded-lg px-2 text-small text-dim"
      >
        ✕
      </button>
    </li>
  );
}
