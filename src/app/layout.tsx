import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Providers from "./providers";
import AppShell from "@/components/app/AppShell";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "HyperPulse — Hyperliquid Intelligence Workspace",
    template: "%s",
  },
  description:
    "A Hyperliquid-native, read-only demo for live markets, cleaner portfolio review, and trader-friendly documentation.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HyperPulse — Hyperliquid Intelligence Workspace",
    description:
      "Read-only by default. Live markets, portfolio review, and trader-facing context in one Hyperliquid-native workspace.",
    url: "/",
    siteName: "HyperPulse",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "HyperPulse — Hyperliquid Intelligence Workspace",
    description:
      "Read-only by default. Live markets, portfolio review, and trader-facing context in one Hyperliquid-native workspace.",
    images: ["/twitter-image"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers><AppShell>{children}</AppShell></Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
