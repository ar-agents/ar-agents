import type { Metadata } from "next";
import Link from "next/link";
import { ShareClient } from "./share-client";

export const metadata: Metadata = {
  title: "/share · prepared social + email templates · ar-agents",
  description:
    "Copy-paste-ready social media drafts, email templates, and outreach copy for journalists, legislators, and regulators interested in /arg. All assets are CC-BY-4.0 — use freely, attribute the spec.",
  alternates: { canonical: "https://ar-agents.vercel.app/share" },
};

export default function SharePage() {
  return <ShareClient />;
}
