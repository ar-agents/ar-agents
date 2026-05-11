/**
 * GET /api/rfc-003-envelope?sessionId={id}&counterpart={url}
 *
 * Generates an RFC-003 cross-jurisdictional audit envelope for the
 * given session. Returns the envelope JSON that another jurisdiction's
 * agent-entity can import to verify the AR sociedad's claims.
 *
 * The envelope wraps the session's RFC-004 entries with RFC-003 issuer
 * metadata + optional externalReferences linking to a counterpart.
 *
 * Edge runtime. Used by /walkthrough, /examples recipe 21, and as a
 * concrete demo of RFC-003 working end-to-end.
 */

import { NextResponse } from "next/server";
import { isSessionIdValid, readAudit } from "@/lib/audit";

export const runtime = "nodejs";

const SITE = "https://ar-agents.vercel.app";

const ISSUER_AR = {
  jurisdiction: "AR" as const,
  entityId: "ar-sociedad:20-41758101-5",
  evidenceCustodyUrl: `${SITE}/api/play/audit/{sessionId}?verify=1`,
  publicKey: {
    kty: "oct",
    alg: "HS256",
    note: "RFC-004 v1 uses symmetric HMAC. Public-key verification via challenge-response per RFC-004 § 5.",
  },
};

interface Envelope {
  $schema: string;
  issuer: typeof ISSUER_AR;
  sessionId: string;
  entries: unknown[];
  externalReferences: Array<{
    counterpartEntityId: string;
    counterpartSessionId: string;
    counterpartEvidenceUrl?: string;
    linkType: "ap2-mandate" | "acp-checkout" | "mcp" | "manual";
    linkId: string;
  }>;
  issuedAt: string;
  expiresAt: string;
}

function expiresInDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const sessionId = (searchParams.get("sessionId") || "demo-public-ar-001").trim();
  const counterpart = (searchParams.get("counterpart") || "").trim();
  const counterpartSession = (searchParams.get("counterpartSession") || "").trim();
  const linkType = (searchParams.get("linkType") || "manual").trim() as Envelope["externalReferences"][0]["linkType"];
  const linkId = (searchParams.get("linkId") || "").trim();

  if (!isSessionIdValid(sessionId)) {
    return NextResponse.json(
      { error: "Invalid sessionId. Pattern: ^[A-Za-z0-9_-]{8,64}$" },
      { status: 400 },
    );
  }

  const entries = await readAudit(sessionId);

  const externalReferences: Envelope["externalReferences"] = [];
  if (counterpart && counterpartSession) {
    externalReferences.push({
      counterpartEntityId: counterpart,
      counterpartSessionId: counterpartSession,
      counterpartEvidenceUrl: counterpartSession.startsWith("http") ? counterpartSession : undefined,
      linkType,
      linkId: linkId || "(unspecified)",
    });
  }

  const envelope: Envelope = {
    $schema: `${SITE}/schemas/cross-jurisdiction-audit.v1.json`,
    issuer: ISSUER_AR,
    sessionId,
    entries,
    externalReferences,
    issuedAt: new Date().toISOString(),
    expiresAt: expiresInDays(30),
  };

  return NextResponse.json(envelope, {
    headers: {
      "cache-control": "public, max-age=30, stale-while-revalidate=300",
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `inline; filename="rfc-003-envelope-${sessionId}.json"`,
    },
  });
}
