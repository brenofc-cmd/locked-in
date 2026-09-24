"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useApp } from "@/components/app-state";
import {
  FocusIcon,
  MoreIcon,
  PartnerIcon,
  ProgressIcon,
  TodayIcon,
} from "@/components/icons";
import { FocusOverlay } from "@/components/overlays/FocusOverlay";
import { MomentOverlays } from "@/components/overlays/MomentOverlays";
import { DevPanel } from "@/components/shell/DevPanel";
import { Feedback } from "@/components/shell/Feedback";
import { SheetHost } from "@/components/sheets/SheetHost";
import { Avatar, LogoMark, StatusDot, cx } from "@/components/ui";
import { partnerView } from "@/lib/partner";

const MAIN_NAV = [
  { href: "/today", label: "Today" },
  { href: "/partner", label: "Partner" },
  { href: "/focus", label: "Focus" },
  { href: "/progress", label: "Progress" },
];

const SUB_NAV = [
  { href: "/routine", label: "Routine" },
  { href: "/challenges", label: "Challenges" },
  { href: "/duo", label: "Duo" },
  { href: "/settings", label: "Settings" },
];

const TABS = [
  { href: "/today", label: "TODAY", Icon: TodayIcon },
  { href: "/partner", label: "PARTNER", Icon: PartnerIcon },
  { href: "/focus", label: "FOCUS", Icon: FocusIcon },
  { href: "/progress", label: "PROGRESS", Icon: ProgressIcon },
  { href: "/more", label: "MORE", Icon: MoreIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg desk:flex-row">
      <DesktopSidebar pathname={pathname} />
      <MobileHeader />
      <main
        ref={mainRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <div className="mx-auto max-w-[1120px] px-[18px] pt-5 pb-7 desk:px-8 desk:pt-9 desk:pb-20 wide:px-[52px] wide:pt-11 wide:pb-24">
          {children}
        </div>
      </main>
      <BottomNav pathname={pathname} />
      <FocusOverlay />
      <MomentOverlays />
      <SheetHost />
      <Feedback />
      <DevPanel />
    </div>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  const { userName } = useApp();
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col gap-[26px] overflow-y-auto border-r border-white/6 px-3 pt-6 pb-4 desk:flex">
      <Link href="/today" className="flex items-center gap-2.5 px-2.5">
        <LogoMark size="md" />
        <span className="font-mono text-xs font-semibold tracking-[.24em]">
          LOCKED IN
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {MAIN_NAV.map((n) => {
          const on = pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex h-[38px] items-center gap-3 rounded-[9px] px-2.5 text-sm hover:text-text",
                on ? "bg-chip text-text" : "text-muted",
              )}
            >
              <span className="flex-1">{n.label}</span>
              <span
                aria-hidden="true"
                className={cx("size-[5px] rounded-full", on && "bg-accent")}
              />
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Secondary" className="flex flex-col gap-0.5">
        {SUB_NAV.map((n) => {
          const on = pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex h-[34px] items-center rounded-lg px-2.5 text-[13px] hover:text-text",
                on ? "bg-chip text-text" : "text-muted",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 border-t border-white/6 px-2.5 pt-3.5">
        <Avatar
          initial={userName.charAt(0).toUpperCase()}
          me
          className="size-7 text-xs"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px]">{userName}</span>
          <span className="font-mono text-[10px] tracking-[.1em] text-dim">
            LOCKED IN DUO
          </span>
        </span>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { hasPartner, partner, partnerCounts, feed, now } = useApp();
  const pv = partnerView(partner, partnerCounts, feed, now);
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between bg-bg px-[18px] desk:hidden">
      <Link
        href="/today"
        className="flex items-center gap-[9px]"
        aria-label="LOCKED IN, Today"
      >
        <LogoMark />
        <span className="font-mono text-[11.5px] font-semibold tracking-[.24em]">
          LOCKED IN
        </span>
      </Link>
      {hasPartner && (
        <Link
          href="/partner"
          aria-label={`${partner.name} is ${pv.focusWord.toLowerCase()}, ${pv.pct}% done today`}
          className="flex h-9 items-center gap-2 rounded-full border border-white/8 px-3 text-[12.5px] text-muted"
        >
          <StatusDot live={pv.live} pulse={pv.pulse} />
          {partner.name}
          <span className="text-text tabular-nums">{pv.pct}%</span>
        </Link>
      )}
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const mainTabs = ["/today", "/partner", "/focus", "/progress"];
  return (
    <nav
      aria-label="Tabs"
      className="flex shrink-0 border-t border-white/6 bg-bg px-1.5 pt-1 pb-[env(safe-area-inset-bottom)] desk:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const on =
          href === "/more"
            ? !mainTabs.some((t) => pathname.startsWith(t))
            : pathname.startsWith(href);
        const isFocus = href === "/focus";
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex h-[58px] flex-1 flex-col items-center justify-center gap-[5px] transition-[color,transform] duration-200 active:scale-[.92]",
              on ? "text-text" : "text-quiet",
            )}
          >
            <span
              className={cx(
                "flex h-7 items-center justify-center rounded-[10px] px-3.5 transition-colors duration-200",
                isFocus
                  ? on
                    ? "bg-accent text-bg"
                    : "bg-accent-tab text-accent"
                  : on
                    ? "bg-white/8"
                    : "bg-transparent",
              )}
            >
              <Icon />
            </span>
            <span
              className={cx(
                "text-[10px] tracking-[.08em]",
                on ? "font-semibold" : "font-medium",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
