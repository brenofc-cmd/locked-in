import Link from "next/link";
import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";

export const metadata: Metadata = { title: t.notFound.title };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-5 px-6">
      <span className="font-mono text-meta tracking-eyebrow text-dim">404</span>
      <p className="text-heading leading-[1.3] font-medium tracking-display text-pretty">
        {t.notFound.text}
      </p>
      <Link
        href="/today"
        className="flex h-[52px] items-center self-start rounded-2xl bg-accent px-6 font-mono text-small font-semibold tracking-eyebrow text-bg"
      >
        {t.notFound.cta}
      </Link>
    </main>
  );
}
