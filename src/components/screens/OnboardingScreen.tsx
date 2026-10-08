"use client";

import { t } from "@/i18n/pt-BR";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createDuo, joinDuo } from "@/app/(app)/actions";
import { completeOnboarding } from "@/app/(app)/settings-actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
import { LogoMark, MiniCheck, chipTone, cx } from "@/components/ui";
import { Rook } from "@/components/brand/Rook";
import { NETWORK_ERROR } from "@/lib/invite-code";
import { onboardingStart, type OnboardingStep } from "@/lib/onboarding";
import {
  ROUTINE_TEMPLATES,
  TEMPLATE_NAMES,
  templateCategory,
} from "@/lib/routine-templates";
import { setMark } from "@/lib/resume-state";

const PATHS = [
  {
    id: "template",
    label: t.onboarding.pathTemplate,
    sub: t.onboarding.pathTemplateSub,
  },
  {
    id: "scratch",
    label: t.onboarding.pathScratch,
    sub: t.onboarding.pathScratchSub,
  },
] as const;

/**
 * Onboarding (Stage 8, real): Welcome → Name → Routine path → Items → Duo.
 * Shown instead of the app until user_settings.onboarding_completed_at is
 * set. The name is saved to the profile, the items become routine items when
 * leaving the items step (so an interrupted onboarding resumes at the duo
 * step), the duo step creates or joins a real duo — or is skipped ("Do this
 * later": LOCKED IN works alone). Identity is always auth.uid() on the server.
 */
export function OnboardingScreen() {
  const app = useApp();
  const { duo, me } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(
    () =>
      onboardingStart({
        completed: false,
        hasRoutine: app.routines.length > 0,
      }) ?? 0,
  );
  const [name, setName] = useState(app.userName);
  const [path, setPath] = useState<(typeof PATHS)[number]["id"]>("template");
  const [tpl, setTpl] = useState(TEMPLATE_NAMES[0]);
  const [items, setItems] = useState<{ name: string; on: boolean }[]>(() =>
    ROUTINE_TEMPLATES[TEMPLATE_NAMES[0]].map((i) => ({
      name: i.name,
      on: true,
    })),
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [duoError, setDuoError] = useState<string | null>(null);
  const [duoPending, startDuo] = useTransition();

  async function saveItems() {
    const chosen = items
      .filter((i) => i.on)
      .map((i) => ({ name: i.name, category: templateCategory(tpl, i.name) }));
    if (chosen.length === 0) return true;
    return app.applyTemplate(chosen, app.settings.shareNewTasks);
  }

  async function finish() {
    setBusy(true);
    const res = await completeOnboarding().catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      app.toast({
        text: res && !res.ok ? res.error : NETWORK_ERROR,
        sub: t.onboarding.toastSub,
      });
      return;
    }
    // Just set up: nothing to brief today (the briefing starts tomorrow).
    setMark(me.id, "briefing", app.today);
    router.replace("/today");
  }

  async function next() {
    if (busy) return;
    if (step === 1) {
      if (!name.trim()) return;
      if (name.trim() !== app.userName) {
        setBusy(true);
        await app.setUserName(name.trim());
        setBusy(false);
      }
    }
    if (step === 2 && path === "scratch") setItems([]);
    if (step === 3) {
      setBusy(true);
      const ok = await saveItems();
      setBusy(false);
      if (!ok) return;
    }
    if (step === 4) return finish();
    setStep((s) => (s + 1) as OnboardingStep);
  }

  function pickTemplate(name: string) {
    setTpl(name);
    setItems(ROUTINE_TEMPLATES[name].map((i) => ({ name: i.name, on: true })));
  }

  function addDraft() {
    if (!draft.trim()) return;
    setItems((list) => [
      ...list,
      { name: draft.trim().slice(0, 80), on: true },
    ]);
    setDraft("");
  }

  function create() {
    setDuoError(null);
    startDuo(async () => {
      const res = await createDuo().catch(() => null);
      if (!res?.ok) setDuoError(res && !res.ok ? res.error : NETWORK_ERROR);
    });
  }

  function join(e: FormEvent) {
    e.preventDefault();
    setDuoError(null);
    startDuo(async () => {
      const res = await joinDuo(code).catch(() => null);
      if (!res?.ok) setDuoError(res && !res.ok ? res.error : NETWORK_ERROR);
    });
  }

  const cta = t.onboarding.ctas[step];
  const ctaDisabled = busy || (step === 1 && !name.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.onboarding.dialogAria}
      className="absolute inset-0 z-[60] overflow-y-auto bg-overlay animate-[li-fade-in_.5s_ease]"
    >
      <div className="mx-auto flex min-h-full max-w-[440px] flex-col justify-between gap-9 px-6 pt-12 pb-8 desk:px-8 desk:py-16">
        <div className="flex min-h-11 items-center justify-between">
          <div
            className="flex gap-1.5"
            aria-label={t.onboarding.stepAria(step + 1, 5)}
            role="img"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cx(
                  "h-1 rounded-sm transition-all duration-300",
                  i === step
                    ? "w-[22px] bg-text"
                    : i < step
                      ? "w-2 bg-muted"
                      : "w-2 bg-white/12",
                )}
              />
            ))}
          </div>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as OnboardingStep)}
              className="h-11 px-1 text-body text-dim"
            >
              {t.onboarding.back}
            </button>
          )}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-6 animate-[li-rise_.4s_ease]">
            <span className="flex items-end justify-between">
              <LogoMark size="lg" />
              <span className="motion-safe:animate-[li-rook-land_.7s_var(--ease-settle)_.25s_both]">
                <Rook pose="ready" size={112} />
              </span>
            </span>
            <h1 className="text-display leading-none font-semibold tracking-meta">
              LOCKED IN
            </h1>
            <span className="font-mono text-small leading-[1.8] tracking-brand text-dim">
              {t.app.taglineLines[0]}
              <br />
              {t.app.taglineLines[1]}
            </span>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-5 animate-[li-rise_.4s_ease]">
            <label
              htmlFor="ob-name"
              className="font-mono text-meta tracking-eyebrow text-dim"
            >
              {t.onboarding.yourName}
            </label>
            <input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void next()}
              maxLength={40}
              autoComplete="given-name"
              className="h-[60px] rounded-2xl border border-line-strong bg-field px-5 text-title outline-none focus:border-line-bold"
            />
            <span className="text-small text-dim">{t.onboarding.nameHint}</span>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-5 animate-[li-rise_.4s_ease]">
            <h1 className="text-heading leading-[1.2] cond font-bold">
              {t.onboarding.buildLines[0]}
              <br />
              {t.onboarding.buildLines[1]}
            </h1>
            <div
              role="radiogroup"
              aria-label={t.onboarding.howToStart}
              className="flex flex-col gap-5"
            >
              {PATHS.map((p) => {
                const on = path === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPath(p.id)}
                    className={cx(
                      "flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border px-5 text-left transition-all duration-150",
                      on
                        ? "border-accent-line bg-accent-soft"
                        : "border-line-strong",
                    )}
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-lead font-medium">{p.label}</span>
                      <span className="text-small text-dim">{p.sub}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cx(
                        "flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                        on ? "border-accent" : "border-line-bold",
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full bg-accent transition-transform duration-200"
                        style={{ transform: on ? "scale(1)" : "scale(0)" }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="flex flex-col gap-4 animate-[li-rise_.4s_ease]">
            <h1 className="text-heading leading-[1.2] cond font-bold">
              {path === "template"
                ? t.onboarding.pickItems
                : t.onboarding.addItems}
            </h1>
            {path === "template" && (
              <div
                role="radiogroup"
                aria-label={t.onboarding.templateAria}
                className="flex flex-wrap gap-1.5"
              >
                {TEMPLATE_NAMES.map((tplName) => (
                  <button
                    key={tplName}
                    type="button"
                    role="radio"
                    aria-checked={tpl === tplName}
                    onClick={() => pickTemplate(tplName)}
                    className={cx(
                      "h-10 rounded-xl border px-3.5 text-body",
                      chipTone(tpl === tplName),
                    )}
                  >
                    {tplName}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col">
              {items.map((it, i) => (
                <div
                  key={it.name + i}
                  className="flex min-h-[54px] items-center gap-3 border-b border-line"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={it.on}
                    aria-label={it.name}
                    onClick={() =>
                      setItems((list) =>
                        list.map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
                      )
                    }
                    className="flex size-11 shrink-0 items-center justify-center"
                  >
                    <MiniCheck done={it.on} size={24} radius={7} />
                  </button>
                  <span
                    className={cx(
                      "text-body",
                      it.on ? "text-text" : "text-dim",
                    )}
                  >
                    {it.name}
                  </span>
                </div>
              ))}
              <div className="flex gap-2 pt-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraft();
                    }
                  }}
                  placeholder={t.onboarding.addOwn}
                  aria-label={t.onboarding.addItemAria}
                  className="h-[54px] min-w-0 flex-1 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-base outline-none"
                />
                <button
                  type="button"
                  onClick={addDraft}
                  aria-label={t.onboarding.addAria}
                  className="size-12 rounded-xl border border-line-strong text-title"
                >
                  +
                </button>
              </div>
            </div>
            <span className="text-small text-dim">
              {t.onboarding.repeatsDaily}
            </span>
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col gap-5 animate-[li-rise_.4s_ease]">
            <h1 className="text-heading leading-[1.2] cond font-bold">
              {
                (duo?.partner
                  ? t.onboarding.duoReadyLines
                  : t.onboarding.inviteLines)[0]
              }
              <br />
              {
                (duo?.partner
                  ? t.onboarding.duoReadyLines
                  : t.onboarding.inviteLines)[1]
              }
            </h1>
            <span className="text-base leading-[1.5] text-pretty text-muted">
              {t.onboarding.pitch}
            </span>
            {duo?.partner ? (
              <span className="text-body" data-testid="onboarding-partner">
                {t.onboarding.partnerReady(duo.partner.displayName)}
              </span>
            ) : duo ? (
              <div className="flex flex-col gap-1 border-y border-line py-4">
                <span className="font-mono text-meta tracking-eyebrow text-dim">
                  {t.onboarding.yourCode}
                </span>
                <span
                  className="font-mono text-title tracking-meta"
                  data-testid="onboarding-code"
                >
                  {duo.inviteCode}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                <button
                  type="button"
                  onClick={create}
                  disabled={duoPending}
                  className="h-14 rounded-2xl btn-primary font-mono text-small font-bold tracking-[0.2em] disabled:opacity-60"
                >
                  {duoPending
                    ? t.onboarding.creating
                    : t.onboarding.createInvite}
                </button>
                <form className="flex gap-2" onSubmit={join}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="LKD-XXXXXX"
                    aria-label={t.onboarding.partnerCodeAria}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={16}
                    className="h-[54px] min-w-0 flex-1 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 font-mono text-base tracking-meta uppercase outline-none focus:border-line-bold"
                  />
                  <button
                    type="submit"
                    disabled={duoPending || !code.trim()}
                    className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-60"
                  >
                    {t.onboarding.join}
                  </button>
                </form>
              </div>
            )}
            {duoError && (
              <p role="alert" className="text-small text-danger">
                {duoError}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {!(step === 4 && !duo) && (
            <button
              type="button"
              onClick={() => void next()}
              aria-disabled={ctaDisabled}
              className={cx(
                "h-[58px] rounded-2xl font-mono text-small font-semibold tracking-brand transition-all duration-200 active:scale-[.97]",
                ctaDisabled ? "bg-selected text-ghost" : "bg-text text-bg",
              )}
            >
              {busy && step !== 0 ? t.onboarding.saving : cta}
            </button>
          )}
          {step === 4 && !duo && (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={busy}
              className="h-12 text-body text-muted"
            >
              {t.onboarding.later}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
