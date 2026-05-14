import type { Metadata } from "next";
import { CloudContent } from "./content";

export const metadata: Metadata = {
  title: "ar-agents Cloud · hosted platform + government tier · ar-agents",
  description:
    "El código es MIT y siempre lo será. ar-agents Cloud es la versión hosteada con audit log firmado, dashboards regulator-ready, residencia de datos AR y SLA contractual. Para sociedades-IA que prefieren no operar la infraestructura por su cuenta.",
  alternates: {
    canonical: "https://ar-agents.ar/cloud",
    languages: {
      es: "https://ar-agents.ar/cloud",
      en: "https://ar-agents.ar/en/cloud",
    },
  },
  openGraph: {
    type: "article",
    title:
      "ar-agents Cloud, hosted platform sobre el toolkit open-source",
    description:
      "Self-host gratis. Studio para devs. Government para el Estado. Bespoke para sociedades grandes.",
    url: "https://ar-agents.ar/cloud",
  },
};

export default function CloudPage() {
  return <CloudContent lang="es" />;
}
