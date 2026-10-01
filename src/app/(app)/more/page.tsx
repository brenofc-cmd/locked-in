import { redirect } from "next/navigation";

/**
 * MAIS left the tab bar (docs/NAVIGATION.md): its planning rows live on
 * /plan, settings and the duo in the profile menu. Old bookmarks and
 * installed apps that open /more land on PLANEJAR.
 */
export default function Page() {
  redirect("/plan");
}
