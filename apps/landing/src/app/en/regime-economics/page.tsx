import type { Metadata } from "next";
import { NOINDEX } from "../../noindex";
import { EconomiaContent } from "../../economia-del-regimen/content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Formation and operating costs · ar-agents",
  description:
    "Reference note on the cost of forming and operating an automated company in Argentina. For current plans, see the pricing page.",
  alternates: {
    canonical: "https://ar-agents.ar/en/regime-economics",
    languages: {
      es: "https://ar-agents.ar/economia-del-regimen",
      en: "https://ar-agents.ar/en/regime-economics",
    },
  },
};

export default function EnRegimeEconomicsPage() {
  return <EconomiaContent lang="en" />;
}
