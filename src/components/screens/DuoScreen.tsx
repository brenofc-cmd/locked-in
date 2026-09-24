"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createDuo, joinDuo, leaveDuo } from "@/app/(app)/actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { Avatar, StatusDot, cx } from "@/components/ui";
import { NETWORK_ERROR } from "@/lib/invite-code";
import { partnerView } from "@/lib/partner";

/**
 * Real duo state (Stage 3): NO DUO -> WAITING FOR PARTNER -> DUO COMPLETE.
 * The partner's presence label is still mock (Stage 5).
 * The creator sees the partner after a refresh; no realtime yet.
 */
export function DuoScreen() {
  const app = useApp();
  const { me, duo } = useSession();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pv = partnerView(app.partner, app.partnerCounts, app.feed, app.now);

  const state = !duo ? "none" : duo.partner ? "complete" : "waiting";
  const inviteCode = duo?.inviteCode ?? "";

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    onError: (m: string) => void,
  ) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) onError(res.error ?? NETWORK_ERROR);
      } catch {
        onError(NETWORK_ERROR);
      }
    });
  }

  function create() {
    run(createDuo, (m) => app.toast({ text: m, sub: "DUO" }));
  }

  function join(e: FormEvent) {
    e.preventDefault();
    setJoinError(null);
    run(
      () => joinDuo(code),
      (m) => setJoinError(m),
    );
  }

  function cancel() {
    run(leaveDuo, (m) => app.toast({ text: m, sub: "DUO" }));
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      app.toast({
        text: "Couldn't copy. The code is on screen.",
        sub: inviteCode,
      });
    }
  }

  async function share() {
    const text = `Join my LOCKED IN duo. Code: ${inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "LOCKED IN", text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
        // Share unavailable in this context: fall back to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      app.toast({ text: "Invite copied.", sub: inviteCode });
    } catch {
      app.toast({
        text: "Couldn't copy. The code is on screen.",
        sub: inviteCode,
      });
    }
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-[30px] animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
          LOCKED IN DUO
        </h1>
        <span className="text-[14.5px] text-muted" data-testid="duo-state">
          {state === "complete"
            ? `You and ${app.partner.name} see each other's day.`
            : state === "waiting"
              ? "Waiting for your partner. Share your code."
              : "Two people. One standard. Invite your partner."}
        </span>
      </header>

      <div className="flex flex-col">
        <div className="flex min-h-[62px] items-center gap-3.5 border-b border-white/5">
          <Avatar
            initial={app.userName.charAt(0).toUpperCase()}
            me
            className="size-9"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[15px]">{app.userName}</span>
            <span className="truncate text-xs text-dim">{me.email}</span>
          </span>
          <span className="font-mono text-[10.5px] text-dim">YOU</span>
        </div>
        {state === "complete" ? (
          <div className="flex min-h-[62px] items-center gap-3.5 border-b border-white/5 animate-[li-rise_.4s_ease]">
            <Avatar initial={app.partner.initial} className="size-9" />
            <span className="flex flex-1 flex-col gap-[3px]">
              <span className="text-[15px]" data-testid="duo-partner-name">
                {app.partner.name}
              </span>
              <span className="text-xs text-dim">Partner</span>
            </span>
            <span
              className={cx(
                "flex items-center gap-[7px] font-mono text-[10.5px] tracking-[.1em]",
                pv.live ? "text-accent" : "text-dim",
              )}
            >
              <StatusDot live={pv.live} size={6} />
              {pv.label}
            </span>
          </div>
        ) : (
          <div className="flex min-h-[62px] items-center gap-3.5 border-b border-white/5">
            <span
              aria-hidden="true"
              className="size-9 rounded-full border border-dashed border-white/20"
            />
            <span className="text-sm text-dim">
              {state === "waiting"
                ? "Waiting for your partner to join."
                : "No partner yet."}
            </span>
          </div>
        )}
      </div>

      {state === "none" && (
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="h-14 rounded-2xl bg-accent font-mono text-[12.5px] font-semibold tracking-[.24em] text-bg active:scale-[.97] disabled:opacity-60"
        >
          {pending ? "CREATING…" : "CREATE DUO"}
        </button>
      )}

      {state === "waiting" && (
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            onClick={share}
            className="h-14 rounded-2xl bg-accent font-mono text-[12.5px] font-semibold tracking-[.24em] text-bg active:scale-[.97]"
          >
            SHARE INVITE
          </button>
          <div className="flex min-h-[52px] items-center justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="font-mono text-[10.5px] tracking-[.14em] text-dim">
                OR SHARE YOUR CODE
              </span>
              <span
                className="font-mono text-[22px] tracking-[.12em]"
                data-testid="invite-code"
              >
                {inviteCode}
              </span>
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="h-11 rounded-xl border border-white/12 px-4 text-[13.5px]"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      )}

      {state === "none" && (
        <form className="flex flex-col gap-2.5" onSubmit={join}>
          <label
            htmlFor="join-code"
            className="font-mono text-[10.5px] tracking-[.14em] text-dim"
          >
            JOIN WITH A CODE
          </label>
          <div className="flex gap-2">
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LKD-XXXXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              aria-invalid={joinError ? true : undefined}
              aria-describedby={joinError ? "join-error" : undefined}
              className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-bg px-3.5 font-mono text-base tracking-[.1em] uppercase outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={pending || !code.trim()}
              className="h-12 rounded-xl border border-white/12 px-[18px] text-sm disabled:opacity-60"
            >
              Join
            </button>
          </div>
          {joinError && (
            <p id="join-error" role="alert" className="text-[13px] text-danger">
              {joinError}
            </p>
          )}
        </form>
      )}

      <span className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-dim">
        Duos are two people. Small squads come later.
        {state === "waiting" && (
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="h-11 text-[12.5px] text-dim underline underline-offset-[3px]"
          >
            Cancel duo
          </button>
        )}
      </span>
    </div>
  );
}
