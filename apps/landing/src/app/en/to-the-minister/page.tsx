import type { Metadata } from "next";
import { NOINDEX } from "../../noindex";
import { AlMinistroContent } from "../../al-ministro/content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Open letter to the Minister · ar-agents",
  description:
    "Open letter to Minister Federico Sturzenegger on the technical implementation of the sociedades-IA regime. MIT reference implementation, 39 packages on npm, 252 tools, AAIF working group proposed. Ready to use the day the law passes.",
  alternates: {
    canonical: "https://ar-agents.ar/en/to-the-minister",
    languages: {
      es: "https://ar-agents.ar/al-ministro",
      en: "https://ar-agents.ar/en/to-the-minister",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Open letter to Minister Sturzenegger, The technical layer of AI corporations is already written",
    description:
      "39 npm packages, MIT, 252 tools, 16 of 17 operational pieces covered. Ready the day the law passes.",
    url: "https://ar-agents.ar/en/to-the-minister",
  },
};

export default function EnToTheMinisterPage() {
  return <AlMinistroContent lang="en" />;
}
