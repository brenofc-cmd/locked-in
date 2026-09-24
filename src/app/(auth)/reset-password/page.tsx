import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "New password" };

/**
 * Reached from the recovery email via /auth/confirm, which signs the user in.
 * Not public: src/proxy.ts sends visitors without a session to /login.
 */
export default function Page() {
  return <ResetPasswordForm />;
}
