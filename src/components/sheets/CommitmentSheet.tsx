"use client";

import { t } from "@/i18n/pt-BR";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { chipTone, cx } from "@/components/ui";
import {
  COMMITMENT_KINDS,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  TITLE_MAX,
  validateCommitmentDraft,
  type CommitmentDraft,
  type CommitmentKind,
} from "@/lib/accountability";

const A = t.accountability;
const heading = "font-mono text-meta tracking-eyebrow text-muted";
const label = "font-mono text-meta tracking-eyebrow text-dim";
const field =
  "h-[54px] w-full min-w-0 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-base outline-none focus:border-line-bold";

/**
 * NOVO COMPROMISSO (V2 Phase 6). The title is public (the partner sees it);
 * the proof source (a task of today) stays private. The database sets the
 * day, the duo and the status.
 */
export function CommitmentSheet() {
  const { closeSheet, tasks, toast, partner, accountability } = useApp();
  const open = tasks.filter((x) => x.status === "pending");
  const [draft, setDraft] = useState<CommitmentDraft>({
    title: "",
    kind: open.length ? "task" : "simple",
    taskId: open[0]?.id ?? null,
    focusMinutes: 60,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validateCommitmentDraft(draft);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    const res = await accountability.create(draft);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    closeSheet();
    toast({ text: A.created, sub: partner.name.toUpperCase() });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <span className={heading}>{A.sheetTitle}</span>
      <label className="flex flex-col gap-2">
        <span className={label}>{A.titleLabel}</span>
        <input
          data-testid="commitment-title"
          value={draft.title}
          maxLength={TITLE_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className={field}
        />
        <span className="text-small text-dim">{A.titleHint}</span>
      </label>
      <div className="flex flex-col gap-2">
        <span className={label} id="commitment-kind">
          {A.kindLabel}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="commitment-kind"
          className="grid grid-cols-2 gap-1.5"
        >
          {COMMITMENT_KINDS.map((k: CommitmentKind) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.kind === k}
              data-testid={`commitment-kind-${k}`}
              onClick={() => setDraft((d) => ({ ...d, kind: k }))}
              className={cx(
                "h-[46px] rounded-xl border text-body",
                chipTone(draft.kind === k),
              )}
            >
              {A.kindLabels[k]}
            </button>
          ))}
        </div>
        <span className="text-small leading-[1.45] text-dim">
          {A.kindHelp[draft.kind]}
        </span>
      </div>
      {draft.kind === "task" && (
        <label className="flex flex-col gap-2">
          <span className={label}>{A.taskLabel}</span>
          {open.length ? (
            <select
              data-testid="commitment-task"
              value={draft.taskId ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, taskId: e.target.value || null }))
              }
              className={field}
            >
              {open.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-small text-dim">{A.taskNone}</span>
          )}
          <span className="text-small text-dim">{A.taskPrivateNote}</span>
        </label>
      )}
      {draft.kind === "focus" && (
        <label className="flex flex-col gap-2">
          <span className={label}>{A.focusLabel}</span>
          <input
            data-testid="commitment-focus"
            type="number"
            inputMode="numeric"
            min={FOCUS_MIN_MINUTES}
            max={FOCUS_MAX_MINUTES}
            step={5}
            value={draft.focusMinutes ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                focusMinutes:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            className={field}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        data-testid="commitment-submit"
        className="h-14 rounded-2xl bg-text font-mono text-small font-semibold tracking-eyebrow text-bg disabled:opacity-50"
      >
        {busy ? A.creating : A.create}
      </button>
    </form>
  );
}
