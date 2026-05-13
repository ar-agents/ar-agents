import type { Metadata } from "next";
import { ManifiestoContent } from "./content";

export const metadata: Metadata = {
  title: "Manifiesto · ar-agents",
  description:
    "La infraestructura abierta para la jurisdicción de agentes argentina. Manifiesto del proyecto.",
  alternates: {
    canonical: "https://ar-agents.ar/manifiesto",
    languages: {
      es: "https://ar-agents.ar/manifiesto",
      en: "https://ar-agents.ar/en/manifesto",
    },
  },
};

export default function ManifiestoPage() {
  return <ManifiestoContent lang="es" />;
}
