"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useApp } from "@/components/app-state";

export function MoreScreen() {
  const { routines, hasPartner, partner } = useApp();
  const rows = [
    {
      href: "/goals",
      label: t.pageTitles.goals,
      sub: t.more.goalsSub,
    },
    {
      href: "/planner",
      label: t.pageTitles.planner,
      sub: t.more.plannerSub,
    },
    {
      href: "/routine",
      label: t.pageTitles.routine,
      sub: t.more.items(routines.length),
    },
    {
      href: "/challenges",
      label: t.pageTitles.challenges,
      sub: hasPartner ? t.more.withPartner : t.more.needsPartner,
    },
    {
      href: "/duo",
      label: t.more.invitePartner,
      sub: hasPartner ? t.more.duoWith(partner.name) : t.more.noPartner,
    },
    {
      href: "/settings",
      label: t.pageTitles.settings,
      sub: t.more.settingsSub,
    },
  ];

  return (
    <div className="flex flex-col gap-[30px] animate-[li-fade-up_.4s_ease]">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        {t.more.title}
      </h1>
      <nav aria-label={t.more.navAria} className="flex flex-col">
        {rows.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex min-h-[60px] items-center justify-between gap-3 border-b border-white/6"
          >
            <span className="text-base">{m.label}</span>
            <span className="flex items-center gap-2.5 text-[13px] text-dim">
              {m.sub}
              <span aria-hidden="true" className="text-faint">
                ›
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
