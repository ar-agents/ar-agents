import { NextResponse } from "next/server";
import { loginCms, signTra, buildTraXml } from "@ar-agents/identity/wsaa";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Debug endpoint for the AFIP integration in serverless. Reports env-var
 * presence and shape, and reproduces the WSAA flow step-by-step with
 * detailed error context. Sensitive values never leak — only lengths and
 * first/last chars are exposed.
 *
 * GET /api/debug-afip
 */
export async function GET() {
  const certPem = process.env.AFIP_CERT_PEM;
  const keyPem = process.env.AFIP_KEY_PEM;
  const cuit = process.env.AFIP_CUIT_REPRESENTADO;
  const env = process.env.AFIP_ENV ?? "prod";

  const probe = {
    runtime: process.version,
    AFIP_ENV: env,
    AFIP_CUIT_REPRESENTADO_set: Boolean(cuit),
    AFIP_CERT_PEM: certPem
      ? {
          length: certPem.length,
          hasRealNewlines: certPem.includes("\n"),
          hasEscapedNewlines: certPem.includes("\\n"),
          startsWith: certPem.slice(0, 30),
          endsWith: certPem.slice(-30),
        }
      : { set: false },
    AFIP_KEY_PEM: keyPem
      ? {
          length: keyPem.length,
          hasRealNewlines: keyPem.includes("\n"),
          hasEscapedNewlines: keyPem.includes("\\n"),
          startsWith: keyPem.slice(0, 30),
          endsWith: keyPem.slice(-30),
        }
      : { set: false },
  };

  if (!certPem || !keyPem) {
    return NextResponse.json({ probe, error: "PEM env vars not set" });
  }

  // Step 1: Try buildTraXml
  let tra: string;
  try {
    tra = buildTraXml("ws_sr_padron_a13");
  } catch (err) {
    return NextResponse.json({
      probe,
      step: "buildTraXml",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8) : undefined,
    });
  }

  // Step 2: Try signTra
  try {
    signTra(tra, certPem, keyPem);
  } catch (err) {
    return NextResponse.json({
      probe,
      step: "signTra",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8) : undefined,
    });
  }

  // Step 3: Full loginCms
  try {
    const ta = await loginCms({
      service: "ws_sr_padron_a13",
      certPem,
      keyPem,
      env: env as "homo" | "prod",
    });
    return NextResponse.json({
      probe,
      step: "loginCms",
      success: true,
      taExpires: new Date(ta.expirationTimeMs).toISOString(),
      tokenLength: ta.token.length,
      signLength: ta.sign.length,
    });
  } catch (err) {
    return NextResponse.json({
      probe,
      step: "loginCms",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8) : undefined,
    });
  }
}
