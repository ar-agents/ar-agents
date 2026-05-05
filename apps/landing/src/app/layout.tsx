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
  title: "ar-agents — drop-in tools for Vercel AI SDK to operate in Argentina",
  description:
    "AFIP CUIT validation, MercadoPago Subscriptions, WhatsApp Business — all wired as agent tools for the Vercel AI SDK. Open-source npm packages.",
  openGraph: {
    title: "ar-agents",
    description:
      "Drop-in tools for Vercel AI SDK to operate in Argentina (CUIT, MercadoPago, WhatsApp).",
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
