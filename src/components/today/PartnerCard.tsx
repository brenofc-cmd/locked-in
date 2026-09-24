"use client";

import Link from "next/link";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { Avatar, StatusDot, cx } from "@/components/ui";
import { partnerView } from "@/lib/partner";

export function PartnerCard() {
  const { partner, partnerCounts, feed, now } = useApp();
  const pv = partnerView(partner, partnerCounts, feed, now);

  return (
    <Link
      href="/partner"
      aria-label={`${partner.name}: ${pv.label.toLowerCase()}, ${pv.pct}% done, ${pv.done} of ${pv.total}. Open partner.`}
      className="flex flex-col gap-3.5 rounded-2xl border border-white/7 bg-card p-[18px] text-left transition-[box-shadow,transform] duration-700 active:scale-[.985]"
      style={{
        boxShadow: pv.flashing
          ? "0 0 0 1px color-mix(in oklab,var(--color-accent) 50%,transparent),0 0 40px color-mix(in oklab,var(--color-accent) 8%,transparent)"
          : "0 0 0 1px transparent",
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2.5">
          <Avatar initial={partner.initial} className="size-8 text-[13px]" />
          <span className="flex flex-col gap-[3px]">
            <span className="text-sm font-semibold tracking-[.06em]">
              {partner.name.toUpperCase()}
            </span>
            <span
              className={cx(
                "flex items-center gap-1.5 font-mono text-[10px] tracking-[.14em]",
                pv.live ? "text-accent" : "text-dim",
              )}
            >
              <StatusDot live={pv.live} pulse={pv.pulse} size={6} />
              {pv.label}
            </span>
          </span>
        </span>
        <span className="flex flex-col items-end gap-[3px]">
          <span className="text-[30px] leading-none font-medium tracking-[-0.04em] tabular-nums">
            {pv.pct}%
          </span>
          <span className="font-mono text-[10.5px] text-dim">
            {pv.done} / {pv.total}
          </span>
        </span>
      </div>
      {pv.line && (
        <span
          className={cx(
            "text-[13px] tabular-nums",
            pv.lineTone === "text" && "text-text",
            pv.lineTone === "muted" && "text-muted",
            pv.lineTone === "dim" && "text-dim",
          )}
        >
          {pv.line}
        </span>
      )}
    </Link>
  );
}

const CARD_LINK =
  "flex h-11 items-center self-start rounded-xl border border-white/14 px-[18px] font-mono text-[11.5px] font-semibold tracking-[.2em]";

/** Real state: no duo yet, or a duo still waiting for the partner. */
export function NoPartnerCard() {
  const { duo } = useSession();
  const waiting = duo !== null;
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-dashed border-white/12 p-5">
      <span className="font-mono text-[11px] tracking-[.16em] text-dim">
        {waiting ? "WAITING FOR YOUR PARTNER" : "NO PARTNER YET"}
      </span>
      <span className="text-[15px] leading-[1.45] text-pretty">
        {waiting
          ? `Share your code ${duo.inviteCode} with someone you trust.`
          : "Invite someone you trust to keep you accountable."}
      </span>
      <div className="flex flex-wrap gap-2">
        {waiting ? (
          <Link href="/duo" className={CARD_LINK}>
            SHARE CODE
          </Link>
        ) : (
          <>
            <Link href="/duo" className={CARD_LINK}>
              CREATE DUO
            </Link>
            <Link href="/duo#join-code" className={CARD_LINK}>
              JOIN DUO
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
