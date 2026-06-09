import type { Metadata } from "next";
import { CasoArAgentsContent } from "./content";

export const metadata: Metadata = {
  title: "Caso: ar-agents se constituyó a sí misma",
  description:
    "ar-agents es una Sociedad Automatizada que fabrica Sociedades Automatizadas: se constituyó y operó a sí misma vía /incorporar + El Auditor, con un audit log firmado (HMAC + Ed25519) verificable por cualquiera.",
  alternates: {
    canonical: "https://ar-agents.ar/caso-ar-agents",
    languages: {
      es: "https://ar-agents.ar/caso-ar-agents",
      en: "https://ar-agents.ar/en/ar-agents-case",
    },
  },
};

export default function CasoArAgentsPage() {
  return <CasoArAgentsContent lang="es" />;
}
