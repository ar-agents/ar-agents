import type { Metadata } from "next";
import { AuditorContent } from "../../auditor/content";

export const metadata: Metadata = {
  title: "/auditor · for regulators, journalists, legislators · ar-agents",
  description:
    "An Argentine AI corporation runs on ar-agents. Every call leaves an HMAC-SHA256-signed record that any auditor can verify without asking the operator for their key. This page summarizes the full process on a single printable sheet.",
  alternates: {
    canonical: "https://ar-agents.ar/en/auditor",
    languages: {
      es: "https://ar-agents.ar/auditor",
      en: "https://ar-agents.ar/en/auditor",
    },
  },
  openGraph: {
    title: "/auditor · for regulators, journalists, legislators",
    description:
      "An Argentine AI corporation runs on ar-agents. Every call leaves an HMAC-SHA256-signed record verifiable without the operator's key.",
    url: "https://ar-agents.ar/en/auditor",
    type: "article",
    locale: "en_US",
  },
};

export default function EnAuditorPage() {
  return <AuditorContent lang="en" />;
}
