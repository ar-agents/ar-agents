import type { Metadata } from "next";
import { IdentityClient } from "./identity-client";

export const metadata: Metadata = {
  title: "Verify your agent · get a public identity + badge · ar-agents",
  description:
    "Give any autonomous agent a verifiable identity. Publish one signed JSON at your origin, or paste an address and signature. Get a public profile, an embeddable verified badge, and a listing in the open RFC-002 discovery format. We never hold your key.",
  alternates: { canonical: "https://ar-agents.ar/identity" },
  openGraph: {
    title: "Verify your agent · get a public identity + badge",
    description:
      "One signed JSON, or an address plus a signature. Public profile, verified badge, open registry listing. Trust-minimized: we never hold your key.",
    url: "https://ar-agents.ar/identity",
    type: "article",
  },
};

export default function IdentityPage() {
  return <IdentityClient />;
}
