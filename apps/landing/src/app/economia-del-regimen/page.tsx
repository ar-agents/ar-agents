import type { Metadata } from "next";
import { NOINDEX } from "../noindex";
import { EconomiaContent } from "./content";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Costos de constitución y operación · ar-agents",
  description:
    "Nota de referencia sobre los costos de constituir y operar una sociedad automatizada en Argentina. Para los planes vigentes, ver la página de precios.",
  alternates: {
    canonical: "https://ar-agents.ar/economia-del-regimen",
    languages: {
      es: "https://ar-agents.ar/economia-del-regimen",
      en: "https://ar-agents.ar/en/regime-economics",
    },
  },
};

export default function EconomiaPage() {
  return <EconomiaContent lang="es" />;
}
