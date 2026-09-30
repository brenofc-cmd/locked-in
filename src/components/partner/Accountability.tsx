"use client";

/**
 * Partner Hub 2.0 pieces (V2 Phase 6, docs/ACCOUNTABILITY.md): shared
 * commitments with their proof, DAR UM TOQUE, the daily check-in and the
 * short history. The partner's side only ever uses partnerProjection():
 * public title, status, generic proof kind and proof time.
 */
import { t } from "@/i18n/pt-BR";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { ReactButton, ReceivedReaction } from "@/components/today/Reactions";
import { SectionHeader, chipTone, cx } from "@/components/ui";
import {
  CHECKIN_STATES,
  daySummary,
  kindLine,
  nudgeBlock,
  nudgeCooldownLeft,
  partnerProjection,
  proofLine,
  type CheckinState,
  type Commitment,
  type CommitmentStatus,
  type PartnerCommitment,
} from "@/lib/accountability";
import { dateLabel } from "@/lib/local-date";
import { focusLabel, standardMet } from "@/lib/progress";

const A = t.accountability;

const MARK: Record<CommitmentStatus, string> = {
  active: "border border-white/25",
  proven: "bg-accent",
  missed: "border border-danger/60",
  cancelled: "border border-white/10",
};

function StatusMark({ status }: { status: CommitmentStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cx("mt-[5px] size-2.5 shrink-0 rounded-full", MARK[status])}
    />
  );
}

/** Status word + AUTODECLARADO / COM PROVA for a proven commitment. */
function StatusWord({
  c,
}: {
  c: Pick<PartnerCommitment, "status" | "resolution">;
}) {
  return (
    <span
      data-testid="commitment-status"
      className={cx(
        "font-mono text-[10.5px] tracking-[.14em]",
        c.status === "proven"
          ? "text-accent"
          : c.status === "missed"
            ? "text-danger"
            : "text-dim",
      )}
    >
      {A.status[c.status]}
      {c.status === "proven" && (
        <span data-testid="commitment-resolution" className="ml-2 text-dim">
          {c.resolution === "self_declared" ? A.selfDeclared : A.verified}
        </span>
      )}
    </span>
  );
}

/** HOJE extras: the partner's focus, standard and commitments of the day. */
export function PartnerDayLine() {
  const app = useApp();
  const acc = app.accountability;
  const s = daySummary(acc.theirs);
  const std = app.partnerStandard;
  const met =
    std !== null &&
    standardMet(app.partnerCounts.total, app.partnerCounts.done, std);
  return (
    <div
      data-testid="partner-day-line"
      className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] tracking-[.14em] text-dim"
    >
      <span>
        {A.focusToday}{" "}
        <span className="text-text" data-testid="partner-focus-today">
          {focusLabel(acc.partnerFocusSeconds)}
        </span>
      </span>
      {std !== null && (
        <span>
          {A.standardToday} {std}%{" "}
          <span className={met ? "text-accent" : "text-text"}>
            {met ? A.standardMet : A.standardOpen}
          </span>
        </span>
      )}
      <span data-testid="partner-commitment-summary">
        {s.total ? A.summary(s.proven, s.total) : A.summaryNone}
      </span>
    </div>
  );
}

/** "CHECK-IN · PRECISO DE COBRANÇA" under the partner's name. */
export function PartnerCheckinLine() {
  const { accountability, partner } = useApp();
  const state = accountability.partnerCheckin;
  return (
    <span
      data-testid="partner-checkin"
      className="font-mono text-[10.5px] tracking-[.14em] text-dim"
    >
      {A.checkinPartner(partner.name.toUpperCase())} ·{" "}
      <span className={state ? "text-text" : undefined}>
        {state ? A.checkinStates[state] : A.checkinNone}
      </span>
    </span>
  );
}

/** My check-in for today: three states, changeable, history in the database. */
export function CheckinPicker() {
  const { accountability } = useApp();
  const current = accountability.myCheckin;
  return (
    <section aria-label={A.checkinAria} className="flex flex-col gap-3">
      <SectionHeader as="h2" label={A.checkin} />
      <div
        role="radiogroup"
        aria-label={A.checkinAria}
        className="grid grid-cols-3 gap-1.5"
      >
        {CHECKIN_STATES.map((s: CheckinState) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current === s}
            data-testid={`checkin-${s}`}
            disabled={accountability.busy.includes("checkin")}
            onClick={() => current !== s && void accountability.checkin(s)}
            className={cx(
              "min-h-[46px] rounded-xl border px-1.5 font-mono text-[10.5px] leading-tight tracking-[.12em]",
              chipTone(current === s),
            )}
          >
            {A.checkinStates[s]}
          </button>
        ))}
      </div>
    </section>
  );
}

function PartnerActions({ c }: { c: Commitment }) {
  const app = useApp();
  const { me } = useSession();
  const acc = app.accountability;
  if (c.status === "proven") {
    const eventId =
      app.feed.find(
        (e) => e.who === "partner" && e.kind === "commit" && e.taskId === c.id,
      )?.id ?? null;
    return eventId ? (
      <ReactButton
        eventId={eventId}
        title={`${app.partner.name} ${t.feed.commitmentProven(c.title)}`}
        name={c.title}
      />
    ) : null;
  }
  const block = nudgeBlock(c, me.id, acc.nudges, app.now);
  if (block === "closed" || block === "self") return null;
  const left = nudgeCooldownLeft(c.id, me.id, acc.nudges, app.now);
  const label =
    block === "cooldown"
      ? left > 0
        ? A.nudgeWait(Math.ceil(left / 60000))
        : A.nudged
      : block === "limit"
        ? A.nudgeLimit
        : A.nudge;
  return (
    <button
      type="button"
      data-testid="nudge-button"
      aria-label={block ? label : A.nudgeAria(c.title)}
      disabled={block !== null || acc.busy.includes(c.id)}
      onClick={() => void acc.nudge(c)}
      className={cx(
        "min-h-9 shrink-0 rounded-full border px-3 font-mono text-[10px] tracking-[.14em]",
        block
          ? "border-white/6 text-quiet"
          : "border-accent-line text-text active:scale-[.97]",
      )}
    >
      {label}
    </button>
  );
}

function MyActions({ c }: { c: Commitment }) {
  const app = useApp();
  const acc = app.accountability;
  const busy = acc.busy.includes(c.id);
  const small =
    "min-h-9 shrink-0 rounded-full border px-3 font-mono text-[10px] tracking-[.14em] disabled:opacity-50";
  const eventId =
    c.status === "proven"
      ? (app.feed.find(
          (e) => e.who === "me" && e.kind === "commit" && e.taskId === c.id,
        )?.id ?? null)
      : null;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {eventId && <ReceivedReaction eventId={eventId} />}
      {c.kind === "simple" && c.status === "active" && (
        <button
          type="button"
          data-testid="cumpri-button"
          aria-label={A.cumpriAria(c.title)}
          disabled={busy}
          onClick={() => void acc.declare(c, true)}
          className={cx(small, "border-accent-line text-text")}
        >
          {A.cumpri}
        </button>
      )}
      {c.kind === "simple" && c.status === "proven" && (
        <button
          type="button"
          aria-label={A.undoAria(c.title)}
          disabled={busy}
          onClick={() => void acc.declare(c, false)}
          className={cx(small, "border-white/9 text-muted")}
        >
          {A.undo}
        </button>
      )}
      {c.status === "active" && (
        <button
          type="button"
          data-testid="cancel-commitment"
          aria-label={A.cancelAria(c.title)}
          disabled={busy}
          onClick={() => void acc.cancel(c)}
          className={cx(small, "border-white/6 text-dim")}
        >
          {A.cancel}
        </button>
      )}
    </span>
  );
}

function CommitmentItem({ c, mine }: { c: Commitment; mine: boolean }) {
  const { me } = useSession();
  // The partner's rows go through the projection: nothing else is rendered.
  const view: PartnerCommitment = partnerProjection(c);
  const proof = proofLine(view, me.timezone);
  return (
    <div
      data-testid={mine ? "my-commitment" : "partner-commitment"}
      data-status={view.status}
      className="flex min-h-[60px] items-start gap-3 border-b border-white/5 py-2.5"
    >
      <StatusMark status={view.status} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14.5px] leading-[1.35] text-pretty">
          {view.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StatusWord c={view} />
          <span className="font-mono text-[10.5px] tracking-[.12em] text-quiet">
            {kindLine(c)}
          </span>
        </span>
        {proof && (
          <span
            data-testid="commitment-proof"
            className="text-[12.5px] text-muted"
          >
            {proof}
          </span>
        )}
      </span>
      {mine ? <MyActions c={c} /> : <PartnerActions c={c} />}
    </div>
  );
}

/** COMPROMISSOS: the partner's commitments of their day and mine of mine. */
export function CommitmentsSection() {
  const app = useApp();
  const acc = app.accountability;
  const name = app.partner.name.toUpperCase();
  const mineCount = acc.mine.length;
  return (
    <section
      aria-label={A.commitmentsAria}
      className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8 desk:gap-12"
    >
      <div className="flex flex-col" data-testid="partner-commitments">
        <SectionHeader
          as="h2"
          label={`${A.commitments} · ${name}`}
          right={
            acc.theirs.length
              ? `${daySummary(acc.theirs).proven} / ${daySummary(acc.theirs).total}`
              : undefined
          }
        />
        {!acc.loaded && !acc.error && (
          <span className="py-3.5 text-[13.5px] text-dim">{A.loading}</span>
        )}
        {acc.error && !acc.loaded && (
          <span className="flex items-center gap-3 py-3.5 text-[13.5px] text-dim">
            {A.loadError}
            <button
              type="button"
              onClick={() => void acc.reload()}
              className="h-11 underline underline-offset-[3px]"
            >
              {A.retry}
            </button>
          </span>
        )}
        {acc.loaded &&
          acc.theirs.map((c) => (
            <CommitmentItem key={c.id} c={c} mine={false} />
          ))}
        {acc.loaded && acc.theirs.length === 0 && (
          <span className="py-3.5 text-[13.5px] text-dim">
            {A.nonePartner(app.partner.name)}
          </span>
        )}
      </div>
      <div className="flex flex-col" data-testid="my-commitments">
        <SectionHeader
          as="h2"
          label={`${A.commitments} · ${A.yours}`}
          right={
            mineCount
              ? `${daySummary(acc.mine).proven} / ${daySummary(acc.mine).total}`
              : undefined
          }
        />
        {acc.loaded &&
          acc.mine.map((c) => <CommitmentItem key={c.id} c={c} mine />)}
        {acc.loaded && mineCount === 0 && (
          <span className="py-3.5 text-[13.5px] text-dim">{A.noneMine}</span>
        )}
        <button
          type="button"
          data-testid="new-commitment"
          aria-label={A.newCommitmentAria}
          onClick={() => app.openSheet({ kind: "commitment" })}
          className="mt-3 h-12 self-start rounded-xl border border-white/10 px-4 font-mono text-[11px] tracking-[.18em] text-text active:scale-[.98]"
        >
          {A.newCommitment}
        </button>
      </div>
    </section>
  );
}

/** HISTÓRICO · 14 DIAS: final results of closed days (both of us). */
export function CommitmentHistory() {
  const app = useApp();
  const { me } = useSession();
  const days = app.accountability.history;
  return (
    <section aria-label={A.historyAria} className="flex flex-col">
      <SectionHeader as="h2" label={A.history} />
      {days.map((d) => (
        <div
          key={d.date}
          className="flex flex-col border-b border-white/5 py-2.5"
        >
          <span className="font-mono text-[10.5px] tracking-[.14em] text-dim">
            {dateLabel(d.date)}
          </span>
          {d.items.map((c) => {
            const view = partnerProjection(c);
            return (
              <div
                key={c.id}
                data-testid="history-commitment"
                data-status={view.status}
                className="flex min-h-10 items-center gap-3"
              >
                <StatusMark status={view.status} />
                <span className="w-14 shrink-0 text-[12.5px] text-dim">
                  {c.ownerId === me.id
                    ? A.who.me
                    : A.who.partner(app.partner.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">
                  {view.title}
                </span>
                <StatusWord c={view} />
              </div>
            );
          })}
        </div>
      ))}
      {days.length === 0 && (
        <span className="py-3.5 text-[13.5px] text-dim">{A.historyEmpty}</span>
      )}
    </section>
  );
}
