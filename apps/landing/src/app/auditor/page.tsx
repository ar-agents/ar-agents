import type { Metadata } from "next";
import { AuditorContent } from "./content";

export const metadata: Metadata = {
  title: "/auditor · para reguladores, periodistas, legisladores · ar-agents",
  description:
    "Una sociedad automatizada argentina opera bajo ar-agents. Cada llamada deja un registro firmado HMAC-SHA256 que cualquier auditor puede verificar sin pedirle al operador su clave. Esta página resume el proceso completo en una sola hoja imprimible.",
  alternates: {
    canonical: "https://ar-agents.ar/auditor",
    languages: {
      es: "https://ar-agents.ar/auditor",
      en: "https://ar-agents.ar/en/auditor",
    },
  },
  openGraph: {
    title: "/auditor · para reguladores, periodistas, legisladores",
    description:
      "Una sociedad automatizada argentina opera bajo ar-agents. Cada llamada deja un registro firmado HMAC-SHA256 que cualquier auditor puede verificar sin pedirle al operador su clave.",
    url: "https://ar-agents.ar/auditor",
    type: "article",
    locale: "es_AR",
  },
};

export default function AuditorPage() {
  return <AuditorContent lang="es" />;
}
