"use client";

import { useState } from "react";
import { useApp } from "@/components/app-state";
import { Avatar, StatusDot, cx } from "@/components/ui";
import { mockUser } from "@/lib/mock-data";
import { partnerView } from "@/lib/partner";

export function DuoScreen() {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const pv = partnerView(app.partner, app.partnerTasks, app.feed, app.now);

  async function copyCode() {
    try {
      await navigator.clipboard?.writeText(mockUser.inviteCode);
    } catch {
      // Clipboard can be blocked; the code stays visible on screen.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function share() {
    const text = `Join my LOCKED IN duo. Code: ${mockUser.inviteCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "LOCKED IN", text });
        return;
      }
      await navigator.clipboard?.writeText(text);
    } catch {
      return; // cancelled or blocked
    }
    app.toast({ text: "Invite copied.", sub: mockUser.inviteCode });
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-[30px] animate-[li-fade-up_.4s_ease]">
      <header className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
          LOCKED IN DUO
        </h1>
        <span className="text-[14.5px] text-muted">
          {app.hasPartner
            ? `You and ${app.partner.name} see each other's day.`
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
          <span className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[15px]">{app.userName}</span>
            <span className="text-xs text-dim">{mockUser.handle}</span>
          </span>
          <span className="font-mono text-[10.5px] text-dim">YOU</span>
        </div>
        {app.hasPartner ? (
          <div className="flex min-h-[62px] items-center gap-3.5 border-b border-white/5 animate-[li-rise_.4s_ease]">
            <Avatar initial={app.partner.initial} className="size-9" />
            <span className="flex flex-1 flex-col gap-[3px]">
              <span className="text-[15px]">{app.partner.name}</span>
              <span className="text-xs text-dim">{app.partner.handle}</span>
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
              Waiting for your partner to join.
            </span>
          </div>
        )}
      </div>
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
            <span className="font-mono text-[22px] tracking-[.12em]">
              {mockUser.inviteCode}
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
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          app.toast({
            text: "Joining a duo arrives with accounts.",
            sub: "STAGE 3",
          });
        }}
      >
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
            placeholder="LKD-XXXXX"
            autoCapitalize="characters"
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-bg px-3.5 font-mono text-base tracking-[.1em] uppercase outline-none focus:border-white/30"
          />
          <button
            type="submit"
            className="h-12 rounded-xl border border-white/12 px-[18px] text-sm"
          >
            Join
          </button>
        </div>
      </form>
      <span className="text-[12.5px] text-dim">
        Duos are two people. Small squads come later.
      </span>
    </div>
  );
}
