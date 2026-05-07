import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "./theme-toggle";

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
    "@ar-agents/mercadopago — 89 typed tools across the agent-relevant Mercado Pago API surface (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point, Webhooks, Stores+POS, Settlements, Disputes, Lookups, Bank Accounts) for the Vercel AI SDK 6.",
  openGraph: {
    title: "Mercado Pago Agent Toolkit",
    description:
      "89 typed tools across the agent-relevant Mercado Pago API surface, for the Vercel AI SDK 6. Edge Runtime, Vercel KV adapters, OpenTelemetry.",
  },
};

// FOUC-safe theme init: read localStorage and set data-theme on <html> before paint.
// Default is dark; only flip to light if explicitly chosen.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
