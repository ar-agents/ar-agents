import type { Metadata } from "next";
import { SociedadesContent } from "./content";

export const metadata: Metadata = {
  title: "Sociedades de IA · implementación de referencia",
  description:
    "Implementación de referencia de la sociedad automatizada argentina (art. 14 del anteproyecto). Cómo una empresa operada por agentes de IA se crea, se registra, factura, paga impuestos y atiende clientes, usando ar-agents.",
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
