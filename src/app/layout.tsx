import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Newsreader } from "next/font/google";
import { LOCALE, t } from "@/i18n/pt-BR";
import { ServiceWorkerRegistrar } from "@/components/push/PushRuntime";
import "./globals.css";

// Obsidian Energy (Design System V3): Archivo with its width axis for the
// condensed numbers and titles, JetBrains Mono for labels, Newsreader only
// on the Focus stage.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400"],
});

export const metadata: Metadata = {
  title: { default: "LOCKED IN", template: "%s · LOCKED IN" },
  description: t.app.tagline,
  applicationName: "LOCKED IN",
  // Installed on iOS: full screen, dark status bar, the LogoMark icon.
  appleWebApp: {
    capable: true,
    title: "LOCKED IN",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#101315",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={LOCALE}
      className={`${archivo.variable} ${jetbrainsMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
