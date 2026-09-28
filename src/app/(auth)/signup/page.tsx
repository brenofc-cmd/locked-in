import type { Metadata } from "next";
import { t } from "@/i18n/pt-BR";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: t.pageTitles.signUp };

export default function Page() {
  return <SignupForm />;
}
