/**
 * Recipe 24 — Sociedad-IA disaster recovery (export + restore via
 * /api/auto-incorporate).
 *
 * # Pattern
 *
 * A sociedad-IA is code + secrets + audit log. If any layer fails — the
 * Vercel project gets deleted, the GitHub repo is locked, the operator's
 * laptop dies — the operator needs a documented restore path.
 *
 * Recipe 24 is the export-restore cycle:
 *
 *   1. Nightly export: serialize the sociedad's configuration (env-var
 *      names list, deployed Vercel project metadata, audit-log session
 *      ids, AFIP cert fingerprint) to a portable JSON.
 *
 *   2. Disaster: anywhere in the stack fails.
 *
 *   3. Restore: feed the exported JSON to a fresh /api/auto-incorporate
 *      call (with the same denominacion + tipo + capital + objeto +
 *      sessionId), get the generated source files + new Vercel deploy
 *      URL, re-paste env vars, redeploy.
 *
 * The sessionId continuity is the load-bearing piece: by passing the
 * same audit-log session id to the re-incorporation, the forensic
 * timeline of the original sociedad continues unbroken across the
 * disaster. Regulators see one chain of events, not two.
 *
 * # When to use
 *
 * - Multi-tenant marketplace running many sociedades (recipe 20). Each
 *   tenant gets nightly export; restore is per-tenant.
 * - Long-running sociedad with regulatory exposure where breaking the
 *   audit log chain would create compliance trouble.
 * - Any production deployment where the operator wants offline copies
 *   of the configuration outside Vercel's control plane.
 *
 * # Edge Runtime
 *
 * The export side is Node.js (fs + filesystem export). The restore
 * side is fetch-based, runs anywhere. The audit-log session-id
 * continuity is the bridge.
 *
 * # What's NOT in the export
 *
 * - Secrets. AFIP_CERT_PEM, MERCADOPAGO_ACCESS_TOKEN, etc. live in your
 *   own secrets manager (1Password, Vault, AWS Secrets Manager) and
 *   stay there. The export references which env vars are needed (by
 *   name) but never their values.
 * - PII / customer data. The export is sociedad-config-only.
 * - The KV-stored audit log itself. Vercel KV has its own backup story;
 *   if you need cross-region audit-log durability, mirror to S3 with
 *   object lock per the open-question in /architecture/audit-log § 11.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { incorporate, fetchAudit, type IncorporateInput } from "@ar-agents/incorporate";

// ─────────────────────────────────────────────────────────────────────────────
// Export shape
// ─────────────────────────────────────────────────────────────────────────────

interface SociedadExport {
  $schema: string;
  exportedAt: string;
  schemaVersion: "1.0";

  /** The original sociedad parameters — recoverable in full. */
  sociedad: {
    denominacion: string;
    tipo: "SAS" | "SRL" | "SA" | "SOCIEDAD-IA";
    capitalSocial: number;
    objeto: string;
    representante?: { nombre: string; cuit: string };
    emailContacto?: string;
    piezas?: string[];
  };

  /**
   * The original audit-log session id. RESTORE feeds this back to
   * /api/auto-incorporate so the forensic timeline continues without
   * a break.
   */
  sessionId: string;

  /** Env-var names the sociedad needs to operate. Values come from the operator's secrets manager. */
  envVarsRequired: string[];

  /** Deployment metadata for the restore destination. */
  deployment: {
    framework: "nextjs";
    runtime: "vercel-edge" | "vercel-node" | "cloudflare-workers" | "deno-deploy";
    /** Where the source was last deployed. Pre-disaster reference only. */
    lastKnownProductionUrl?: string;
    /** For verification: how the sociedad's identity used to be proven. */
    afipCertFingerprintSha256?: string;
  };

  /** Audit-log snapshot at export time. Not authoritative — the live log is. */
  auditSnapshot: {
    totalEntries: number;
    lastEntryId: string | null;
    lastEntryTs: string | null;
    /** HMAC of the snapshot itself, signed by the exporter, for tamper detection on the export. */
    snapshotHmac?: string;
  };

  /** Free-form notes from the operator (e.g., "rotated MP token 2026-04-30"). */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export async function exportSociedad(args: {
  outFile: string;
  sociedad: SociedadExport["sociedad"];
  sessionId: string;
  envVarsRequired: string[];
  deployment: SociedadExport["deployment"];
  notes?: string;
}): Promise<SociedadExport> {
  // Pull the live audit log to snapshot its state at export time.
  const audit = (await fetchAudit(args.sessionId, { verify: false })) as {
    count: number;
    entries: Array<{ id: string; ts: string }>;
  };
  const lastEntry = audit.entries[audit.entries.length - 1];

  const exportObj: SociedadExport = {
    $schema:
      "https://ar-agents.ar/schemas/sociedad-export.v1.json",
    exportedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    sociedad: args.sociedad,
    sessionId: args.sessionId,
    envVarsRequired: args.envVarsRequired,
    deployment: args.deployment,
    auditSnapshot: {
      totalEntries: audit.count,
      lastEntryId: lastEntry?.id ?? null,
      lastEntryTs: lastEntry?.ts ?? null,
      // Optional: sign the snapshot itself with the operator's separate
      // export-signing key, distinct from AUDIT_HMAC_SECRET. Adds tamper
      // detection to the export file in transit.
      snapshotHmac: undefined,
    },
    notes: args.notes,
  };

  // Write to disk.
  await fs.mkdir(path.dirname(args.outFile), { recursive: true });
  await fs.writeFile(args.outFile, JSON.stringify(exportObj, null, 2), "utf8");

  return exportObj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore
// ─────────────────────────────────────────────────────────────────────────────

interface RestoreResult {
  /** The fresh incorporation result. */
  incorporationOk: boolean;
  newDeployUrl: string;
  newAuditDashboardUrl: string;
  /** Reconciliation: does the new audit entry count match the export snapshot + 1 (for the restore event itself)? */
  reconciliation: {
    expectedMinTotal: number;
    actualTotal: number;
    sessionContinuity: "preserved" | "drift" | "broken";
  };
  /** Manual steps the operator still has to do (re-paste env vars, re-upload AFIP cert, etc). */
  manualSteps: string[];
}

export async function restoreSociedad(args: {
  exportFile: string;
}): Promise<RestoreResult> {
  // 1. Load the export.
  const raw = await fs.readFile(args.exportFile, "utf8");
  const exp = JSON.parse(raw) as SociedadExport;

  if (exp.schemaVersion !== "1.0") {
    throw new Error(
      `Unsupported export schema version: ${exp.schemaVersion}. This recipe handles 1.0.`,
    );
  }

  // 2. Call /api/auto-incorporate with the original sessionId so the
  //    audit log continues under the same forensic timeline.
  const incorporateInput: IncorporateInput = {
    denominacion: exp.sociedad.denominacion,
    tipo: exp.sociedad.tipo,
    capitalSocial: exp.sociedad.capitalSocial,
    objeto: exp.sociedad.objeto,
    sessionId: exp.sessionId, // ← continuity!
  };
  if (exp.sociedad.representante) {
    incorporateInput.representante = exp.sociedad.representante;
  }
  if (exp.sociedad.emailContacto) {
    incorporateInput.emailContacto = exp.sociedad.emailContacto;
  }
  if (exp.sociedad.piezas) {
    // Type-cast: incorporate() validates piezas server-side
    incorporateInput.piezas = exp.sociedad.piezas as IncorporateInput["piezas"];
  }

  const result = await incorporate(incorporateInput);

  if (!result.ok) {
    // Pre-flight failure — the original config no longer passes IGJ
    // pre-flight (regulations changed, denomination conflict, etc).
    // Surface the findings + abort.
    const errors = result.validation.findings
      .filter((f) => f.severity === "error")
      .map((f) => `${f.field}: ${f.message}`);
    return {
      incorporationOk: false,
      newDeployUrl: "",
      newAuditDashboardUrl: "",
      reconciliation: {
        expectedMinTotal: exp.auditSnapshot.totalEntries,
        actualTotal: -1,
        sessionContinuity: "broken",
      },
      manualSteps: [
        `Original sociedad config no longer passes IGJ pre-flight: ${errors.join("; ")}.`,
        "Review the export, adjust the failing fields, re-export, retry restore.",
      ],
    };
  }

  // 3. Re-fetch the audit log to verify the new restore event landed
  //    + the count is at least the snapshot count + 1 (the restore
  //    itself counts as a new entry).
  const audit = (await fetchAudit(exp.sessionId, { verify: false })) as {
    count: number;
    entries: Array<{ id: string; tool: string; ts: string }>;
  };
  const expectedMin = exp.auditSnapshot.totalEntries + 1;
  const continuity =
    audit.count >= expectedMin
      ? "preserved"
      : audit.count === exp.auditSnapshot.totalEntries
        ? "drift"
        : "broken";

  return {
    incorporationOk: true,
    newDeployUrl: result.deploy.oneClickUrl,
    newAuditDashboardUrl: result.audit.dashboardUrl,
    reconciliation: {
      expectedMinTotal: expectedMin,
      actualTotal: audit.count,
      sessionContinuity: continuity,
    },
    manualSteps: [
      "Click the new deploy URL → review the generated project → confirm import.",
      `Paste env vars from your secrets manager. Required: ${exp.envVarsRequired.join(", ")}.`,
      "Re-upload AFIP cert PEM + key PEM to Vercel env (AFIP_CERT_PEM, AFIP_KEY_PEM, AFIP_CUIT).",
      "Verify the new deploy serves the agent endpoint by running a smoke-test scenario from /play.",
      "Verify the audit log still shows pre-disaster entries at the dashboard URL.",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Example: nightly export + simulated restore
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2];

  if (cmd === "export") {
    const sessionId = process.argv[3];
    if (!sessionId) {
      console.error(
        "usage: pnpm tsx 24-sociedad-ia-disaster-recovery.ts export <sessionId>",
      );
      process.exit(1);
    }
    const result = await exportSociedad({
      outFile: `./backups/${sessionId}-${new Date().toISOString().slice(0, 10)}.json`,
      sociedad: {
        denominacion: "ACME-AI SAS",
        tipo: "SAS",
        capitalSocial: 200_000,
        objeto:
          "Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
      },
      sessionId,
      envVarsRequired: [
        "ANTHROPIC_API_KEY",
        "AFIP_CERT_PEM",
        "AFIP_KEY_PEM",
        "AFIP_CUIT",
        "MERCADOPAGO_ACCESS_TOKEN",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "AUDIT_HMAC_SECRET",
      ],
      deployment: {
        framework: "nextjs",
        runtime: "vercel-edge",
        lastKnownProductionUrl: "https://acme-ai-sas.vercel.app",
      },
      notes: "Nightly export. Operator: ACME-AI SAS. Contador signs off monthly.",
    });
    console.log("Exported snapshot:");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "restore") {
    const file = process.argv[3];
    if (!file) {
      console.error(
        "usage: pnpm tsx 24-sociedad-ia-disaster-recovery.ts restore <exportFile>",
      );
      process.exit(1);
    }
    const result = await restoreSociedad({ exportFile: file });
    console.log("Restore result:");
    console.log(JSON.stringify(result, null, 2));
    if (!result.incorporationOk) {
      process.exit(1);
    }
    console.log("\nManual steps:");
    for (const s of result.manualSteps) console.log(`  - ${s}`);
    return;
  }

  console.error(
    "usage:\n  export <sessionId>\n  restore <exportFile>",
  );
  process.exit(1);
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("Recipe 24 failed:", err);
    process.exit(1);
  });
}

export { main };
