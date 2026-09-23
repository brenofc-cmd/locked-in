"use client";

import { useApp } from "@/components/app-state";

export function ChallengesScreen() {
  const { challenges, openSheet, userName, partner } = useApp();

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
          onClick={() => openSheet({ kind: "challenge" })}
          className="h-11 rounded-xl border border-white/12 px-4 text-sm"
        >
          New challenge
        </button>
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
        {challenges.map((c) => (
          <article
            key={c.id}
            aria-label={c.title}
            className="flex flex-col gap-5 rounded-[18px] border border-white/7 bg-card p-[22px] animate-[li-rise_.4s_ease]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-1.5">
                <h2 className="text-lg font-semibold tracking-[.02em]">
                  {c.title}
                </h2>
                <span className="text-[13px] text-dim">{c.desc}</span>
              </span>
              <span
                className={`font-mono text-[10px] tracking-[.14em] whitespace-nowrap ${c.status === "ACTIVE" ? "text-accent" : "text-dim"}`}
              >
                {c.status}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10.5px] tracking-[.16em] text-dim">
                {c.progLabel}
              </span>
              <span className="text-[22px] font-medium tracking-[-0.03em] tabular-nums">
                {c.prog}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <Bar name={userName} value={c.me} width={c.meWidth} me />
              <Bar
                name={partner.name}
                value={c.partner}
                width={c.partnerWidth}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Bar({
  name,
  value,
  width,
  me = false,
}: {
  name: string;
  value: string;
  width: number;
  me?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={
          me
            ? "flex justify-between text-sm"
            : "flex justify-between text-sm text-muted"
        }
      >
        <span>{name}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-[5px] rounded-[3px] bg-white/6">
        <div
          className={
            me
              ? "h-full rounded-[3px] bg-accent"
              : "h-full rounded-[3px] bg-ghost"
          }
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
