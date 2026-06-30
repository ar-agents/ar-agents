import type { Metadata } from "next";
import { NOINDEX } from "../noindex";
import { JurisdiccionesContent } from "./content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Jurisdicciones comparadas · ar-agents",
  description:
    "Comparativa honesta: cómo Wyoming DAO LLC, Marshall Islands MIDAO, Estonia e-Residency, Singapore VCC + AI Verify resuelven identidad, firma, registro y auditoría de entidades algorítmicas, y qué primitivas argentinas ar-agents propone como análogo. Para legisladores, periodistas, asesores.",
  alternates: {
    canonical: "https://ar-agents.ar/jurisdicciones",
    languages: {
      es: "https://ar-agents.ar/jurisdicciones",
      en: "https://ar-agents.ar/en/jurisdictions",
    },
  },
  openGraph: {
    type: "article",
    title:
      "Jurisdicciones comparadas, sociedades-IA en buena compañía internacional",
    description:
      "Wyoming, Estonia, Marshall Islands, Singapore: cómo cada jurisdicción resuelve identidad + firma + registro + auditoría de entidades algorítmicas. Y qué primitivas argentinas ar-agents propone como análogo.",
    url: "https://ar-agents.ar/jurisdicciones",
  },
};

export default function JurisdiccionesPage() {
  return <JurisdiccionesContent lang="es" />;
}
