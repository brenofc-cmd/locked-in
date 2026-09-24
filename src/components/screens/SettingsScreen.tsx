"use client";

import { useState, useTransition } from "react";
import { leaveDuo } from "@/app/(app)/actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { SwitchTrack, cx } from "@/components/ui";
import { STANDARD_OPTIONS } from "@/lib/mock-data";

const since = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const PREFS = [
  {
    k: "briefing",
    label: "Morning briefing",
    d: "Show the briefing the first time you open the app each day.",
  },
  {
    k: "share",
    label: "Share focus sessions live",
    d: "Your partner sees when you lock in and when you finish.",
  },
  {
    k: "reactions",
    label: "Reaction notifications",
    d: "Get notified when your partner reacts to your work.",
  },
  {
    k: "alerts",
    label: "Partner completion alerts",
    d: "Notify me each time your partner completes a task.",
  },
  {
    k: "reminders",
    label: "Task reminders",
    d: "Remind me at a task's time when it has a reminder.",
  },
  {
    k: "review",
    label: "End of day review",
    d: "Prompt me to review the day at 22:00.",
  },
  {
    k: "weekly",
    label: "Weekly review",
    d: "Show the week's result on Monday morning.",
  },
] as const;

type PrefKey = (typeof PREFS)[number]["k"];

export function SettingsScreen() {
  const app = useApp();
  const { me, duo } = useSession();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, startLeave] = useTransition();

  function onLeave() {
    if (!confirmLeave) return setConfirmLeave(true);
    startLeave(async () => {
      const res = await leaveDuo();
      setConfirmLeave(false);
      app.toast(
        res.ok
          ? { text: "You left the duo.", sub: "DUO ENDED FOR BOTH" }
          : { text: res.error, sub: "DUO" },
      );
    });
  }
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    briefing: true,
    share: true,
    reactions: true,
    alerts: false,
    reminders: true,
    review: true,
    weekly: true,
  });

  return (
    <div className="flex max-w-[620px] flex-col gap-8 animate-[li-fade-up_.4s_ease]">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        SETTINGS
      </h1>
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-full border border-white/8 bg-[repeating-linear-gradient(45deg,#151517_0_6px,#1B1B1E_6px_12px)] font-mono text-[9px] tracking-[.14em] text-dim"
        >
          PHOTO
        </div>
        <span className="flex flex-col gap-1">
          <span className="text-xl font-semibold">{app.userName}</span>
          <span className="text-[13px] text-dim">
            {me.email} · {me.timezone} · since {since(me.createdAt)}
          </span>
        </span>
      </div>

      <section aria-labelledby="standard-h" className="flex flex-col gap-3">
        <h2
          id="standard-h"
          className="font-mono text-[11px] font-normal tracking-[.16em] text-muted"
        >
          YOUR STANDARD
        </h2>
        <span className="text-[13.5px] leading-[1.5] text-dim">
          A day counts toward your streak when you complete this share of
          scheduled tasks.
        </span>
        <div
          role="radiogroup"
          aria-labelledby="standard-h"
          className="grid grid-cols-4 gap-1.5"
        >
          {STANDARD_OPTIONS.map((o) => {
            const on = app.standard === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => app.setStandard(o)}
                className={cx(
                  "h-[46px] rounded-xl border text-[15px] font-medium",
                  on
                    ? "border-text bg-text text-bg"
                    : "border-white/9 text-muted",
                )}
              >
                {o}%
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="notif-h" className="flex flex-col">
        <h2
          id="notif-h"
          className="border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted"
        >
          NOTIFICATIONS
        </h2>
        {PREFS.map((p) => (
          <button
            key={p.k}
            type="button"
            role="switch"
            aria-checked={prefs[p.k]}
            onClick={() => setPrefs((s) => ({ ...s, [p.k]: !s[p.k] }))}
            className="flex min-h-[62px] items-center justify-between gap-4 border-b border-white/5 text-left"
          >
            <span className="flex flex-col gap-1">
              <span className="text-[14.5px]">{p.label}</span>
              <span className="text-[12.5px] text-dim">{p.d}</span>
            </span>
            <SwitchTrack on={prefs[p.k]} />
          </button>
        ))}
      </section>

      <section aria-labelledby="privacy-h" className="flex flex-col gap-1.5">
        <h2
          id="privacy-h"
          className="font-mono text-[11px] font-normal tracking-[.16em] text-muted"
        >
          PRIVACY
        </h2>
        <span className="text-[13.5px] leading-[1.5] text-dim">
          Tasks are shared with your Duo. Hide a single task from its options
          under “More options”. Your partner only sees Online, Focusing or
          Offline.
        </span>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="h-11 rounded-xl border border-white/12 px-[18px] text-sm"
          >
            Sign out
          </button>
        </form>
        {duo && (
          <button
            type="button"
            onClick={onLeave}
            disabled={leaving}
            className="h-11 rounded-xl border border-danger/30 px-[18px] text-sm text-danger disabled:opacity-60"
          >
            {leaving
              ? "Leaving…"
              : confirmLeave
                ? "Tap again: ends the duo for both"
                : "Leave duo"}
          </button>
        )}
      </div>
    </div>
  );
}
