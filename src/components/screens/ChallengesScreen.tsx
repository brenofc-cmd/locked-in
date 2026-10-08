"use client";

import { t } from "@/i18n/pt-BR";
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
        <h1 className="font-mono text-meta font-normal tracking-eyebrow text-dim">
          {t.challengesScreen.title}
        </h1>
        <p className="text-heading leading-[1.3] cond font-bold text-pretty">
          {t.challengesScreen.needsPartner}
        </p>
        <Link
          href="/duo"
          className="flex h-14 items-center self-start rounded-2xl btn-primary px-[26px] font-mono text-small font-bold tracking-[0.2em]"
        >
          {t.challengesScreen.invitePartner}
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
    <div className="flex flex-col gap-6 animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <h1 className="page-title">{t.challengesScreen.title}</h1>
          <span className="text-body text-muted">
            {t.challengesScreen.subtitle}
          </span>
        </div>
        <button
          type="button"
          onClick={() => app.openSheet({ kind: "challenge" })}
          className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold"
        >
          {t.challengesScreen.newChallenge}
        </button>
      </header>

      {challenges === null && !error && (
        <span className="text-small text-dim">
          {t.challengesScreen.loading}
        </span>
      )}
      {error && (
        <span role="alert" className="text-small text-danger">
          {t.challengesScreen.loadFailed}
        </span>
      )}

      {challenges !== null && active.length === 0 && (
        <div className="flex flex-col gap-2 border-y border-line py-6">
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.challengesScreen.noActive}
          </span>
          <span className="text-body text-muted">
            {t.challengesScreen.createTogether}
          </span>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
          {active.map((c) => (
            <ChallengeCard key={c.id} c={c} onDelete={remove} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section
          aria-label={t.challengesScreen.completedAria}
          className="flex flex-col gap-3.5"
        >
          <h2 className="border-b border-line-strong pb-2 font-mono text-meta font-normal tracking-eyebrow text-muted">
            {t.challengesScreen.completed}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
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
        ? t.challengesScreen.youWon
        : winner === "partner"
          ? t.challengesScreen.partnerWon(partner.name.toUpperCase())
          : t.challengesScreen.draw
      : status === "active"
        ? leader === "me"
          ? t.challengesScreen.youLead
          : leader === "partner"
            ? t.challengesScreen.partnerLeads(partner.name.toUpperCase())
            : t.challengesScreen.level
        : "";

  return (
    <article
      aria-label={c.title}
      data-testid="challenge-card"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-6 animate-[li-rise_.4s_ease]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-lead font-semibold tracking-meta break-words uppercase">
            {c.title}
          </h2>
          <span className="text-small text-dim">
            {goalLabel(c.type, c.target)} · {periodLabel(c.start, c.end)}
          </span>
        </span>
        <span
          data-testid="challenge-status"
          className={cx(
            "font-mono text-meta tracking-eyebrow whitespace-nowrap",
            status === "active" ? "text-accent" : "text-dim",
          )}
        >
          {statusLabel(c, today)}
        </span>
      </div>
      {verdict && (
        <span
          data-testid="challenge-verdict"
          className="font-mono text-meta tracking-eyebrow"
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
          className="h-11 self-start text-small text-dim underline underline-offset-[3px]"
        >
          {t.challengesScreen.deleteBeforeStart}
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
          "flex justify-between gap-3 text-body",
          !me && "text-muted",
        )}
      >
        <span className="truncate">{name}</span>
        <span className="tabular-nums" data-testid={testId}>
          {value}
        </span>
      </div>
      <div className="h-[5px] rounded-sm bg-white/6">
        <div
          className={cx("h-full rounded-sm", me ? "bg-accent" : "bg-ghost")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
