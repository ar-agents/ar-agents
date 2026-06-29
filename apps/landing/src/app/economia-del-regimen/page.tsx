import type { Metadata } from "next";
import { EconomiaContent } from "./content";

export const metadata: Metadata = {
  title: "Economía del régimen de sociedades automatizadas · ar-agents",
  description:
    "Análisis cuantitativo: costo de constitución + costo operativo a 24 meses + atracción de capital. Argentina vs Wyoming DAO LLC vs Estonia e-Residency vs Delaware vs Marshall Islands. Para periodistas economico-tech, asesores de inversión, asesores ministeriales.",
  alternates: {
    canonical: "https://ar-agents.ar/economia-del-regimen",
    languages: {
      es: "https://ar-agents.ar/economia-del-regimen",
      en: "https://ar-agents.ar/en/regime-economics",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Economía del régimen de sociedades automatizadas, comparativa cuantitativa",
    description:
      "Costo de constitución + TCO 24 meses + value capture. AR vs Wyoming/Estonia/Delaware/Marshall.",
    url: "https://ar-agents.ar/economia-del-regimen",
  },
};

export default function EconomiaPage() {
  return <EconomiaContent lang="es" />;
}
