import { redirect } from "next/navigation";
import { ResumeEntry } from "@/components/resume/ResumeEntry";
import { createClient } from "@/lib/supabase/server";

/**
 * The generic entry (`/`, also the installed app's start_url). Signed out,
 * src/proxy.ts has already sent the request to /login. Signed in, the browser
 * restores the user's last safe route (Resume State, ADR-055) or opens
 * /today. An explicit URL (/focus, /today, an email link) never passes here.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return <ResumeEntry userId={userId} />;
}
