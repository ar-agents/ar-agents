import type { Metadata } from "next";
import { RegistroContent } from "./content";

export const runtime = "nodejs";
export const revalidate = 600;

export const metadata: Metadata = {
  title:
    "/registro · public registry of known sociedad-IA implementations · ar-agents",
  description:
    "Registro público de implementaciones y demos compatibles con los RFC de ar-agents. Metadata pública únicamente. Auto-suscripción vía PR a github.com/ar-agents/ar-agents.",
  alternates: {
    canonical: "https://ar-agents.ar/registro",
    languages: {
      es: "https://ar-agents.ar/registro",
      en: "https://ar-agents.ar/en/registry",
    },
  },
  openGraph: {
    title:
      "/registro · public registry of known sociedad-IA implementations",
    description:
      "Cada sociedad-IA argentina (o demo) que implementa RFC-001..004 puede listarse aquí. Metadata pública únicamente.",
    url: "https://ar-agents.ar/registro",
    type: "article",
  },
};

export default async function RegistroPage() {
  return <RegistroContent lang="es" />;
}
