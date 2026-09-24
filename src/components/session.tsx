"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionData } from "@/lib/session";

/**
 * Real auth / profile / duo state, loaded on the server by (app)/layout.tsx.
 * Kept apart from the mock product state in app-state.tsx. To refresh it
 * after a mutation, the Server Action revalidates the layout.
 */
const SessionContext = createContext<SessionData | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionData;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionData {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
