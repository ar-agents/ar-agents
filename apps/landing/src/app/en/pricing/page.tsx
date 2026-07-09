import type { Metadata } from "next";
import { PreciosContent } from "../../precios/content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Creating, deploying, and operating your automated company is free. Once it starts earning, we charge 5x the token cost its agents consume. No subscriptions, no seats, no fixed fees.",
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
