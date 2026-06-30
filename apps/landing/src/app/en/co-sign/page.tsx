import type { Metadata } from "next";
import { NOINDEX } from "../../noindex";
import { CoFirmarContent } from "../../co-firmar/content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Co-sign an RFC · ar-agents",
  description:
    "Open invitation to jurists, scholars, AAIP specialists, and Argentine corporate-law experts: add your authorship to the ar-agents RFCs. CC-BY-4.0, no commercial commitment, your name lands in the citable reference.",
  alternates: {
    canonical: "https://ar-agents.ar/en/co-sign",
    languages: {
      es: "https://ar-agents.ar/co-firmar",
      en: "https://ar-agents.ar/en/co-sign",
    },
  },
};

export default function EnCoSignPage() {
  return <CoFirmarContent lang="en" />;
}
