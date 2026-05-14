import type { Metadata } from "next";
import { CloudContent } from "../../cloud/content";

export const metadata: Metadata = {
  title: "ar-agents Cloud · hosted platform + government tier · ar-agents",
  description:
    "The code is MIT and always will be. ar-agents Cloud is the hosted version with signed audit log, regulator-ready dashboards, AR data residency, and contractual SLA. For AI corporations that prefer not to operate the infrastructure themselves.",
  alternates: {
    canonical: "https://ar-agents.ar/en/cloud",
    languages: {
      es: "https://ar-agents.ar/cloud",
      en: "https://ar-agents.ar/en/cloud",
    },
  },
  openGraph: {
    type: "article",
    title:
      "ar-agents Cloud, hosted platform over the open-source toolkit",
    description:
      "Self-host free. Studio for devs. Government for the state. Bespoke for large companies.",
    url: "https://ar-agents.ar/en/cloud",
  },
};

export default function EnCloudPage() {
  return <CloudContent lang="en" />;
}
