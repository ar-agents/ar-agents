import type { Metadata } from "next";
import { EveContent } from "./eve-content";

// Bilingual page (EN/ES via the site language toggle); metadata stays in
// English for the launch share and SEO. Content lives in the client component
// so it can read the language context.
export const metadata: Metadata = {
  title: "Built with eve",
  description:
    "ar-agents runs on eve, Vercel's open-source agent framework. An agent that incorporates automated companies in Argentina and pauses for a human to approve the irreversible step, art. 102 as one line: needsApproval: always().",
  alternates: { canonical: "https://ar-agents.ar/eve" },
  openGraph: {
    title: "ar-agents, built with eve",
    description:
      "An agent that incorporates an Argentine company and stops for a human to sign. Art. 102 in one line of eve: needsApproval: always().",
    url: "https://ar-agents.ar/eve",
    type: "article",
  },
};

export default function EvePage() {
  return <EveContent />;
}
