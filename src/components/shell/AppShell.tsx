"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useApp } from "@/components/app-state";
import {
  FocusIcon,
  PartnerIcon,
  PlanIcon,
  ProgressIcon,
  TodayIcon,
} from "@/components/icons";
import { FocusOverlay } from "@/components/overlays/FocusOverlay";
import { Celebration } from "@/components/overlays/Celebration";
import { MomentOverlays } from "@/components/overlays/MomentOverlays";
import { usePushRuntime } from "@/components/push/PushRuntime";
import { useResumeShell } from "@/components/resume/use-resume";
import { OnboardingScreen } from "@/components/screens/OnboardingScreen";
import { useSession } from "@/components/session";
import { DevPanel } from "@/components/shell/DevPanel";
import { Feedback } from "@/components/shell/Feedback";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { SheetHost } from "@/components/sheets/SheetHost";
import { LogoMark, StatusDot, cx } from "@/components/ui";
import { usePartnerView } from "@/components/use-partner-view";

/**
 * Primary navigation (docs/NAVIGATION.md): five places, the same on the tab
 * bar and the sidebar. PLANEJAR owns the four planning screens; account
 * things live in the profile menu, not in a tab.
 */
const PLAN_ROUTES = ["/plan", "/planner", "/goals", "/routine", "/challenges"];

const TABS = [
  { href: "/today", label: t.pageTitles.today, Icon: TodayIcon },
  { href: "/partner", label: t.pageTitles.partner, Icon: PartnerIcon },
  { href: "/focus", label: t.pageTitles.focus, Icon: FocusIcon },
  { href: "/plan", label: t.pageTitles.plan, Icon: PlanIcon },
  { href: "/progress", label: t.pageTitles.progress, Icon: ProgressIcon },
];

const PLAN_NAV = [
  { href: "/planner", label: t.pageTitles.planner },
  { href: "/goals", label: t.pageTitles.goals },
  { href: "/routine", label: t.pageTitles.routine },
  { href: "/challenges", label: t.pageTitles.challenges },
];

/** "/planner" is not "/plan": match the segment, not the prefix. */
const under = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

function isActive(pathname: string, href: string) {
  return href === "/plan"
    ? PLAN_ROUTES.some((r) => under(pathname, r))
    : under(pathname, href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  // Until onboarding is finished (persisted), it replaces the app (Stage 8).
  const { settings, me } = useSession();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);
  // V2: last route + scroll of this device (after the reset above).
  useResumeShell(me.id, pathname, mainRef);
  // V2 Phase 10: this device's push subscription + notification clicks.
  usePushRuntime();

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg desk:flex-row">
      <DesktopSidebar pathname={pathname} />
      <MobileHeader pathname={pathname} />
      <main
        ref={mainRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <div className="mx-auto max-w-[1120px] px-5 pt-5 pb-7 desk:px-8 desk:pt-9 desk:pb-20 wide:px-12 wide:pt-11 wide:pb-24">
          {settings.onboarded ? children : null}
        </div>
      </main>
      <BottomNav pathname={pathname} />
      {!settings.onboarded && <OnboardingScreen />}
      <FocusOverlay />
      <MomentOverlays />
      <Celebration />
      <SheetHost />
      <Feedback />
      <DevPanel />
    </div>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-line px-3 pt-6 pb-4 desk:flex">
      <Link href="/today" className="flex items-center gap-2.5 px-2.5">
        <LogoMark size="md" />
        <span className="font-mono text-small font-semibold tracking-brand">
          LOCKED IN
        </span>
      </Link>
      <nav aria-label={t.shell.mainNav} className="flex flex-col gap-0.5">
        {TABS.map((n) => {
          const on = isActive(pathname, n.href);
          const here = under(pathname, n.href);
          return (
            <div key={n.href} className="flex flex-col gap-0.5">
              <Link
                href={n.href}
                aria-current={here ? "page" : on ? "true" : undefined}
                className={cx(
                  "flex h-[38px] items-center gap-3 rounded-xl px-2.5 text-body hover:text-text",
                  on ? "bg-chip text-text" : "text-muted",
                )}
              >
                <span className="flex-1">{n.label}</span>
                <span
                  aria-hidden="true"
                  className={cx("size-[5px] rounded-full", on && "bg-accent")}
                />
              </Link>
              {n.href === "/plan" && (
                <ul
                  aria-label={t.shell.planNav}
                  className="m-0 flex list-none flex-col gap-0.5 p-0 pl-3"
                >
                  {PLAN_NAV.map((p) => {
                    const sub = under(pathname, p.href);
                    return (
                      <li key={p.href}>
                        <Link
                          href={p.href}
                          aria-current={sub ? "page" : undefined}
                          className={cx(
                            "flex h-[32px] items-center rounded-lg px-2.5 text-small hover:text-text",
                            sub ? "text-text" : "text-dim",
                          )}
                        >
                          {p.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <ProfileMenu key={pathname} pathname={pathname} variant="sidebar" />
      </div>
    </aside>
  );
}

function MobileHeader({ pathname }: { pathname: string }) {
  const { hasPartner, partner } = useApp();
  const pv = usePartnerView();
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between bg-bg px-5 desk:hidden">
      <Link
        href="/today"
        className="flex items-center gap-2"
        aria-label={t.shell.homeAria}
      >
        <LogoMark />
        <span className="font-mono text-meta font-semibold tracking-brand">
          LOCKED IN
        </span>
      </Link>
      <div className="flex items-center gap-2.5">
        {hasPartner && (
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
            className="flex h-9 items-center gap-2 rounded-full border border-line px-3 text-small text-muted"
          >
            <StatusDot live={pv.live} pulse={pv.pulse} />
            {partner.name}
            <span className="text-text tabular-nums">{pv.pct}%</span>
          </Link>
        )}
        <ProfileMenu key={pathname} pathname={pathname} variant="header" />
      </div>
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label={t.shell.tabsNav}
      className="flex shrink-0 border-t border-line bg-bg px-1.5 pt-1 pb-[env(safe-area-inset-bottom)] desk:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const on = isActive(pathname, href);
        const isFocus = href === "/focus";
        return (
          <Link
            key={href}
            href={href}
            aria-current={
              under(pathname, href) ? "page" : on ? "true" : undefined
            }
            className={cx(
              "flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-[color,transform] duration-150 active:scale-[.94]",
              on ? "text-text" : "text-dim",
            )}
          >
            <span
              className={cx(
                "flex h-7 items-center justify-center rounded-xl px-3.5 transition-colors duration-200",
                // FOCO keeps its green icon as identity, but only the
                // current tab gets a filled pill (one "you are here").
                isFocus
                  ? on
                    ? "bg-accent text-bg"
                    : "text-accent"
                  : on
                    ? "bg-selected"
                    : "bg-transparent",
              )}
            >
              <Icon />
            </span>
            <span
              className={cx(
                "text-meta tracking-normal",
                on ? "font-semibold" : "font-medium",
              )}
            >
              {label.toUpperCase()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
