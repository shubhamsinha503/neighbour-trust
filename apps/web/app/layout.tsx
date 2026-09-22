import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Hanken_Grotesk } from "next/font/google";

import { AccountBar } from "@/components/AccountBar";
import { AuthProvider } from "@/components/AuthProvider";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { authConfigured } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteFooter";
import { WebAnalytics } from "@/components/WebAnalytics";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://neighbourtrust.com";

// The redesign type system, all self-hosted by next/font (no runtime request to
// Google, no layout shift). Hanken Grotesk is the body face; Bricolage Grotesque
// is the display face for headings and the score numbers; Caveat is the one
// script face, used only for the visit counter's handwritten aside. Each is
// exposed as a CSS variable and wired into the @theme tokens in globals.css.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Neighbour Trust",
    // Locality pages set their own name; this frames it without repetition.
    template: "%s · Neighbour Trust",
  },
  description:
    "Sourced, confidence-tagged neighbourhood data for Bengaluru, Gurugram, Hyderabad and Mumbai. " +
    "Air quality, schools, and what local press reports about safety and water.",
  applicationName: "Neighbour Trust",

  // Apple ignores the manifest and reads these instead.
  appleWebApp: {
    capable: true,
    title: "Neighbour Trust",
    statusBarStyle: "default",
  },

  icons: {
    // SVG first so modern browsers show the brand mark (a check in a pin);
    // favicon.ico stays as the fallback for browsers that ignore SVG icons.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
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
    // No count. This said "44 localities" and stayed saying it after the
    // number became 159 — static metadata cannot know, and a link preview is
    // exactly where a stale figure does most damage: a report gets forwarded to
    // family far more often than it gets found, so this text is read by people
    // who never see the page. A claim that cannot go stale is worth more here
    // than a number that impresses once and then quietly misleads.
    description:
      "Know the neighbourhood before you commit to it. Sourced, dated " +
      "neighbourhood data for Bengaluru, Gurugram, Hyderabad and Mumbai.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neighbour Trust",
    description:
      "Know the neighbourhood before you commit to it. Sourced, dated " +
      "neighbourhood data for Bengaluru, Gurugram, Hyderabad and Mumbai.",
  },
};

export const viewport: Viewport = {
  // Colours the Android status bar to match the hero, so an installed copy
  // reads as one surface rather than a page inside a browser.
  themeColor: "#ff2d78",
  width: "device-width",
  initialScale: 1,
  // Not `maximumScale: 1`. Locking zoom is the standard way to make a web app
  // feel native and it takes pinch-zoom away from anyone who needs it; this app
  // is read by people checking a number before spending a lot of money.
  viewportFit: "cover",
  // When the software keyboard opens (the Ask box, the search), shrink the
  // layout viewport instead of overlaying it — so a focused input is never
  // hidden behind the keyboard, matching iOS behaviour on Android too.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-IN"
      className={`${hanken.variable} ${bricolage.variable} ${caveat.variable}`}
    >
      <body className="min-h-screen bg-page-plane">
        {/* Sign-in appears only once Google credentials are configured; until
          * then the site renders exactly as it did without accounts. */}
        <AuthProvider enabled={authConfigured}>
          {authConfigured && <AccountBar />}
          {children}
        </AuthProvider>
        <SiteFooter />
        <RegisterServiceWorker />
        <WebAnalytics />
      </body>
    </html>
  );
}
