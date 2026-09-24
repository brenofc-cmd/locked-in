import { createClient } from "@/lib/supabase/server";

/** Real (non-mock) identity for the signed-in user. Everything else is still mock in Stage 3. */
export type SessionData = {
  me: {
    id: string;
    email: string;
    displayName: string;
    timezone: string;
    createdAt: string;
  };
  /** null = no duo. partner null = waiting for the partner to join. */
  duo: {
    id: string;
    inviteCode: string;
    partner: { id: string; displayName: string } | null;
  } | null;
};

/**
 * Loads the session for a Server Component. Returns null when signed out.
 * RLS decides what is visible: own profile, own duo, own duo's members and
 * the partner's profile. No query here filters by duo on trust.
 */
export async function getSession(): Promise<SessionData | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [profiles, duos, members] = await Promise.all([
    supabase.from("profiles").select("id, display_name, timezone, created_at"),
    supabase.from("duos").select("id, invite_code").maybeSingle(),
    supabase.from("duo_members").select("user_id"),
  ]);
  if (profiles.error || duos.error || members.error) {
    throw new Error("Could not load your account. Try again.");
  }

  const mine = profiles.data.find((p) => p.id === userId);
  if (!mine) throw new Error("Profile missing for signed-in user.");

  const partnerId = members.data.find((m) => m.user_id !== userId)?.user_id;
  const partner = profiles.data.find((p) => p.id === partnerId);

  return {
    me: {
      id: userId,
      email: typeof claims.claims.email === "string" ? claims.claims.email : "",
      displayName: mine.display_name,
      timezone: mine.timezone,
      createdAt: mine.created_at,
    },
    duo: duos.data
      ? {
          id: duos.data.id,
          inviteCode: duos.data.invite_code,
          partner: partner
            ? { id: partner.id, displayName: partner.display_name }
            : null,
        }
      : null,
  };
}
