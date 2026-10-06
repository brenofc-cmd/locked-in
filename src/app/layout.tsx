import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LOCALE, t } from "@/i18n/pt-BR";
import { ServiceWorkerRegistrar } from "@/components/push/PushRuntime";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
