/**
 * `POST /api/play/tamper-demo` — educational tampering demonstration.
 *
 * The point of this endpoint is to make the forensic claim of RFC-001
 * § 9.2 viscerally provable in a meeting. It does NOT touch any real
 * audit log — it constructs a synthetic entry, signs it, then applies
 * a user-chosen mutation to demonstrate that the HMAC verification
 * mechanically catches the change.
 *
 * Request body: `{ mutation?: "tool" | "input" | "output" | "ts" }`
 * Response: `{ original, originalVerified, tampered, tamperedVerified, hmacWired }`
 *
 * This is read-only with respect to the actual audit log; safe to call
 * from anywhere, no rate-limit needed beyond what the platform gives us.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type AuditEntry,
  signEntry,
  verifyEntry,
} from "@/lib/audit";

export const runtime = "nodejs";

const Body = z.object({
  mutation: z
    .enum(["tool", "input", "output", "ts"])
    .optional()
    .default("tool"),
});

const SYNTH_TS = "2026-05-09T15:00:00.000Z";
const BASE_ENTRY: Omit<AuditEntry, "hmac"> = {
  id: "tamper-demo-fixed-id",
  sessionId: "tamper-demo",
  ts: SYNTH_TS,
  tool: "validate_cuit",
  governance: "algorithm-only",
  input: { cuit: "30-12345678-9" },
  output: { valid: true, normalized: "30123456789", personType: "juridica" },
  durationMs: 1,
};

const MUTATIONS: Record<
  "tool" | "input" | "output" | "ts",
  (entry: AuditEntry) => { description: string; tampered: AuditEntry }
> = {
  tool: (entry) => ({
    description:
      "Reescribir el `tool` de `validate_cuit` a `mp_create_subscription` — un atacante quiere fingir que el agente cobró cuando en realidad solo validó.",
    tampered: { ...entry, tool: "mp_create_subscription" },
  }),
  input: (entry) => ({
    description: "Cambiar el CUIT consultado por otro distinto.",
    tampered: {
      ...entry,
      input: { cuit: "20-99999999-9" },
    },
  }),
  output: (entry) => ({
    description:
      "Modificar el resultado: cambiar `valid: true` por `valid: false` (o viceversa).",
    tampered: {
      ...entry,
      output: {
        ...((entry.output ?? {}) as Record<string, unknown>),
        valid: false,
      },
    },
  }),
  ts: (entry) => ({
    description:
      "Mover el timestamp 7 días hacia adelante para fabricar una operación posterior.",
    tampered: {
      ...entry,
      ts: new Date(Date.parse(entry.ts) + 7 * 86_400_000).toISOString(),
    },
  }),
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const mutation = parsed.data.mutation;
  const hmacWired = Boolean(process.env.AUDIT_HMAC_SECRET?.trim());

  // 1. Build the canonical "original" entry and sign it.
  const original: AuditEntry = {
    ...BASE_ENTRY,
    hmac: null,
  };
  original.hmac = await signEntry(original);

  // 2. Apply the chosen mutation. Crucially, we KEEP the original hmac so
  //    the verifier sees a signature that doesn't match the (mutated) body.
  const m = MUTATIONS[mutation](original);

  // 3. Verify both. The "original" should verify; the "tampered" should fail.
  const originalVerified = await verifyEntry(original);
  const tamperedVerified = await verifyEntry(m.tampered);

  return NextResponse.json(
    {
      hmacWired,
      mutation,
      mutationDescription: m.description,
      original,
      originalVerified,
      tampered: m.tampered,
      tamperedVerified,
      explanation: hmacWired
        ? "Al re-firmar la entrada original con el secret server-side y verificar contra la versión mutada, la firma no coincide. El tampering es mecánicamente detectable."
        : "AUDIT_HMAC_SECRET no está configurado — la firma vuelve null y la verificación queda sin contenido. En producción, set AUDIT_HMAC_SECRET (ver docs/launch/audit-log-setup.md).",
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-rfc001-section": "9.2",
      },
    },
  );
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/play/tamper-demo",
    method: "POST",
    description:
      "Educational tampering demo. POST {mutation: 'tool'|'input'|'output'|'ts'} (optional, default 'tool'). Returns the original signed entry + the tampered version + verification results for both. Read-only: does not modify any real audit log.",
    mutations: Object.keys(MUTATIONS),
  });
}
