"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { SwitchTrack, chipTone, cx } from "@/components/ui";
import { dateLabel } from "@/lib/local-date";
import {
  EVENT_TYPES,
  NOTES_MAX,
  REMINDERS,
  SUBJECT_MAX,
  TITLE_MAX,
  countdown,
  eventHeading,
  taskSuggestion,
  typeLabel,
  validatePlannerInput,
  type EventType,
  type PlannerEvent,
  type PlannerInput,
  type Reminder,
} from "@/lib/planner";
import {
  clearPlannerDraft,
  loadPlannerDraft,
  savePlannerDraft,
} from "@/lib/resume-state";

const monoLabel = "font-mono text-meta tracking-eyebrow text-dim";
const field =
  "rounded-xl border border-line-strong bg-bg text-text outline-none focus:border-line-bold";

const reminderLabel = (r: Reminder) =>
  t.planner.reminders[
    r === null ? "none" : (String(r) as "0" | "1" | "3" | "7")
  ];

/**
 * A planner event (V2 Phase 2): the owner creates / edits / deletes; the
 * partner only reads a shared one. Both can turn it into a task suggestion
 * ("Add to tasks" opens Quick Add pre-filled; nothing is created until the
 * user confirms there). A new event keeps a 24 h draft (Resume State); an
 * edit never does. The delete confirmation lives in this sheet only.
 */
export function PlannerSheet({
  event,
  date,
}: {
  event?: PlannerEvent;
  date?: string;
}) {
  if (event && !event.mine) return <PartnerEvent event={event} />;
  return <PlannerForm event={event} date={date} />;
}

function AddToTasks({ event }: { event: PlannerEvent }) {
  const app = useApp();
  return (
    <button
      type="button"
      onClick={() =>
        app.openSheet({ kind: "add", prefill: taskSuggestion(event) })
      }
      className="h-12 rounded-2xl border border-line-strong font-mono text-meta font-semibold tracking-eyebrow"
    >
      {t.planner.addToTasks}
    </button>
  );
}

function PartnerEvent({ event }: { event: PlannerEvent }) {
  const app = useApp();
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-meta tracking-eyebrow text-muted">
        {t.planner.eventOf(app.partner.name)}
      </span>
      <div className="flex flex-col gap-1.5">
        <span className={monoLabel}>{eventHeading(event)}</span>
        <span className="text-title font-medium">{event.title}</span>
        <span className="text-body text-muted">
          {[dateLabel(event.date), event.time, countdown(event.date, app.today)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {event.important && (
          <span className="font-mono text-meta tracking-eyebrow text-accent">
            {t.planner.importantTag}
          </span>
        )}
      </div>
      {event.notes && (
        <p className="text-body leading-[1.5] whitespace-pre-wrap text-muted">
          {event.notes}
        </p>
      )}
      <AddToTasks event={event} />
    </div>
  );
}

function PlannerForm({ event, date }: { event?: PlannerEvent; date?: string }) {
  const app = useApp();
  const { me } = useSession();
  const [draft] = useState(() => (event ? null : loadPlannerDraft(me.id)));
  const start: PlannerInput = event
    ? {
        title: event.title,
        type: event.type,
        subject: event.subject,
        date: event.date,
        time: event.time,
        notes: event.notes,
        important: event.important,
        shared: event.shared,
        reminder: event.reminder,
      }
    : {
        title: draft?.title ?? "",
        type: draft?.type ?? "exam",
        subject: draft?.subject ?? "",
        date: date ?? (draft?.date || app.today),
        time: draft?.time ?? "",
        notes: draft?.notes ?? "",
        important: draft?.important ?? false,
        shared: (draft?.shared ?? app.settings.shareNewTasks) && app.hasPartner,
        reminder: draft?.reminder ?? 1,
      };
  const [form, setForm] = useState<PlannerInput>(start);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof PlannerInput>(k: K, v: PlannerInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  // Draft of a NEW event only; removed once it is saved.
  useEffect(() => {
    if (event || done) return;
    savePlannerDraft(me.id, form);
  }, [event, done, me.id, form]);

  const valid = form.title.trim().length > 0;

  async function save() {
    const invalid = validatePlannerInput(form, app.hasPartner);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    const res = await app.savePlannerEvent(event?.id ?? null, form);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!event) {
      setDone(true);
      clearPlannerDraft(me.id);
    }
    app.closeSheet();
  }

  async function remove() {
    if (!event) return;
    setPending(true);
    const ok = await app.deletePlannerEvent(event.id);
    setPending(false);
    if (ok) app.closeSheet();
  }

  if (confirmDelete && event) {
    return (
      <div className="flex flex-col gap-2 animate-[li-fade-up_.2s_ease]">
        <span className="pb-2 text-base">{t.planner.confirmDelete}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void remove()}
          className="h-14 rounded-2xl bg-danger font-mono text-small font-semibold tracking-eyebrow text-bg disabled:opacity-60"
        >
          {t.planner.confirmDeleteYes}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(false)}
          className="h-12 text-body text-dim"
        >
          {t.planner.cancel}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      aria-label={event ? t.planner.editEvent : t.planner.newEvent}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <div className="flex min-h-8 items-center justify-between">
        <span className="font-mono text-meta tracking-eyebrow text-muted">
          {event ? t.planner.editEvent : t.planner.newEvent}
        </span>
        {event && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-9 rounded-lg px-2.5 text-body text-danger"
          >
            {t.planner.delete}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span id="planner-type" className={monoLabel}>
          {t.planner.fields.type}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="planner-type"
          className="flex flex-wrap gap-1.5"
        >
          {EVENT_TYPES.map((type: EventType) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={form.type === type}
              onClick={() => set("type", type)}
              className={cx(
                "h-[38px] rounded-xl border px-3 font-mono text-meta tracking-meta",
                chipTone(form.type === type),
              )}
            >
              {typeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      <input
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        maxLength={TITLE_MAX}
        placeholder={t.planner.fields.titlePlaceholder}
        aria-label={t.planner.fields.title}
        enterKeyHint="done"
        className="h-14 rounded-2xl border border-line-strong bg-bg px-4 text-lead outline-none focus:border-line-bold"
      />
      <input
        value={form.subject}
        onChange={(e) => set("subject", e.target.value)}
        maxLength={SUBJECT_MAX}
        placeholder={t.planner.fields.subjectPlaceholder}
        aria-label={t.planner.fields.subject}
        className={cx(field, "h-[46px] px-3.5 text-base")}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className={monoLabel}>{t.planner.fields.date}</span>
          <input
            type="date"
            required
            value={form.date}
            min="2000-01-01"
            max="2100-12-31"
            onChange={(e) => set("date", e.target.value)}
            className={cx(field, "h-[46px] px-3 text-base [color-scheme:dark]")}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={monoLabel}>{t.planner.fields.time}</span>
          <input
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            className={cx(field, "h-[46px] px-3 text-base [color-scheme:dark]")}
          />
        </label>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={form.important}
        onClick={() => set("important", !form.important)}
        className="flex min-h-[48px] items-center justify-between text-left"
      >
        <span className="text-body">{t.planner.fields.important}</span>
        <SwitchTrack on={form.important} />
      </button>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={form.shared}
          aria-disabled={!app.hasPartner}
          onClick={() => app.hasPartner && set("shared", !form.shared)}
          className={cx(
            "flex min-h-[48px] items-center justify-between text-left",
            !app.hasPartner && "opacity-50",
          )}
        >
          <span className="text-body">{t.planner.fields.share}</span>
          <SwitchTrack on={form.shared} />
        </button>
        {!app.hasPartner && (
          <span className="text-num-heros text-dim">
            {t.planner.noPartnerShare}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span id="planner-reminder" className={monoLabel}>
          {t.planner.fields.reminder}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="planner-reminder"
          className="flex flex-wrap gap-1.5"
        >
          {REMINDERS.map((r) => (
            <button
              key={String(r)}
              type="button"
              role="radio"
              aria-checked={form.reminder === r}
              onClick={() => set("reminder", r)}
              className={cx(
                "h-[38px] rounded-xl border px-3 font-mono text-meta tracking-meta",
                chipTone(form.reminder === r),
              )}
            >
              {reminderLabel(r)}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        maxLength={NOTES_MAX}
        rows={2}
        placeholder={t.planner.fields.notes}
        aria-label={t.planner.fields.notes}
        className={cx(field, "min-h-[46px] px-3.5 py-3 text-base")}
      />

      {error && (
        <p role="alert" className="-mt-2 text-small text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={!valid || pending}
        className={cx(
          "h-14 rounded-2xl font-mono text-small font-semibold tracking-brand",
          valid && !pending ? "btn-primary" : "bg-selected text-ghost",
        )}
      >
        {t.planner.save}
      </button>
      {event && <AddToTasks event={event} />}
    </form>
  );
}
