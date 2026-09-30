import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { LoginForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth-routes";

export const metadata: Metadata = { title: t.pageTitles.signIn };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next, error, reason } = await searchParams;
  return (
    <LoginForm
      next={safeNext(typeof next === "string" ? next : null)}
      linkError={error === "link"}
      sessionEnded={reason === "session"}
    />
  );
}
