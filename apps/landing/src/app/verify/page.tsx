import type { Metadata } from "next";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "/verify · independent HMAC verification",
  description:
    "Paste a /play session ID and get an independent server-side HMAC verification of every audit-log entry. Public. Tamper-evidence by the same primitives RFC-001 § 9.2 makes legally probative.",
  alternates: { canonical: "https://ar-agents.vercel.app/verify" },
};

export default function VerifyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        color: "#171717",
        padding: "32px 24px 80px",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <VerifyClient />
    </main>
  );
}
