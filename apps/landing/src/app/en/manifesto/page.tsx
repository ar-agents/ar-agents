import type { Metadata } from "next";
import { NOINDEX } from "../../noindex";
import { ManifiestoContent } from "../../manifiesto/content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Manifesto · ar-agents",
  description:
    "Infrastructure to create and register autonomous companies in Argentina, operated by AI agents. Project manifesto.",
  alternates: {
    canonical: "https://ar-agents.ar/en/manifesto",
    languages: {
      es: "https://ar-agents.ar/manifiesto",
      en: "https://ar-agents.ar/en/manifesto",
    },
  },
};

export default function EnManifestoPage() {
  return <ManifiestoContent lang="en" />;
}
