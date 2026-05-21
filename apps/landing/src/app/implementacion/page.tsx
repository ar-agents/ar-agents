import type { Metadata } from "next";
import { ImplementacionContent } from "./content";

export const metadata: Metadata = {
  title: "Implementación de referencia para sociedades de IA · ar-agents",
  description:
    "Documento técnico para el equipo redactor del proyecto de ley de Sociedades de Inteligencia Artificial. Arquitectura sobre estándares abiertos, cinco cláusulas operables sugeridas, respuesta a las objeciones jurídicas públicas. MIT, abierto, citable.",
  alternates: {
    canonical: "https://ar-agents.ar/implementacion",
  },
  openGraph: {
    type: "article",
    title:
      "Implementación de referencia para sociedades de IA",
    description:
      "Arquitectura técnica, código operable, cláusulas sugeridas para el proyecto de ley. MIT, abierto, listo para citación oficial.",
    url: "https://ar-agents.ar/implementacion",
  },
};

export default function ImplementacionPage() {
  return <ImplementacionContent />;
}
