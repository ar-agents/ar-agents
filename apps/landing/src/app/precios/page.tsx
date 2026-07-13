import type { Metadata } from "next";
import { PreciosContent } from "./content";

export const metadata: Metadata = {
  title: "Precios",
  description:
    "Crear, deployar y operar tu sociedad automatizada es gratis. Cuando empieza a facturar, pasás a precio por uso. Sin suscripciones, sin asientos, sin cargos fijos.",
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
