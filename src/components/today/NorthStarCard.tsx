"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useId, useState } from "react";
import { cx } from "@/components/ui";
import { summaryParts } from "@/lib/goal-proof";
import { isEmptyNorthStar, type NorthStar } from "@/lib/north-star";

/**
 * LEMBRE-SE DO PORQUÊ (V2 Phase 4): one vision, the current goal and one
 * mirror item — exactly as the user wrote them (featured, else the fallback
 * of pickNorthStar). On Today it is one discreet line (docs/NAVIGATION.md);
 * opening it shows the three items, the goal's proof and the link to /goals.
 * Editing lives on /goals only.
 */
export function NorthStarCard({ star }: { star: NorthStar }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (isEmptyNorthStar(star)) {
    return (
      <Link
        href="/goals"
        data-testid="north-star-empty"
        aria-label={`${t.northStar.emptyTitle}. ${t.northStar.emptyCta}`}
        className={line}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className={label}>
            <span aria-hidden="true">◇ </span>
            {t.northStar.emptyTitle}
          </span>
          <span className="truncate text-[13.5px] text-muted">
            {t.northStar.emptyText}
          </span>
        </span>
        <span aria-hidden="true" className="text-faint">
          ›
        </span>
      </Link>
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

  return (
    <section
      aria-labelledby="north-star-title"
      data-testid="north-star"
      className="flex flex-col"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={line}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span id="north-star-title" className={label}>
            <span aria-hidden="true">◇ </span>
            {t.northStar.title}
          </span>
          {!open && (
            <span className="truncate text-[14px] text-muted">
              {rows[0]?.text}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            "text-faint transition-transform duration-200",
            open && "rotate-90",
          )}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId} className="flex flex-col">
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
              <p className="m-0 text-[15px] leading-[1.4] text-pretty">
                {r.text}
              </p>
              {r.more && (
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
          <Link
            href="/goals"
            aria-label={t.northStar.manageAria}
            className="flex h-10 items-center self-start font-mono text-[11px] tracking-[.14em] text-dim hover:text-text"
          >
            {t.northStar.manage}
          </Link>
        </div>
      )}
    </section>
  );
}

const line =
  "flex min-h-[56px] w-full items-center justify-between gap-3 border-t border-white/6 py-2.5 text-left";
const label = "font-mono text-[10.5px] tracking-[.18em] text-dim";
