import type { Metadata, Viewport } from "next";

import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://neighbour-trust-virid.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Neighbour Trust",
    // Locality pages set their own name; this frames it without repetition.
    template: "%s · Neighbour Trust",
  },
  description:
    "Sourced, confidence-tagged neighbourhood data for Bengaluru and Gurugram. " +
    "Air quality, schools, and what local press reports about safety and water.",
  applicationName: "Neighbour Trust",

  // Apple ignores the manifest and reads these instead.
  appleWebApp: {
    capable: true,
    title: "Neighbour Trust",
    statusBarStyle: "default",
  },

  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },

  // Home buying in India is a family decision, so a report is forwarded far more
  // often than it is found. What the link preview says in WhatsApp is part of
  // the product rather than an afterthought.
  openGraph: {
    type: "website",
    siteName: "Neighbour Trust",
    locale: "en_IN",
    title: "Neighbour Trust",
    description:
      "Know the neighbourhood before you commit to it. Sourced data for 44 " +
      "localities across Bengaluru and Gurugram.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neighbour Trust",
    description:
      "Know the neighbourhood before you commit to it. Sourced data for 44 " +
      "localities across Bengaluru and Gurugram.",
  },
};

export const viewport: Viewport = {
  // Colours the Android status bar to match the hero, so an installed copy
  // reads as one surface rather than a page inside a browser.
  themeColor: "#147a56",
  width: "device-width",
  initialScale: 1,
  // Not `maximumScale: 1`. Locking zoom is the standard way to make a web app
  // feel native and it takes pinch-zoom away from anyone who needs it; this app
  // is read by people checking a number before spending a lot of money.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen bg-page-plane">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
