import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: t.pageTitles.newPassword };

/**
 * Reached from the recovery email via /auth/confirm, which signs the user in.
 * Not public: src/proxy.ts sends visitors without a session to /login.
 */
export default function Page() {
  return <ResetPasswordForm />;
}
