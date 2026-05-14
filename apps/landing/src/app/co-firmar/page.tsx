import type { Metadata } from "next";
import { CoFirmarContent } from "./content";

export const metadata: Metadata = {
  title: "Co-firmar un RFC · ar-agents",
  description:
    "Invitación abierta a juristas, académicos, especialistas AAIP y expertos en derecho corporativo argentino: sumá tu autoría a los RFCs ar-agents. CC-BY-4.0, sin compromiso comercial, su nombre queda en cita citable.",
  alternates: {
    canonical: "https://ar-agents.ar/co-firmar",
    languages: {
      es: "https://ar-agents.ar/co-firmar",
      en: "https://ar-agents.ar/en/co-sign",
    },
  },
};

export default function CoFirmarPage() {
  return <CoFirmarContent lang="es" />;
}
