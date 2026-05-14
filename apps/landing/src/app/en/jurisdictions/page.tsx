import type { Metadata } from "next";
import { JurisdiccionesContent } from "../../jurisdicciones/content";

export const metadata: Metadata = {
  title: "Jurisdictions compared · ar-agents",
  description:
    "Honest comparison: how Wyoming DAO LLC, Marshall Islands MIDAO, Estonia e-Residency, Singapore VCC + AI Verify solve identity, signing, registry, and auditing of algorithmic entities, and what Argentine primitives ar-agents proposes as an analogue. For legislators, journalists, advisors.",
  alternates: {
    canonical: "https://ar-agents.ar/en/jurisdictions",
    languages: {
      es: "https://ar-agents.ar/jurisdicciones",
      en: "https://ar-agents.ar/en/jurisdictions",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Jurisdictions compared, AI corporations in good international company",
    description:
      "Wyoming, Estonia, Marshall Islands, Singapore: how each jurisdiction solves identity + signing + registry + auditing for algorithmic entities. And what Argentine primitives ar-agents proposes as an analogue.",
    url: "https://ar-agents.ar/en/jurisdictions",
  },
};

export default function EnJurisdictionsPage() {
  return <JurisdiccionesContent lang="en" />;
}
