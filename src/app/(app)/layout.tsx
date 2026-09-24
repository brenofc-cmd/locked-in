import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppStateProvider } from "@/components/app-state";
import { DuoRealtimeProvider } from "@/components/duo-realtime";
import { SessionProvider } from "@/components/session";
import { AppShell } from "@/components/shell/AppShell";
import { loadAppData } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // src/proxy.ts already redirects signed-out requests; this is the backstop
  // so no private screen can render without a verified session.
  // Rendered per request (reads cookies): a refresh always shows the current
  // database state, never a cached copy.
  const data = await loadAppData();
  if (!data) redirect("/login");

  return (
    <SessionProvider value={data.session}>
      <DuoRealtimeProvider initial={data.duo}>
        <AppStateProvider initialTasks={data.tasks} initialFocus={data.focus}>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </DuoRealtimeProvider>
    </SessionProvider>
  );
}
