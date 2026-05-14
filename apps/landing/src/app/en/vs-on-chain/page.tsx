import type { Metadata } from "next";
import { VsOnChainContent } from "../../vs-on-chain/content";

export const metadata: Metadata = {
  title: "vs On-chain, ar-agents and $SAIRI are complementary tracks",
  description:
    "Explicit positioning against $SAIRI / WAGMI.law / Democracy Earth. We do not compete: ar-agents is civil-commercial-OSS for an Argentine AI-corp to operate under positive law. On-chain experiments are tokenised, without jurisdiction, without CUIT, a valid but different track.",
  alternates: {
    canonical: "https://ar-agents.ar/en/vs-on-chain",
    languages: {
      es: "https://ar-agents.ar/vs-on-chain",
      en: "https://ar-agents.ar/en/vs-on-chain",
    },
  },
  openGraph: {
    type: "article",
    title:
      "ar-agents vs on-chain experiments, complementary tracks",
    description:
      "Civil-commercial-OSS vs tokenised. Two tracks for Argentine AI corporations; neither rival nor replacement.",
    url: "https://ar-agents.ar/en/vs-on-chain",
  },
};

export default function EnVsOnChainPage() {
  return <VsOnChainContent lang="en" />;
}
