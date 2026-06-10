import type { Metadata } from "next";
import { SociedadesContent } from "./content";

export const metadata: Metadata = {
  title: "Sociedades de IA",
  description:
    "Implementación de referencia de sociedades de IA en Argentina. Cómo una empresa operada por agentes de IA se incorpora, factura, paga monotributo, atiende clientes, usando ar-agents.",
  alternates: {
    canonical: "https://ar-agents.ar/sociedades-ia",
    languages: {
      es: "https://ar-agents.ar/sociedades-ia",
      en: "https://ar-agents.ar/en/ai-corporations",
    },
  },
};

export default function SociedadesIAPage() {
  return <SociedadesContent lang="es" />;
}
