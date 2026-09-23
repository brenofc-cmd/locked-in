"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { LogoMark, MiniCheck, chipTone, cx } from "@/components/ui";
import { mockTemplates, mockUser } from "@/lib/mock-data";

const PATHS = [
  {
    id: "template",
    label: "Start from a template",
    sub: "Student, Athlete or Builder. Edit later.",
  },
  { id: "scratch", label: "Build from scratch", sub: "Add your own items." },
] as const;

/**
 * Mock onboarding: Welcome → Name → Routine path → Items → Invite → Today.
 * Only the name is kept (it changes the greeting); nothing is persisted.
 */
export function OnboardingScreen() {
  const app = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [path, setPath] = useState<(typeof PATHS)[number]["id"]>("template");
  const tplNames = Object.keys(mockTemplates);
  const [tpl, setTpl] = useState(tplNames[0]);
  const [items, setItems] = useState<{ name: string; on: boolean }[]>(() =>
    mockTemplates[tplNames[0]].map((i) => ({ name: i.name, on: true })),
  );
  const [draft, setDraft] = useState("");

  function finish() {
    if (name.trim()) app.setUserName(name.trim());
    router.push("/today");
  }

  function next() {
    if (step === 1 && !name.trim()) return;
    if (step === 2 && path === "scratch") setItems([]);
    if (step === 4) return finish();
    setStep((s) => s + 1);
  }

  function pickTemplate(t: string) {
    setTpl(t);
    setItems(mockTemplates[t].map((i) => ({ name: i.name, on: true })));
  }

  function addDraft() {
    if (!draft.trim()) return;
    setItems((list) => [...list, { name: draft.trim(), on: true }]);
    setDraft("");
  }

  const cta = ["BEGIN", "CONTINUE", "CONTINUE", "CONTINUE", "SHARE INVITE"][
    step
  ];
  const ctaDisabled = step === 1 && !name.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to LOCKED IN"
      className="absolute inset-0 z-[60] overflow-y-auto bg-overlay animate-[li-fade-in_.5s_ease]"
    >
      <div className="mx-auto flex min-h-full max-w-[440px] flex-col justify-between gap-9 px-6 pt-12 pb-8 desk:px-8 desk:py-16">
        <div className="flex min-h-11 items-center justify-between">
          <div
            className="flex gap-1.5"
            aria-label={`Step ${step + 1} of 5`}
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
              onClick={() => setStep((s) => s - 1)}
              className="h-11 px-1 text-sm text-dim"
            >
              Back
            </button>
          )}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-[22px] animate-[li-rise_.4s_ease]">
            <LogoMark size="lg" />
            <h1 className="text-[40px] leading-none font-semibold tracking-[.04em]">
              LOCKED IN
            </h1>
            <span className="font-mono text-[13px] leading-[1.8] tracking-[.28em] text-dim">
              NO HYPE.
              <br />
              JUST PROOF.
            </span>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-[18px] animate-[li-rise_.4s_ease]">
            <label
              htmlFor="ob-name"
              className="font-mono text-[11px] tracking-[.18em] text-dim"
            >
              YOUR NAME
            </label>
            <input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder={mockUser.name}
              autoComplete="given-name"
              className="h-[60px] rounded-[14px] border border-white/12 bg-field px-[18px] text-[22px] outline-none focus:border-white/30"
            />
            <span className="text-[13px] text-dim">
              Your partner will see this name.
            </span>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-[18px] animate-[li-rise_.4s_ease]">
            <h1 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">
              BUILD YOUR
              <br />
              FIRST ROUTINE
            </h1>
            <div
              role="radiogroup"
              aria-label="How to start"
              className="flex flex-col gap-[18px]"
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
                      "flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border px-[18px] text-left transition-all duration-150",
                      on
                        ? "border-accent-line bg-accent-soft"
                        : "border-white/9",
                    )}
                  >
                    <span className="flex flex-col gap-[5px]">
                      <span className="text-[16.5px] font-medium">
                        {p.label}
                      </span>
                      <span className="text-[13px] text-dim">{p.sub}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cx(
                        "flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                        on ? "border-accent" : "border-white/20",
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
            <h1 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">
              {path === "template" ? "PICK YOUR ITEMS" : "ADD YOUR ITEMS"}
            </h1>
            {path === "template" && (
              <div
                role="radiogroup"
                aria-label="Template"
                className="flex flex-wrap gap-1.5"
              >
                {tplNames.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tpl === t}
                    onClick={() => pickTemplate(t)}
                    className={cx(
                      "h-10 rounded-[10px] border px-3.5 text-sm",
                      chipTone(tpl === t),
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col">
              {items.map((it, i) => (
                <div
                  key={it.name + i}
                  className="flex min-h-[54px] items-center gap-3 border-b border-white/6"
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
                      "text-[15.5px]",
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
                  placeholder="Add your own"
                  aria-label="Add item"
                  className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-field px-3.5 text-base outline-none"
                />
                <button
                  type="button"
                  onClick={addDraft}
                  aria-label="Add"
                  className="size-12 rounded-xl border border-white/12 text-[22px]"
                >
                  +
                </button>
              </div>
            </div>
            <span className="text-[13px] text-dim">
              Every item repeats daily. Change schedules any time.
            </span>
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col gap-[18px] animate-[li-rise_.4s_ease]">
            <h1 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">
              INVITE YOUR
              <br />
              PARTNER
            </h1>
            <span className="text-base leading-[1.5] text-pretty text-muted">
              Discipline is easier when somebody knows whether you showed up.
            </span>
            <div className="flex flex-col gap-1 border-y border-white/7 py-4">
              <span className="font-mono text-[10.5px] tracking-[.14em] text-dim">
                YOUR CODE
              </span>
              <span className="font-mono text-2xl tracking-[.12em]">
                {mockUser.inviteCode}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={next}
            aria-disabled={ctaDisabled}
            className={cx(
              "h-[58px] rounded-2xl font-mono text-[12.5px] font-semibold tracking-[.26em] transition-all duration-200 active:scale-[.97]",
              ctaDisabled
                ? "bg-selected text-ghost"
                : step === 4
                  ? "bg-accent text-bg"
                  : "bg-text text-bg",
            )}
          >
            {cta}
          </button>
          {step === 4 && (
            <button
              type="button"
              onClick={finish}
              className="h-12 text-sm text-muted"
            >
              I&apos;ll do it later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
