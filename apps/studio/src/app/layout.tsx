import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import {
  LOCALE_COOKIE_NAME,
  metadataForLocale,
  resolveInitialLocale,
  type Locale,
} from "@/lib/ui/i18n";

async function currentLocale(): Promise<Locale> {
  const jar = await cookies();
  return resolveInitialLocale(jar.get(LOCALE_COOKIE_NAME)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return metadataForLocale(locale);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await currentLocale();
  return (
    <html lang={locale === "es" ? "es-AR" : "en"}>
      <body>{children}</body>
    </html>
  );
}
