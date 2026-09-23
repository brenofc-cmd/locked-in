"use client";

import Link from "next/link";
import { useApp } from "@/components/app-state";

export function MoreScreen() {
  const { tasks, challenges, hasPartner, partner } = useApp();
  const rows = [
    {
      href: "/routine",
      label: "Routine",
      sub: `${tasks.filter((t) => !t.once).length} items`,
    },
    {
      href: "/challenges",
      label: "Challenges",
      sub: `${challenges.length} active`,
    },
    {
      href: "/duo",
      label: "Invite partner",
      sub: hasPartner ? `Duo with ${partner.name}` : "No partner yet",
    },
    { href: "/settings", label: "Settings", sub: "Standard, notifications" },
  ];

  return (
    <div className="flex flex-col gap-[30px] animate-[li-fade-up_.4s_ease]">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        MORE
      </h1>
      <nav aria-label="More" className="flex flex-col">
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
