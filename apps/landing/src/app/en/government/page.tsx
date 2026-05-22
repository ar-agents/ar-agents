import type { Metadata } from "next";
import { GobiernoContent } from "../../gobierno/content";

export const metadata: Metadata = {
  title: "For the Argentine state · operational briefing · ar-agents",
  description:
    "Operational briefing for advisors at the Ministry of Deregulation and State Transformation, Subsec TIC, AAIP and related agencies. Executive summary + technical capabilities + institutional proposal + what we are NOT requesting.",
  alternates: {
    canonical: "https://ar-agents.ar/en/government",
    languages: {
      es: "https://ar-agents.ar/gobierno",
      en: "https://ar-agents.ar/en/government",
    },
  },
  openGraph: {
    type: "article",
    title: "ar-agents, operational briefing for the Argentine state",
    description:
      "What the ministerial team needs to know about the technical infrastructure for the sociedades-IA regime, on one page.",
    url: "https://ar-agents.ar/en/government",
  },
};

export default function EnGovernmentPage() {
  return <GobiernoContent lang="en" />;
}
