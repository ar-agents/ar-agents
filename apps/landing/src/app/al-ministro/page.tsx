import type { Metadata } from "next";
import { AlMinistroContent } from "./content";

export const metadata: Metadata = {
  title: "Carta abierta al ministro · ar-agents",
  description:
    "Carta abierta al Ministro Federico Sturzenegger sobre la implementación técnica del régimen de sociedades-IA. Reference implementation MIT, 33 paquetes en npm, 221 herramientas, AAIF working-group propuesto. Listo para usar el día que la ley salga.",
  alternates: {
    canonical: "https://ar-agents.ar/al-ministro",
    languages: {
      es: "https://ar-agents.ar/al-ministro",
      en: "https://ar-agents.ar/en/to-the-minister",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Carta abierta al Ministro Sturzenegger, La capa técnica de las sociedades-IA ya está escrita",
    description:
      "33 paquetes npm, MIT, 221 herramientas, 16 de 17 piezas operativas cubiertas. Listo para el día que la ley salga.",
    url: "https://ar-agents.ar/al-ministro",
  },
};

export default function AlMinistroPage() {
  return <AlMinistroContent lang="es" />;
}
