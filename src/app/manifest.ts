import type { MetadataRoute } from "next";
import { LOCALE, t } from "@/i18n/pt-BR";

/**
 * Installable app (Stage 8): name, standalone display, the app's surface
 * colour and the LogoMark icons (public/icons, scripts/generate-icons.mjs).
 * No service worker and no offline cache: the app needs the network.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOCKED IN",
    short_name: "LOCKED IN",
    description: t.app.tagline,
    lang: LOCALE,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0c0e",
    theme_color: "#0c0c0e",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
