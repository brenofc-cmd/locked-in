import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: t.pageTitles.forgotPassword };

export default function Page() {
  return <ForgotPasswordForm />;
}
