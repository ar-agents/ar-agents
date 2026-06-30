import type { Metadata } from "next";
import { NOINDEX } from "../noindex";
import { GobiernoContent } from "./content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Para el Estado argentino · briefing operativo · ar-agents",
  description:
    "Briefing operativo para asesores del Ministerio de Desregulación + Subsecretaría TIC + organismos relacionados con el régimen de sociedades-IA. Resumen ejecutivo + capacidades técnicas + propuesta de relación institucional + lo que NO pedimos.",
  alternates: {
    canonical: "https://ar-agents.ar/gobierno",
    languages: {
      es: "https://ar-agents.ar/gobierno",
      en: "https://ar-agents.ar/en/government",
    },
  },
  openGraph: {
    type: "article",
    title: "ar-agents, briefing operativo para el Estado argentino",
    description:
      "Lo que necesita saber el equipo ministerial sobre la infraestructura técnica del régimen de sociedades-IA, en 1 página.",
    url: "https://ar-agents.ar/gobierno",
  },
};

export default function GobiernoPage() {
  return <GobiernoContent lang="es" />;
}
