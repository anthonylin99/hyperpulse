import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "react-hot-toast";
import { MarketProvider } from "@/context/MarketContext";
import { WalletProvider } from "@/context/WalletContext";
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
  title: "HyperPulse — Hyperliquid Market Intelligence",
  description:
    "Real-time funding rates, open interest, and trading for Hyperliquid",
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
        <MarketProvider>
          <WalletProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#18181b",
                  color: "#fafafa",
                  border: "1px solid #27272a",
                  fontSize: "13px",
                },
              }}
            />
          </WalletProvider>
        </MarketProvider>
      </body>
    </html>
  );
}
