import type { Metadata } from "next";
import { VsOnChainContent } from "./content";

export const metadata: Metadata = {
  title: "vs On-chain, ar-agents y $SAIRI son pistas complementarias",
  description:
    "Posicionamiento explícito frente a $SAIRI / WAGMI.law / Democracy Earth. No competimos: ar-agents es civil-comercial-OSS para que una sociedad-IA argentina opere bajo derecho positivo. Los experimentos on-chain son tokenizados, sin jurisdicción, sin CUIT, otra pista válida pero distinta.",
  alternates: {
    canonical: "https://ar-agents.ar/vs-on-chain",
    languages: {
      es: "https://ar-agents.ar/vs-on-chain",
      en: "https://ar-agents.ar/en/vs-on-chain",
    },
  },
  openGraph: {
    type: "article",
    title:
      "ar-agents vs experimentos on-chain, pistas complementarias",
    description:
      "Civil-comercial-OSS vs tokenizado. Dos pistas para AI corporations argentinas; ni rival ni reemplazo.",
    url: "https://ar-agents.ar/vs-on-chain",
  },
};

export default function VsOnChainPage() {
  return <VsOnChainContent lang="es" />;
}
