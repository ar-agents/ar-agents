import type { Metadata } from "next";
import { ImplementationEnContent } from "./content";

export const metadata: Metadata = {
  title: "Reference implementation for AI corporations · ar-agents",
  description:
    "Technical document for the team drafting Argentina's AI Corporations bill. Architecture on preexisting open standards, five suggested operable clauses, responses to public legal objections. MIT, open, citable. Ed25519-signed PDF.",
  alternates: {
    canonical: "https://ar-agents.ar/en/implementation",
    languages: {
      es: "https://ar-agents.ar/implementacion",
      en: "https://ar-agents.ar/en/implementation",
    },
  },
  openGraph: {
    type: "article",
    title: "Reference implementation for AI corporations",
    description:
      "Technical architecture, operable code, and suggested clauses for the Argentine AI Corporations bill. MIT, open, ready for official citation. PDF signed with Ed25519.",
    url: "https://ar-agents.ar/en/implementation",
  },
};

export default function ImplementationEnPage() {
  return <ImplementationEnContent />;
}
