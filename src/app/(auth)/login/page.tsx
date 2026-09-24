import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth-routes";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={safeNext(typeof next === "string" ? next : null)}
      linkError={error === "link"}
    />
  );
}
