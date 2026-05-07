import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Mercado Pago Agent Toolkit — built on Vercel",
  description:
    "@ar-agents/mercadopago — 87 typed tools across the agent-relevant Mercado Pago API surface (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point, Webhooks, Stores+POS, Settlements, Disputes, Lookups, Bank Accounts) for the Vercel AI SDK 6.",
  openGraph: {
    title: "Mercado Pago Agent Toolkit",
    description:
      "87 typed tools across the agent-relevant Mercado Pago API surface, for the Vercel AI SDK 6. Edge Runtime, Vercel KV adapters, OpenTelemetry.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
