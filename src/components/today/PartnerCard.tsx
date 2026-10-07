"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { Avatar, StatusDot, cx } from "@/components/ui";
import { usePartnerView } from "@/components/use-partner-view";

export function PartnerCard() {
  const { partner } = useApp();
  const pv = usePartnerView();

  return (
    <Link
      href="/partner"
      aria-label={t.partnerCard.aria(
        partner.name,
        pv.label.toLowerCase(),
        pv.pct,
        pv.done,
        pv.total,
        pv.seen,
      )}
      className="flex flex-col gap-3.5 rounded-2xl border border-line bg-card p-5 text-left transition-[box-shadow,transform] duration-700 active:scale-[.985]"
      style={{
        boxShadow: pv.flashing
          ? "0 0 0 1px color-mix(in oklab,var(--color-accent) 50%,transparent),0 0 40px color-mix(in oklab,var(--color-accent) 8%,transparent)"
          : "0 0 0 1px transparent",
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2.5">
          <Avatar initial={partner.initial} className="size-8 text-small" />
          <span className="flex flex-col gap-1">
            <span className="text-body font-semibold tracking-meta">
              {partner.name.toUpperCase()}
            </span>
            <span
              className={cx(
                "flex items-center gap-1.5 font-mono text-meta tracking-eyebrow",
                pv.live ? "text-accent" : "text-dim",
              )}
            >
              <StatusDot live={pv.live} pulse={pv.pulse} size={6} />
              {pv.label}
              {pv.seen && (
                <span data-testid="partner-seen" className="text-dim">
                  · {pv.seen.toUpperCase()}
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="text-number leading-none font-medium tracking-number tabular-nums">
            {pv.pct}%
          </span>
          <span className="font-mono text-meta text-dim">
            {pv.done} / {pv.total}
          </span>
        </span>
      </div>
      {pv.line && (
        <span
          className={cx(
            "text-small tabular-nums",
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
  "flex h-11 items-center self-start rounded-xl border border-line-strong px-5 font-mono text-meta font-semibold tracking-eyebrow";

/** Real state: no duo yet, or a duo still waiting for the partner. */
export function NoPartnerCard() {
  const { duo } = useSession();
  const waiting = duo !== null;
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-dashed border-line-strong p-5">
      <span className="font-mono text-meta tracking-eyebrow text-dim">
        {waiting ? t.partnerCard.waiting : t.partnerCard.noPartner}
      </span>
      <span className="text-body leading-[1.45] text-pretty">
        {waiting
          ? t.partnerCard.shareCodeLine(duo.inviteCode)
          : t.partnerCard.inviteLine}
      </span>
      <div className="flex flex-wrap gap-2">
        {waiting ? (
          <Link href="/duo" className={CARD_LINK}>
            {t.partnerCard.shareCode}
          </Link>
        ) : (
          <>
            <Link href="/duo" className={CARD_LINK}>
              {t.partnerCard.createDuo}
            </Link>
            <Link href="/duo#join-code" className={CARD_LINK}>
              {t.partnerCard.joinDuo}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
