import type { Metadata } from "next";
import { PreciosContent } from "./content";

export const metadata: Metadata = {
  title: "Precios",
  description:
    "Modelo open-core de ar-agents: el núcleo (33 paquetes, RFCs, wizard) es gratis; la capa de confianza hosted —El Auditor (art. 102), representación y cumplimiento (arts. 260/264)— es paga y operable por agente vía API.",
  alternates: {
    canonical: "https://ar-agents.ar/precios",
    languages: {
      es: "https://ar-agents.ar/precios",
      en: "https://ar-agents.ar/en/pricing",
    },
  },
};

export default function PreciosPage() {
  return <PreciosContent lang="es" />;
}
