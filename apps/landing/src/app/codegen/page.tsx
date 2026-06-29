import type { Metadata } from "next";
import { CodegenClient } from "./codegen-client";

export const metadata: Metadata = {
  title: "/codegen · auto-generate incorporate() snippets in any language",
  description:
    "Fill in your automated company's details, get equivalent code for TypeScript, Python, Go, Rust, curl, and HTTPie. Copy-paste-ready. The snippet that an agent author or compliance engineer drops into their codebase to call /api/auto-incorporate.",
  alternates: { canonical: "https://ar-agents.ar/codegen" },
};

export default function CodegenPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        color: "#171717",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <CodegenClient />
    </main>
  );
}
