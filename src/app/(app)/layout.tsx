import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppStateProvider } from "@/components/app-state";
import { DuoRealtimeProvider } from "@/components/duo-realtime";
import { SessionProvider } from "@/components/session";
import { AppShell } from "@/components/shell/AppShell";
import { SESSION_REJECTED_LOGIN } from "@/lib/auth-routes";
import { isSessionRejected, loadAppData, type AppData } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // src/proxy.ts already redirects signed-out requests; this is the backstop
  // so no private screen can render without a verified session.
  // Rendered per request (reads cookies): a refresh always shows the current
  // database state, never a cached copy.
  let data: AppData | null;
  try {
    data = await loadAppData();
  } catch (error) {
    // ISSUE-001 case B: a session the database refuses ends at login, never
    // at "This page couldn't load". Any other failure is still an error.
    if (await isSessionRejected()) redirect(SESSION_REJECTED_LOGIN);
    throw error;
  }
  if (!data) redirect("/login");

  return (
    <SessionProvider value={data.session}>
      <DuoRealtimeProvider initial={data.duo}>
        <AppStateProvider
          initialTasks={data.tasks}
          initialFocus={data.focus}
          initialProgress={data.progress}
          initialPlanner={data.planner}
          initialReflection={data.reflection}
        >
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </DuoRealtimeProvider>
    </SessionProvider>
  );
}
