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
        // scroll-padding keeps a focused row clear of the floating nav and
        // the pinned action bar above it (WCAG 2.4.11, V3: 200 px on a
        // phone), and of the sticky bar up to `wide`.
        className="min-h-0 min-w-0 flex-1 scroll-pb-[200px] overflow-x-hidden overflow-y-auto desk:scroll-pb-28 wide:scroll-pb-0"
      >
        {/* Tablets (below `desk`) keep a phone-like measure instead of
            stretching rows edge to edge; desktop gets the full 1120. */}
        {/* The bottom padding on a phone clears the floating nav (V3). */}
        <div className="mx-auto max-w-2xl px-5 pt-3 pb-[calc(112px+env(safe-area-inset-bottom))] desk:max-w-[1120px] desk:px-8 desk:pt-9 desk:pb-20 wide:px-12 wide:pt-11 wide:pb-24">
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
        <span className="font-mono text-meta font-semibold tracking-brand">
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
                  "flex h-10 items-center gap-3 rounded-xl px-2.5 text-body hover:text-text",
                  on ? "bg-raised font-semibold text-text" : "text-muted",
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
        className="flex h-11 items-center gap-[9px]"
        aria-label={t.shell.homeAria}
      >
        <LogoMark />
        {/* Under 360 px the chip and avatar need the room (V3). */}
        <span className="font-mono text-meta font-semibold tracking-brand whitespace-nowrap max-[359px]:hidden">
          LOCKED IN
        </span>
      </Link>
      <div className="flex min-w-0 items-center gap-2">
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
            className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-line-strong px-3 text-small whitespace-nowrap text-muted"
          >
            <StatusDot live={pv.live} pulse={pv.pulse} />
            <span className="truncate">{partner.name}</span>
            <span className="text-text tabular-nums">{pv.pct}%</span>
          </Link>
        )}
        <ProfileMenu key={pathname} pathname={pathname} variant="header" />
      </div>
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  // V3: a floating bar over the content (10 px from the sides, 26 px above
  // the safe area). Active = a filled pill + weight 800; FOCO keeps its lime
  // icon as identity. Condensed caps (82 %) fit PROGRESSO at 320 px.
  return (
    <nav
      aria-label={t.shell.tabsNav}
      className="absolute inset-x-2.5 bottom-[calc(26px+env(safe-area-inset-bottom))] z-[6] mx-auto flex h-16 max-w-[652px] gap-0.5 rounded-[22px] border border-line bg-card p-[5px] shadow-[0_14px_34px_rgb(0_0_0/0.5)] desk:hidden"
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
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[17px] transition-[background-color,color,transform] duration-200 active:scale-[.94]",
              on && "bg-raised",
              isFocus ? "text-accent" : on ? "text-text" : "text-dim",
            )}
          >
            <Icon />
            <span
              className={cx(
                "text-tab tracking-[0.04em] [font-stretch:82%]",
                on ? "font-extrabold" : "font-semibold",
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
