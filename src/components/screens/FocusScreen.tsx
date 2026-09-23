"use client";

import { useApp } from "@/components/app-state";
import { FocusPicker } from "@/components/focus/FocusPicker";
import { StatusDot } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { partnerView } from "@/lib/partner";

export function FocusScreen() {
  const app = useApp();
  const pv = partnerView(app.partner, app.partnerTasks, app.feed, app.now);
  const sessions = [...app.sessions].reverse();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 animate-[li-fade-up_.4s_ease] desk:gap-12 wide:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-[26px]">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
          WHAT ARE YOU WORKING ON?
        </h1>
        <FocusPicker />
        <button
          type="button"
          onClick={app.startFocus}
          className="h-[62px] rounded-2xl bg-accent font-mono text-sm font-semibold tracking-[.34em] text-bg transition-transform duration-100 active:scale-[.97]"
        >
          LOCK IN
        </button>
      </div>
      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-3.5">
          <span className="font-mono text-[11px] tracking-[.16em] text-dim">
            FOCUS TODAY
          </span>
          <span
            data-testid="focus-today"
            className="text-[34px] leading-none font-medium tracking-[-0.04em] desk:text-[46px]"
          >
            {formatMinutes(app.focusMin)}
          </span>
        </div>
        <div className="flex flex-col">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-1.5 border-b border-white/5 py-3.5"
            >
              <div className="flex justify-between gap-2.5">
                <span className="text-[14.5px]">{s.task}</span>
                <span className="font-mono text-xs text-muted">
                  {s.min} MIN
                </span>
              </div>
              <span className="font-mono text-[11px] text-dim">
                {s.from} – {s.to}
              </span>
              {s.note && (
                <span className="text-[13px] leading-[1.45] text-muted">
                  {s.note}
                </span>
              )}
            </div>
          ))}
        </div>
        {app.hasPartner && (
          <div className="flex items-center gap-3 text-[13.5px] text-muted">
            <StatusDot live={pv.live} pulse={pv.pulse} />
            <span>
              <span className="text-text">{app.partner.name}</span> ·{" "}
              {pv.statusLine}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
