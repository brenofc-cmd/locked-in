import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppStateProvider } from "@/components/app-state";
import { SessionProvider } from "@/components/session";
import { AppShell } from "@/components/shell/AppShell";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // src/proxy.ts already redirects signed-out requests; this is the backstop
  // so no private screen can render without a verified session.
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SessionProvider value={session}>
      <AppStateProvider>
        <AppShell>{children}</AppShell>
      </AppStateProvider>
    </SessionProvider>
  );
}
