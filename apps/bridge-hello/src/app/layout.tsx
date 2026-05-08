import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bridge-hello — ACP facilitator demo",
  description:
    "Reference app for @ar-agents/agentic-commerce-bridge. ACP-discoverable storefront in 30 seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
