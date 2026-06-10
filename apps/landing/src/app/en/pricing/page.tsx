import type { Metadata } from "next";
import { PreciosContent } from "../../precios/content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ar-agents open-core model: the core (33 packages, RFCs, wizard) is free; the hosted trust layer, with The Auditor (art. 102) and representation and compliance (arts. 260/264), is paid and agent-operable via API.",
  alternates: {
    canonical: "https://ar-agents.ar/en/pricing",
    languages: {
      es: "https://ar-agents.ar/precios",
      en: "https://ar-agents.ar/en/pricing",
    },
  },
};

export default function PricingPage() {
  return <PreciosContent lang="en" />;
}
