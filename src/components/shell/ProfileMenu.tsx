"use client";

import { t } from "@/i18n/pt-BR";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { Avatar, cx } from "@/components/ui";
import { useInstallPrompt } from "@/components/use-install-prompt";
import { clearResume } from "@/lib/resume-state";

/**
 * The profile menu (docs/NAVIGATION.md): account things that are not a tab.
 * A disclosure button: Escape or a click outside closes it and returns focus
 * to the button; ↑ / ↓ move between the items. Sign-out is the same form as
 * Settings (it keeps calling clearResume()).
 */
export function ProfileMenu({
  pathname,
  variant,
}: {
  pathname: string;
  variant: "header" | "sidebar";
}) {
  const { userName } = useApp();
  const { me } = useSession();
  const install = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = ["/settings", "/duo"].some((p) => pathname.startsWith(p));
  const initial = userName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
  }

  const item =
    "flex min-h-11 w-full items-center px-4 text-left text-[14px] hover:bg-white/5 focus-visible:bg-white/5";
  const links = [
    { href: "/settings#conta", label: t.shell.account },
    { href: "/settings", label: t.shell.settings },
    { href: "/duo", label: t.shell.duo },
  ];

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t.shell.profileAria(userName)}
        data-testid="profile-button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex items-center gap-2.5 rounded-full",
          variant === "header"
            ? "size-9 justify-center"
            : "h-11 w-full rounded-[10px] px-2.5 hover:bg-white/4",
          active && variant === "sidebar" && "bg-chip",
        )}
      >
        <Avatar
          initial={initial}
          me
          className={cx(
            "size-7 text-xs",
            active && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
          )}
        />
        {variant === "sidebar" && (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="truncate text-[13px]">{userName}</span>
            <span className="font-mono text-[10px] tracking-[.1em] text-dim">
              {t.shell.duoFooter}
            </span>
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="profile-menu"
          className={cx(
            "absolute z-30 flex w-[232px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141416] py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.55)]",
            variant === "header"
              ? "top-[calc(100%+8px)] right-0"
              : "bottom-[calc(100%+8px)] left-0",
          )}
        >
          <span className="flex flex-col gap-0.5 border-b border-white/7 px-4 pt-2 pb-3">
            <span className="truncate text-[14px]">{userName}</span>
            <span className="truncate text-[12px] text-dim">{me.email}</span>
          </span>
          <nav aria-label={t.shell.profile} className="flex flex-col pt-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-menu-item
                onClick={() => setOpen(false)}
                className={item}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {install && (
            <button
              type="button"
              data-menu-item
              onClick={() => {
                setOpen(false);
                void install();
              }}
              className={item}
            >
              {t.shell.install}
            </button>
          )}
          <form
            action="/auth/signout"
            method="post"
            onSubmit={() => clearResume(me.id)}
            className="mt-1 border-t border-white/7 pt-1"
          >
            <button
              type="submit"
              data-menu-item
              className={cx(item, "text-muted")}
            >
              {t.shell.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
