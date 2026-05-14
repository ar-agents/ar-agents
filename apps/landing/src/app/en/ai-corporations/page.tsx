import type { Metadata } from "next";
import { SociedadesContent } from "../../sociedades-ia/content";

export const metadata: Metadata = {
  title: "AI corporations · sociedades de IA · ar-agents",
  description:
    "Reference implementation of Argentine AI corporations. How a 100% AI company incorporates, invoices, pays taxes, serves customers, using ar-agents.",
  alternates: {
    canonical: "https://ar-agents.ar/en/ai-corporations",
    languages: {
      es: "https://ar-agents.ar/sociedades-ia",
      en: "https://ar-agents.ar/en/ai-corporations",
    },
  },
};

export default function EnAiCorporationsPage() {
  return <SociedadesContent lang="en" />;
}
