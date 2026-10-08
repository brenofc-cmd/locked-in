import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui";
import { t } from "@/i18n/pt-BR";

/** Auth frame from the approved "Sign in" moment (design v2): mark, wordmark, form, footnote. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg animate-[li-fade-in_.5s_ease]">
      <div className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-10 px-6 py-14">
        <div className="flex flex-col gap-6">
          <LogoMark size="lg" />
          <div className="flex flex-col gap-3">
            <span className="num text-[3.625rem] leading-[.88] [font-stretch:66%]">
              LOCKED IN
            </span>
            <span className="font-mono text-small leading-[1.7] font-semibold tracking-brand text-accent">
              {t.app.taglineLines[0]}
              <br />
              {t.app.taglineLines[1]}
            </span>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
