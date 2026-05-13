/**
 * Recipe 18 — USA-LLC agent self-incorporates an AR sociedad-IA.
 *
 * The end-to-end pattern that the headline of `/sociedades-ia` makes a
 * concrete claim about: a USA-incorporated agent (ClawBank-formed
 * Wyoming/Ohio LLC, doola Agentic LLC, Marshall Islands MIDAO) needs an
 * AR-resident operating layer for some of its activity. Until now this
 * was a manual escribano + contador job per spawn. Recipe 18 collapses
 * the manual layer to one programmatic call:
 *
 *   POST https://ar-agents.ar/api/auto-incorporate
 *
 * via the `@ar-agents/incorporate` client. The output is everything the
 * USA-LLC agent's deploy pipeline needs to spin up the AR side:
 *
 *   - package.json + lib/agent.ts + .env.example + README.md
 *   - Vercel one-click deploy URL pointing at apps/sociedad-ia-starter
 *   - Env-var manifest the agent must source from its secret store
 *   - Legal + operational checklist (ARCA cert, MP token, Meta verify,
 *     IGJ inscription via TAD)
 *   - Signed audit-log reference — the entire incorporation request is
 *     a forensic event under RFC-001 § 9.2, queryable later
 *
 * # Why this recipe matters
 *
 * RFC-001 § 7 sketches "cross-jurisdictional agent commerce". The USA
 * side has its own corporate-form vehicles for AI-only entities (Wyoming
 * DAO LLC, Marshall Islands MIDAO). What it doesn't have natively is a
 * way to operate inside the AR jurisdiction — emit factura electrónica,
 * receive Mercado Pago, monitor Boletín Oficial, pay monotributo. Recipe
 * 18 is how that side fills.
 *
 * # The one-line pitch
 *
 * `pnpm add @ar-agents/incorporate` → `await incorporate({...})` →
 * AR sociedad-IA spec ready in 100ms (then the human-pending bits:
 * ARCA cert wait, IGJ inscription wait, Meta verification wait — all
 * upstream timers we don't control).
 *
 * # Edge Runtime
 *
 * The client is fetch-only, zero dependencies. Runs on Vercel Edge,
 * Cloudflare Workers, Deno, browsers. No `node:*` imports.
 */

import { incorporate, fetchAudit, type IncorporateInput } from "@ar-agents/incorporate";

// ─── 1. The USA-LLC agent gathers the AR sociedad's parameters ─────────────
//
// Often these come from the human deal-maker once (corporate name + objeto)
// and the rest is mechanical. The `sessionId` is what ties this incorporation
// request to subsequent operational events under one forensic timeline.

const sessionId = crypto.randomUUID();

const input: IncorporateInput = {
  // Public corporate name. IGJ rejects reserved words (Nacional / Estatal /
  // Gobierno / Estado / Oficial). The pre-flight at the server side will
  // catch them; surface the validation findings to the human if any.
  denominacion: "ClawBank-AR Operations SAS",

  // SOCIEDAD-IA is the eventual target — but until the AR regime is
  // sancionado (estimated H1 2027), use SAS so the operator runs under the
  // RFC-001 § 3.1 three-layer liability framework with a human representante.
  tipo: "SAS",

  // Capital social in ARS. SAS minimum is 100k. Set higher if the operator
  // expects to handle larger incoming flows (banks may scrutinize disparities
  // between capital and transaction volume).
  capitalSocial: 200_000,

  // Objeto social. IGJ rejects generic phrasing; be specific. 20-2000 chars.
  objeto:
    "Operación de servicios digitales y desarrollo de software propio para clientes argentinos, en representación de la entidad madre USA-incorporada bajo el marco RFC-001 § 7 (cross-jurisdictional agent commerce).",

  // Human representante for the AR-side legal facade per RFC-001 § 3.1. In
  // production the orchestrator pulls this from its operator-of-record store
  // (e.g., the escribano contracted as the AR-presence layer).
  representante: {
    nombre: "Pérez, Juan",
    cuit: "20-12345678-9",
  },
  emailContacto: "ops+ar@usa-llc.example",

  // Pieza selection. The auto-incorporate endpoint always merges in the
  // required set (identity, gde-tad, mercadopago, banking, facturacion).
  // Add what this particular operator needs:
  piezas: [
    "identity",
    "gde-tad",
    "mercadopago",
    "banking",
    "facturacion",
    "boletin-oficial",
    "igj",
    "whatsapp",
    "ap2", // for AP2 mandate verification on incoming agent commerce
    "agentic-commerce-bridge", // to expose ACP-compliant checkout to ChatGPT/Claude buyers
  ],

  // The session id chains every event under one forensic timeline.
  sessionId,
};

// ─── 2. Call the endpoint ──────────────────────────────────────────────────

async function main() {
  const result = await incorporate(input);

  if (!result.ok) {
    // Validation failure (HTTP 422). The server caught a structural issue
    // (reserved word, capital below minimum, malformed CUIT, etc). The agent
    // should surface findings to the human and retry with a fix.
    console.error("Incorporation rejected at pre-flight:");
    for (const f of result.validation.findings) {
      console.error(`  [${f.severity}] ${f.field}: ${f.message}`);
    }
    process.exit(1);
  }

  // ─── 3. Materialize the four generated files into the deploy repo ─────
  //
  // The output is plain strings — the USA-LLC's deploy pipeline writes them
  // to a fresh GitHub repo, then triggers the Vercel deploy. Below we just
  // print to stdout for the recipe's purposes.

  console.log("Sociedad:", result.sociedad);
  console.log();
  console.log("Generated files:");
  for (const path of Object.keys(result.config) as Array<
    keyof typeof result.config
  >) {
    console.log(`\n--- ${path} (${result.config[path].length} chars) ---`);
    console.log(result.config[path].slice(0, 200) + "…");
  }

  // ─── 4. Surface the deploy URL to the human (or auto-deploy) ──────────
  //
  // The Vercel one-click clone URL is pre-filled with the right env-var
  // slots. In production: pipe to the orchestrator's deploy runner. For
  // a manual flow: print the URL and let the human click.

  console.log("\nDeploy:", result.deploy.oneClickUrl);

  // ─── 5. Hand off the operational checklist to the human ───────────────
  //
  // These are the human-pending steps: ARCA cert wait, MP creds, Meta
  // business verify, IGJ inscription via TAD. The agent can't shortcut
  // them — they're upstream gov/private-co timers — but it can emit them
  // all at once so nothing falls through the cracks.

  console.log("\nChecklist (human-pending):");
  for (const [i, step] of result.checklist.entries()) {
    console.log(`  ${i + 1}. ${step}`);
  }

  // ─── 6. Log + verify the forensic event ───────────────────────────────
  //
  // The incorporation request is itself a tool call recorded in the audit
  // log. Anyone (regulator, journalist, downstream agent) can later hit
  //   /api/play/audit/{sessionId}?verify=1
  // and confirm the entry is HMAC-clean. This is what makes RFC-001 § 9.2's
  // claim that the log is "legally probative" mechanically true.

  console.log("\nAudit:");
  console.log("  sessionId:", result.audit.sessionId);
  console.log("  backend:", result.audit.backend);
  console.log("  hmac:", result.audit.entry.hmac?.slice(0, 30) + "…");
  console.log("  dashboard:", result.audit.dashboardUrl);

  // Optional: re-verify the entry the agent just wrote. Useful if the orchestrator
  // wants to assert tamper-free state before proceeding to step 7+.
  const audit = (await fetchAudit(sessionId, { verify: true })) as {
    verification?: { tampered: number; verified: number; total: number };
  };
  if (audit.verification && audit.verification.tampered > 0) {
    throw new Error(
      `Audit log shows ${audit.verification.tampered} tampered entries — abort`,
    );
  }
  console.log("\nVerified clean:", audit.verification);
}

main().catch((err) => {
  console.error("Recipe 18 failed:", err);
  process.exit(1);
});

// ─── 7. What happens after ─────────────────────────────────────────────────
//
// Once the AR side is provisioned, the USA-LLC agent and the AR sociedad-IA
// can transact under a single trust contract:
//
//   - The USA agent calls the AR sociedad's /api/agent endpoint with mandate
//     proof (AP2 § 4 — see @ar-agents/ap2 cookbook recipe 02 — multi-hop).
//   - The AR sociedad executes within its jurisdiction (factura emission,
//     MP cobro, BCRA credit checks, etc).
//   - Every tool call lands in the same audit log (chain via the same
//     sessionId).
//   - At end-of-month, the USA-LLC's accountant + the AR sociedad's contador
//     settle the inter-entity ledger off the audit log's signed events.
//
// This is the reference implementation of cross-jurisdictional agent
// commerce. The whole stack — from the npm package this recipe imports to
// the audit log it leaves behind — is MIT-licensed and SLSA-provenanced.
//
// `agent self-incorporates → operates → settles` in three contractual hops,
// no escribono in the loop after step 1.
