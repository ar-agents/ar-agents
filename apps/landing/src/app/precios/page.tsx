import type { Metadata } from "next";
import { PreciosContent } from "./content";

export const metadata: Metadata = {
  title: "Precios",
  description:
    "Modelo open-core de ar-agents: el código es gratis para siempre; pagás la capa de confianza operada. Regla justa: paga el que necesita confiar (banco, aseguradora, Estado), no la sociedad verificada. El Auditor, vivo, USD 199/mes.",
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
