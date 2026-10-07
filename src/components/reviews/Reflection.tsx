"use client";

/**
 * Reviews 2.0 (V2 Phase 9): three optional reflections, owner-only. Written
 * by the user only — no suggestion, no generated text. Saved on an explicit
 * tap (one row per day / week, updated in place).
 */
import { t } from "@/i18n/pt-BR";
import { useState } from "react";
import { saveReflection } from "@/app/(app)/reflection-actions";
import { cx } from "@/components/ui";
import {
  REFLECTION_FIELDS,
  REFLECTION_MAX,
  isEmptyReflection,
  sameReflection,
  type FactLine,
  type Reflection,
  type ReviewKind,
} from "@/lib/reviews";

const R = t.reviews;

const labels = (kind: ReviewKind) => ({
  worked: R.worked,
  hindered: R.hindered,
  changeNext: kind === "day" ? R.changeDay : R.changeWeek,
});

export function FactRows({ lines }: { lines: FactLine[] }) {
  return (
    <>
      {lines.map((r) => (
        <div
          key={r.testId}
          data-testid={r.testId}
          className="flex items-baseline justify-between gap-3 border-t border-line py-3.5"
        >
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {r.k}
          </span>
          <span className="text-right text-body tabular-nums">{r.v}</span>
        </div>
      ))}
    </>
  );
}

export function ReflectionForm({
  kind,
  periodStart,
  initial,
}: {
  kind: ReviewKind;
  periodStart: string;
  initial: Reflection;
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const text = labels(kind);
  const dirty = !sameReflection(value, saved);

  async function save() {
    if (!dirty || state === "saving") return;
    setState("saving");
    const res = await saveReflection(kind, periodStart, value).catch(
      () => null,
    );
    if (res?.ok) {
      setSaved(res.reflection);
      setValue(res.reflection);
      setState("idle");
    } else setState("error");
  }

  return (
    <form
      aria-label={R.reflection}
      data-testid={`reflection-${kind}`}
      className="flex flex-col gap-3 border-t border-line pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-meta tracking-eyebrow text-muted">
          {R.reflection}
        </span>
        <span className="text-num-heros text-dim">{R.optional}</span>
      </span>
      {REFLECTION_FIELDS.map((f) => (
        <label key={f} className="flex flex-col gap-1.5">
          <span className="text-small text-muted">{text[f]}</span>
          <textarea
            value={value[f]}
            onChange={(e) => {
              setValue((v) => ({ ...v, [f]: e.target.value }));
              if (state === "error") setState("idle");
            }}
            maxLength={REFLECTION_MAX}
            rows={2}
            data-testid={`reflection-${f}`}
            className="min-h-[64px] resize-y rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-body outline-none focus:border-line-bold"
          />
        </label>
      ))}
      {state === "error" && (
        <p role="alert" className="m-0 text-small text-danger">
          {R.saveError}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={!dirty || state === "saving"}
        data-testid="reflection-save"
        className={cx(
          "h-12 rounded-xl border font-mono text-meta tracking-eyebrow",
          dirty ? "border-line-bold text-text" : "border-line text-dim",
        )}
      >
        {state === "saving"
          ? R.saving
          : !dirty && !isEmptyReflection(saved)
            ? R.saved
            : R.save}
      </button>
    </form>
  );
}

/** Read-only (a past day): only the answered questions. */
export function ReflectionView({
  kind,
  reflection,
}: {
  kind: ReviewKind;
  reflection: Reflection;
}) {
  if (isEmptyReflection(reflection)) return null;
  const text = labels(kind);
  return (
    <div
      data-testid={`reflection-view-${kind}`}
      className="flex flex-col gap-2.5 border-t border-line pt-3"
    >
      <span className="font-mono text-meta tracking-eyebrow text-dim">
        {R.reflection}
      </span>
      {REFLECTION_FIELDS.filter((f) => reflection[f]).map((f) => (
        <div key={f} className="flex flex-col gap-0.5">
          <span className="text-num-heros text-dim">{text[f]}</span>
          <span className="text-body break-words whitespace-pre-wrap text-muted">
            {reflection[f]}
          </span>
        </div>
      ))}
    </div>
  );
}
