import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ar-agents studio",
  description:
    "Creá una sociedad automatizada conversando. Conversational builder for Argentine automated societies, on top of ar-agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
