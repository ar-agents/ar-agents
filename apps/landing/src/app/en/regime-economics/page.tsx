import type { Metadata } from "next";
import { EconomiaContent } from "../../economia-del-regimen/content";

export const metadata: Metadata = {
  title: "Economics of the AI-corporation regime · ar-agents",
  description:
    "Quantitative analysis: incorporation cost + 24-month operating cost + capital attraction. Argentina vs Wyoming DAO LLC vs Estonia e-Residency vs Delaware vs Marshall Islands. For tech-business journalists, investment advisors, ministerial advisors.",
  alternates: {
    canonical: "https://ar-agents.ar/en/regime-economics",
    languages: {
      es: "https://ar-agents.ar/economia-del-regimen",
      en: "https://ar-agents.ar/en/regime-economics",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Economics of the AI-corporation regime, quantitative comparison",
    description:
      "Incorporation cost + 24-month TCO + value capture. AR vs Wyoming/Estonia/Delaware/Marshall.",
    url: "https://ar-agents.ar/en/regime-economics",
  },
};

export default function EnRegimeEconomicsPage() {
  return <EconomiaContent lang="en" />;
}
