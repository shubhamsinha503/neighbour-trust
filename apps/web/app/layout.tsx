import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neighbour Trust",
  description:
    "Sourced, confidence-tagged neighbourhood data for Bengaluru and Gurugram.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page-plane">{children}</body>
    </html>
  );
}
