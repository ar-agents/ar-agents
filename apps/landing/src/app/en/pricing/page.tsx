import type { Metadata } from "next";
import { PreciosContent } from "../../precios/content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ar-agents open-core model: the code is free forever; you pay for the managed trust layer. The party who needs the trust pays (bank, insurer, state), not the verified company. The Auditor, live, USD 199/mo.",
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
