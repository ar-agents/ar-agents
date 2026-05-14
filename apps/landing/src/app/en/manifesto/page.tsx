import type { Metadata } from "next";
import { ManifiestoContent } from "../../manifiesto/content";

export const metadata: Metadata = {
  title: "Manifesto · ar-agents",
  description:
    "Open infrastructure for the Argentine agent jurisdiction. Project manifesto.",
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
