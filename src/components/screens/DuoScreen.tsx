"use client";

import { LOCALE, t } from "@/i18n/pt-BR";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createDuo, joinDuo, leaveDuo } from "@/app/(app)/actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { Avatar, StatusDot, cx } from "@/components/ui";
import { NETWORK_ERROR } from "@/lib/invite-code";
import { usePartnerView } from "@/components/use-partner-view";

/**
 * Duo management (Stages 3, 5, 8): NO DUO -> WAITING FOR PARTNER -> ACTIVE.
 * The waiting creator sees the partner arrive live (duo_joined broadcast).
 * Leaving ends the duo for both members (atomic in the database, ADR-016);
 * the partner's app leaves the duo live (duo_ended broadcast). Personal
 * data stays; the duo's feed, reactions and challenges go with it.
 */
const since = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString(LOCALE, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export function DuoScreen() {
  const app = useApp();
  const { me, duo } = useSession();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveButton = useRef<HTMLButtonElement>(null);
  // Cancel returns focus to the button that opened the confirmation.
  const keepDuo = () => {
    setConfirmLeave(false);
    requestAnimationFrame(() => leaveButton.current?.focus());
  };
  const pv = usePartnerView();

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
    run(createDuo, (m) => app.toast({ text: m, sub: t.duoScreen.toastSub }));
  }

  function join(e: FormEvent) {
    e.preventDefault();
    setJoinError(null);
    run(
      () => joinDuo(code),
      (m) => setJoinError(m),
    );
  }

  function leave() {
    run(
      async () => {
        const res = await leaveDuo();
        if (res.ok) {
          setConfirmLeave(false);
          app.toast({ text: t.duoScreen.ended, sub: t.duoScreen.endedSub });
        }
        return res;
      },
      (m) => app.toast({ text: m, sub: t.duoScreen.toastSub }),
    );
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      app.toast({
        text: t.duoScreen.copyFailed,
        sub: inviteCode,
      });
    }
  }

  async function share() {
    const text = t.duoScreen.shareText(inviteCode);
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
      app.toast({ text: t.duoScreen.inviteCopied, sub: inviteCode });
    } catch {
      app.toast({
        text: t.duoScreen.copyFailed,
        sub: inviteCode,
      });
    }
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-8 animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-col gap-2.5">
        <h1 className="page-title">{t.duoScreen.title}</h1>
        <span className="text-body text-muted" data-testid="duo-state">
          {state === "complete"
            ? t.duoScreen.stateComplete(app.partner.name)
            : state === "waiting"
              ? t.duoScreen.stateWaiting
              : t.duoScreen.stateNone}
        </span>
      </header>

      <div className="flex flex-col">
        <div className="flex min-h-[62px] items-center gap-3.5 border-b border-line">
          <Avatar
            initial={app.userName.charAt(0).toUpperCase()}
            me
            className="size-9"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-body">{app.userName}</span>
            <span className="truncate text-small text-dim">{me.email}</span>
          </span>
          <span className="font-mono text-meta text-dim">
            {t.duoScreen.you}
          </span>
        </div>
        {state === "complete" ? (
          <div className="flex min-h-[62px] items-center gap-3.5 border-b border-line animate-[li-rise_.4s_ease]">
            <Avatar initial={app.partner.initial} className="size-9" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-body" data-testid="duo-partner-name">
                {app.partner.name}
              </span>
              <span className="text-num-heros text-dim" data-testid="duo-since">
                {t.duoScreen.together(since(duo?.partner?.joinedAt ?? ""))}
              </span>
            </span>
            <span
              className={cx(
                "flex items-center gap-2 font-mono text-meta tracking-meta",
                pv.live ? "text-accent" : "text-dim",
              )}
            >
              <StatusDot live={pv.live} size={6} />
              {pv.seen ? pv.seen.toUpperCase() : pv.label}
            </span>
          </div>
        ) : (
          <div className="flex min-h-[62px] items-center gap-3.5 border-b border-line">
            <span
              aria-hidden="true"
              className="size-9 rounded-full border border-dashed border-line-bold"
            />
            <span className="text-body text-dim">
              {state === "waiting"
                ? t.duoScreen.waitingJoin
                : t.duoScreen.noPartner}
            </span>
          </div>
        )}
      </div>

      {state === "none" && (
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="h-[58px] rounded-2xl btn-primary font-mono text-small font-bold tracking-[0.2em] disabled:opacity-60"
        >
          {pending ? t.duoScreen.creating : t.duoScreen.createDuo}
        </button>
      )}

      {state === "waiting" && (
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            onClick={share}
            className="h-[58px] rounded-2xl btn-primary font-mono text-small font-bold tracking-[0.2em]"
          >
            {t.duoScreen.shareInvite}
          </button>
          <div className="flex min-h-[52px] items-center justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="font-mono text-meta tracking-eyebrow text-dim">
                {t.duoScreen.orShareCode}
              </span>
              <span
                className="font-mono text-title tracking-meta"
                data-testid="invite-code"
              >
                {inviteCode}
              </span>
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold"
            >
              {copied ? t.duoScreen.copied : t.duoScreen.copyCode}
            </button>
          </div>
        </div>
      )}

      {state === "none" && (
        <form className="flex flex-col gap-2.5" onSubmit={join}>
          <label
            htmlFor="join-code"
            className="font-mono text-meta tracking-eyebrow text-dim"
          >
            {t.duoScreen.joinWithCode}
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
              className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 font-mono text-base tracking-meta uppercase outline-none focus:border-line-bold"
            />
            <button
              type="submit"
              disabled={pending || !code.trim()}
              className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-60"
            >
              {t.duoScreen.join}
            </button>
          </div>
          {joinError && (
            <p id="join-error" role="alert" className="text-small text-danger">
              {joinError}
            </p>
          )}
        </form>
      )}

      {state === "complete" && (
        <div className="flex flex-col gap-1 border-b border-line pb-4">
          <span className="font-mono text-meta tracking-eyebrow text-dim">
            {t.duoScreen.duoCode}
          </span>
          <span className="font-mono text-base tracking-meta">
            {inviteCode}
          </span>
        </div>
      )}

      {state !== "none" && !confirmLeave && (
        <button
          ref={leaveButton}
          type="button"
          onClick={() => setConfirmLeave(true)}
          className="h-11 self-start rounded-xl border border-danger/30 px-5 text-body text-danger"
        >
          {state === "waiting" ? t.duoScreen.cancelDuo : t.duoScreen.leaveDuo}
        </button>
      )}
      {confirmLeave && (
        <div
          role="alertdialog"
          aria-labelledby="leave-title"
          aria-describedby="leave-desc"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) keepDuo();
          }}
          className="flex flex-col gap-3.5 rounded-2xl border border-danger/30 p-5"
        >
          <span id="leave-title" className="text-body font-medium">
            {state === "waiting" ? t.duoScreen.cancelQ : t.duoScreen.endQ}
          </span>
          <span id="leave-desc" className="text-small leading-[1.5] text-muted">
            {t.duoScreen.leaveDesc}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={leave}
              disabled={pending}
              className="h-11 rounded-xl bg-danger px-5 text-body font-medium text-bg disabled:opacity-60"
            >
              {pending ? t.duoScreen.ending : t.duoScreen.endBoth}
            </button>
            <button
              type="button"
              onClick={keepDuo}
              disabled={pending}
              // The safe choice gets focus when the confirmation opens.
              autoFocus
              className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold"
            >
              {t.duoScreen.keep}
            </button>
          </div>
        </div>
      )}

      <span className="text-small text-dim">{t.duoScreen.footnote}</span>
    </div>
  );
}
