import type { Metadata } from "next";
import { RegistroContent } from "../../registro/content";

export const runtime = "nodejs";
export const revalidate = 600;

export const metadata: Metadata = {
  title:
    "/registry · public registry of known AI-corp implementations · ar-agents",
  description:
    "Every Argentine AI-corp (or demo) implementing RFC-001..004 can be listed here. Public metadata only. Self-listing via PR at github.com/ar-agents/ar-agents. Today: 1 reference impl + 4 demos.",
  alternates: {
    canonical: "https://ar-agents.ar/en/registry",
    languages: {
      es: "https://ar-agents.ar/registro",
      en: "https://ar-agents.ar/en/registry",
    },
  },
  openGraph: {
    title:
      "/registry · public registry of known AI-corp implementations",
    description:
      "Every Argentine AI-corp (or demo) implementing RFC-001..004 can be listed here. Public metadata only.",
    url: "https://ar-agents.ar/en/registry",
    type: "article",
  },
};

export default async function EnRegistryPage() {
  return <RegistroContent lang="en" />;
}
