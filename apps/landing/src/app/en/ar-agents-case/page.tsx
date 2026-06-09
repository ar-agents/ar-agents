import type { Metadata } from "next";
import { CasoArAgentsContent } from "../../caso-ar-agents/content";

export const metadata: Metadata = {
  title: "Case: ar-agents incorporated itself",
  description:
    "ar-agents is an automated company that builds automated companies: it incorporated and operated itself via /incorporar + The Auditor, with a signed audit log (HMAC + Ed25519) anyone can verify.",
  alternates: {
    canonical: "https://ar-agents.ar/en/ar-agents-case",
    languages: {
      es: "https://ar-agents.ar/caso-ar-agents",
      en: "https://ar-agents.ar/en/ar-agents-case",
    },
  },
};

export default function ArAgentsCasePage() {
  return <CasoArAgentsContent lang="en" />;
}
