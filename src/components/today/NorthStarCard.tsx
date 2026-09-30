"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/ui";
import { summaryParts } from "@/lib/goal-proof";
import { isEmptyNorthStar, type NorthStar } from "@/lib/north-star";

/**
 * LEMBRE-SE DO PORQUÊ (V2 Phase 4): one vision, the current goal and one
 * mirror item — exactly as the user wrote them (featured, else the fallback
 * of pickNorthStar). Compact; "Ver tudo" shows the full text. Editing lives
 * on /goals only.
 */
export function NorthStarCard({ star }: { star: NorthStar }) {
  const [open, setOpen] = useState(false);

  if (isEmptyNorthStar(star)) {
    return (
      <section
        aria-labelledby="north-star-title"
        className="flex flex-col gap-3 rounded-2xl border border-dashed border-white/12 p-5"
      >
        <h2
          id="north-star-title"
          className="font-mono text-[11px] font-normal tracking-[.18em] text-dim"
        >
          {t.northStar.emptyTitle}
        </h2>
        <p className="m-0 text-[14.5px] leading-[1.45] text-muted">
          {t.northStar.emptyText}
        </p>
        <Link
          href="/goals"
          className="flex h-11 items-center self-start rounded-xl border border-white/14 px-4 font-mono text-[11px] font-semibold tracking-[.18em]"
        >
          {t.northStar.emptyCta}
        </Link>
      </section>
    );
  }

  const rows = [
    star.vision && {
      k: "vision",
      label: t.northStar.vision,
      text: star.vision.item.title,
      more: star.vision.item.description,
    },
    star.goal && {
      k: "goal",
      label: t.northStar.goal,
      text: star.goal.item.title,
      more: "",
      proof: star.goal.item.week
        ? t.proof.northWeek(summaryParts(star.goal.item.week).join(" · "))
        : "",
      href: `/goals/${star.goal.item.id}`,
    },
    star.mirror && {
      k: "mirror",
      label: t.northStar.mirror,
      text: star.mirror.item.text,
      more: "",
    },
  ].filter((r) => !!r);
  // Only when something is hidden: a vision description or a long line.
  const expandable = rows.some((r) => r.more || r.text.length > 80);

  return (
    <section
      aria-labelledby="north-star-title"
      data-testid="north-star"
      className="flex flex-col"
    >
      <div className="flex items-center justify-between pb-1">
        <h2
          id="north-star-title"
          className="font-mono text-[11px] font-normal tracking-[.2em]"
        >
          {t.northStar.title}
        </h2>
        <Link
          href="/goals"
          aria-label={t.northStar.manageAria}
          className="flex h-9 items-center font-mono text-[11px] tracking-[.14em] text-dim hover:text-text"
        >
          {t.northStar.manage}
        </Link>
      </div>
      {rows.map((r) => (
        <div
          key={r.k}
          data-testid={`north-star-${r.k}`}
          className={cx(
            "flex flex-col gap-1 border-t border-white/6 py-3",
            r.k === "mirror" && "border-l-2 border-l-white/20 pl-3",
          )}
        >
          <h3 className="m-0 font-mono text-[10px] font-normal tracking-[.16em] text-dim">
            {r.label}
          </h3>
          <p
            className={cx(
              "m-0 text-[15px] leading-[1.4] text-pretty",
              !open && "line-clamp-2",
            )}
          >
            {r.text}
          </p>
          {open && r.more && (
            <p className="m-0 text-[13.5px] leading-[1.5] whitespace-pre-wrap text-muted">
              {r.more}
            </p>
          )}
          {"proof" in r && r.proof && (
            <Link
              href={r.href}
              data-testid="north-star-proof"
              className="self-start font-mono text-[10.5px] tracking-[.08em] text-dim tabular-nums hover:text-text"
            >
              {r.proof}
            </Link>
          )}
        </div>
      ))}
      {expandable && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 items-center self-start font-mono text-[10.5px] tracking-[.14em] text-dim hover:text-text"
        >
          {open ? t.northStar.less : t.northStar.more}
        </button>
      )}
    </section>
  );
}
