"use client";

import Link from "next/link";
import { useApp } from "@/components/app-state";
import { useChallenges } from "@/components/use-challenges";
import { cx } from "@/components/ui";
import {
  challengeLeader,
  challengeStatus,
  challengeWinner,
  formatValue,
  goalLabel,
  goalShare,
  periodLabel,
  statusLabel,
  type Challenge,
} from "@/lib/challenges";

/**
 * Real duo challenges (Stage 8): two types, progress derived from tasks and
 * focus, status from the dates. Separate from the weekly head-to-head.
 */
export function ChallengesScreen() {
  const app = useApp();
  const { challenges, error, remove } = useChallenges();

  if (!app.hasPartner) {
    return (
      <div className="flex max-w-[420px] flex-col gap-5 pt-10 animate-[li-fade-up_.4s_ease]">
        <h1 className="font-mono text-[11px] font-normal tracking-[.16em] text-dim">
          CHALLENGES
        </h1>
        <p className="text-[26px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty">
          Challenges are set with your partner.
        </p>
        <Link
          href="/duo"
          className="flex h-[52px] items-center self-start rounded-[14px] bg-accent px-[22px] font-mono text-xs font-semibold tracking-[.22em] text-bg"
        >
          INVITE PARTNER
        </Link>
      </div>
    );
  }

  const active = (challenges ?? []).filter(
    (c) => challengeStatus(c, app.today) !== "completed",
  );
  const done = (challenges ?? []).filter(
    (c) => challengeStatus(c, app.today) === "completed",
  );

  return (
    <div className="flex flex-col gap-[26px] animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
            CHALLENGES
          </h1>
          <span className="text-[14.5px] text-muted">
            Optional. Private to your Duo.
          </span>
        </div>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "challenge" })}
          className="h-11 rounded-xl border border-white/12 px-4 text-sm"
        >
          New challenge
        </button>
      </header>

      {challenges === null && !error && (
        <span className="text-[13.5px] text-dim">Loading…</span>
      )}
      {error && (
        <span role="alert" className="text-[13.5px] text-danger">
          Could not load challenges.
        </span>
      )}

      {challenges !== null && active.length === 0 && (
        <div className="flex flex-col gap-2 border-y border-white/7 py-6">
          <span className="font-mono text-[11px] tracking-[.16em] text-dim">
            NO ACTIVE CHALLENGE
          </span>
          <span className="text-[15px] text-muted">Create one together.</span>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
          {active.map((c) => (
            <ChallengeCard key={c.id} c={c} onDelete={remove} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section
          aria-label="Completed challenges"
          className="flex flex-col gap-3.5"
        >
          <h2 className="border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted">
            COMPLETED
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
            {done.map((c) => (
              <ChallengeCard key={c.id} c={c} onDelete={remove} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ChallengeCard({
  c,
  onDelete,
}: {
  c: Challenge;
  onDelete: (id: string) => void;
}) {
  const { userName, partner, today } = useApp();
  const status = challengeStatus(c, today);
  const winner = challengeWinner(c, today);
  const leader = challengeLeader(c);
  const verdict =
    status === "completed"
      ? winner === "me"
        ? "YOU WON"
        : winner === "partner"
          ? `${partner.name.toUpperCase()} WON`
          : "DRAW"
      : status === "active"
        ? leader === "me"
          ? "YOU LEAD"
          : leader === "partner"
            ? `${partner.name.toUpperCase()} LEADS`
            : "LEVEL"
        : "";

  return (
    <article
      aria-label={c.title}
      data-testid="challenge-card"
      className="flex flex-col gap-5 rounded-[18px] border border-white/7 bg-card p-[22px] animate-[li-rise_.4s_ease]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-[.02em] break-words uppercase">
            {c.title}
          </h2>
          <span className="text-[13px] text-dim">
            {goalLabel(c.type, c.target)} · {periodLabel(c.start, c.end)}
          </span>
        </span>
        <span
          data-testid="challenge-status"
          className={cx(
            "font-mono text-[10px] tracking-[.14em] whitespace-nowrap",
            status === "active" ? "text-accent" : "text-dim",
          )}
        >
          {statusLabel(c, today)}
        </span>
      </div>
      {verdict && (
        <span
          data-testid="challenge-verdict"
          className="font-mono text-[11px] tracking-[.2em]"
        >
          {verdict}
        </span>
      )}
      <div className="flex flex-col gap-3">
        <Bar
          name={userName}
          value={formatValue(c.type, c.me)}
          width={goalShare(c.me, c.target)}
          me
          testId="challenge-me"
        />
        <Bar
          name={partner.name}
          value={c.partner === null ? "—" : formatValue(c.type, c.partner)}
          width={c.partner === null ? 0 : goalShare(c.partner, c.target)}
          testId="challenge-partner"
        />
      </div>
      {status === "upcoming" && (
        <button
          type="button"
          onClick={() => onDelete(c.id)}
          className="h-11 self-start text-[13px] text-dim underline underline-offset-[3px]"
        >
          Delete before it starts
        </button>
      )}
    </article>
  );
}

function Bar({
  name,
  value,
  width,
  me = false,
  testId,
}: {
  name: string;
  value: string;
  width: number;
  me?: boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cx(
          "flex justify-between gap-3 text-sm",
          !me && "text-muted",
        )}
      >
        <span className="truncate">{name}</span>
        <span className="tabular-nums" data-testid={testId}>
          {value}
        </span>
      </div>
      <div className="h-[5px] rounded-[3px] bg-white/6">
        <div
          className={cx("h-full rounded-[3px]", me ? "bg-accent" : "bg-ghost")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
