import type { Metadata } from "next";
import { PlayClient } from "./play-client";

export const metadata: Metadata = {
  title: "/play · sociedad automatizada argentina en vivo",
  description:
    "Live interactive demo of an Argentine sociedad automatizada running on @ar-agents/* under RFC-001 governance. Type a prompt, watch the agent operate the business, every tool call audit-logged with HMAC-signed timestamps in real time. Zero setup.",
  alternates: { canonical: "https://ar-agents.ar/play" },
};

export default function PlayPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <PlayClient />
    </main>
  );
}
