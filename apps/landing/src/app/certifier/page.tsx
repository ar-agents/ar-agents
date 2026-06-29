import type { Metadata } from "next";
import { CertifierClient } from "./certifier-client";

export const metadata: Metadata = {
  title: "/certifier · verify any sociedad automatizada's RFC conformance · ar-agents",
  description:
    "Paste any base URL. The certifier fetches its public endpoints (well-known, audit-read, audit-verify, CSV, OpenAPI) + scores its conformance to RFC-002 + RFC-004 in seconds. No setup, no install, anyone can verify any sociedad automatizada's claims from one HTTP call.",
  alternates: { canonical: "https://ar-agents.ar/certifier" },
  openGraph: {
    title: "/certifier · verify any sociedad automatizada's RFC conformance",
    description:
      "Paste any base URL. Score 0-100 + per-check report. Anyone, anywhere, no setup.",
    url: "https://ar-agents.ar/certifier",
    type: "article",
  },
};

export default function CertifierPage() {
  return <CertifierClient />;
}
