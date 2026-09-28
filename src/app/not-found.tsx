import Link from "next/link";
import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";

export const metadata: Metadata = { title: t.notFound.title };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-5 px-6">
      <span className="font-mono text-[11px] tracking-[.16em] text-dim">
        404
      </span>
      <p className="text-[26px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty">
        {t.notFound.text}
      </p>
      <Link
        href="/today"
        className="flex h-[52px] items-center self-start rounded-[14px] bg-accent px-[22px] font-mono text-xs font-semibold tracking-[.22em] text-bg"
      >
        {t.notFound.cta}
      </Link>
    </main>
  );
}
