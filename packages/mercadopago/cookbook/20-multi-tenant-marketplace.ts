/**
 * Recipe 20 — Multi-tenant marketplace spawning vendor sociedades-IA.
 *
 * # Pattern
 *
 * A platform (think: Tienda Nube, Mercado Shops, an SaaS marketplace)
 * onboards vendors who each need a thin AR-side legal entity to operate
 * within Argentina's jurisdiction. Pre-sociedad-IA, this was a manual
 * escribono job per vendor. With `@ar-agents/incorporate`, the platform
 * can spawn a fresh sociedad-IA spec on-demand at vendor sign-up — one
 * API call, the vendor's deploy URL is materialized, the platform
 * tracks the audit log per tenant.
 *
 * # When to use
 *
 * - Vertical SaaS where each vendor needs their own AR fiscal identity
 *   (factura emission under their CUIT, not the platform's).
 * - Marketplaces that scale to hundreds of vendors and can't manually
 *   coordinate escribano + contador per spawn.
 * - Cross-jurisdictional plays: a USA platform onboarding AR sellers who
 *   need a properly-incorporated sociedad to receive Mercado Pago.
 *
 * # Architecture
 *
 *      Platform                       /api/auto-incorporate
 *      ┌──────────┐    POST            ┌────────────────┐
 *      │ vendor   │  ─────────────▶    │ ar-agents      │
 *      │ signup   │  with vendor       │ generates spec │
 *      │ flow     │  details + a       │ + signs audit  │
 *      └──────────┘  per-vendor        │ entry under    │
 *           │        sessionId         │ vendor's id    │
 *           ▼                          └────────────────┘
 *      ┌──────────┐                           │
 *      │ Vercel   │  one-click deploy URL ◀───┘
 *      │ deploy   │
 *      └──────────┘
 *           │
 *           ▼
 *      ┌──────────┐    GET /api/play/audit/{tenantId}?verify=1
 *      │ ops      │  ◀──────────────────────────────────────┐
 *      │ dash     │                                         │
 *      └──────────┘                                         │
 *           │                                               │
 *           ▼ (recipe 19 cron)                              │
 *      compliance digest per tenant ──────────────────────┘
 *
 * # Idempotency
 *
 * Calling /api/auto-incorporate with the same input + sessionId twice
 * is idempotent on the spec output but writes two audit entries (one per
 * call). For exact-once semantics, dedupe on the platform side keyed by
 * (vendor_id, sociedad_denominacion). The audit log will show both
 * attempts which is the more honest signal anyway.
 *
 * # Edge Runtime
 *
 * Yes — the @ar-agents/incorporate client is fetch-only.
 */

import {
  incorporate,
  fetchAudit,
  type IncorporateInput,
  type IncorporateSuccess,
} from "@ar-agents/incorporate";

// ─────────────────────────────────────────────────────────────────────────────
// Platform's vendor model
// ─────────────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string; // platform's internal vendor id
  legalName: string;
  representanteName: string;
  representanteCuit: string;
  contactEmail: string;
  /** What the vendor sells. Used as the seed for objeto social. */
  category: "software" | "services" | "products" | "ecommerce";
  expectedMonthlyRevenueArs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawn a sociedad-IA for a vendor at sign-up
// ─────────────────────────────────────────────────────────────────────────────

const OBJETO_BY_CATEGORY: Record<Vendor["category"], string> = {
  software:
    "Desarrollo y comercialización de software propio para empresas y consumidores en Argentina, incluyendo pero no limitándose a aplicaciones web, móviles y servicios cloud.",
  services:
    "Prestación de servicios profesionales digitales (consultoría, desarrollo, marketing, atención al cliente) a empresas y consumidores en territorio argentino.",
  products:
    "Comercialización mayorista y minorista de productos físicos y digitales propios y de terceros, incluyendo importación, almacenamiento, marketing y logística en Argentina.",
  ecommerce:
    "Operación de tiendas online y marketplaces para la venta de productos y servicios al consumidor final argentino, incluyendo procesamiento de pagos y logística.",
};

/**
 * The platform's tenantId for this vendor's sociedad-IA. Becomes the
 * sessionId for the entire forensic timeline (incorporation + ongoing
 * tool calls). Pick something stable + opaque — UUID v4 or a hashed
 * concatenation of vendor_id + a per-platform secret.
 */
function tenantSessionIdFor(vendor: Vendor): string {
  // For the cookbook, derive deterministically. In production, prefer
  // crypto.randomUUID() per tenant to avoid leaking enumerable ids.
  return `tenant-${vendor.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 56)}`;
}

export async function spawnVendorSociedad(vendor: Vendor): Promise<IncorporateSuccess> {
  const sessionId = tenantSessionIdFor(vendor);

  // Pieza selection driven by vendor profile.
  const piezas: IncorporateInput["piezas"] = [
    "identity",
    "gde-tad",
    "mercadopago",
    "banking",
    "facturacion",
    "boletin-oficial",
    "igj",
  ];
  if (vendor.category === "ecommerce" || vendor.category === "products") {
    piezas.push("shipping");
  }
  if (vendor.expectedMonthlyRevenueArs > 1_000_000) {
    // Large-revenue tenants need WhatsApp customer-comms + ACP for LLM-buyer
    // checkout. Smaller tenants can stay lean.
    piezas.push("whatsapp", "agentic-commerce-bridge", "ap2");
  }

  // Capital social: SAS minimum is 100k. Bump for large-revenue vendors so
  // BCRA and downstream banks don't flag the disparity later.
  const capitalSocial =
    vendor.expectedMonthlyRevenueArs > 1_000_000 ? 500_000 : 200_000;

  const input: IncorporateInput = {
    denominacion: `${vendor.legalName} SAS`,
    tipo: "SAS", // SOCIEDAD-IA when the regime ships
    capitalSocial,
    objeto: OBJETO_BY_CATEGORY[vendor.category],
    representante: {
      nombre: vendor.representanteName,
      cuit: vendor.representanteCuit,
    },
    emailContacto: vendor.contactEmail,
    piezas,
    sessionId,
  };

  const result = await incorporate(input);

  if (!result.ok) {
    // Pre-flight failure — surface the findings + reject the signup.
    const errors = result.validation.findings
      .filter((f) => f.severity === "error")
      .map((f) => `${f.field}: ${f.message}`);
    throw new Error(
      `Vendor signup rejected at IGJ pre-flight: ${errors.join("; ")}`,
    );
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform's spawn flow: handle a fresh signup
// ─────────────────────────────────────────────────────────────────────────────

interface SignupRecord {
  vendorId: string;
  tenantSessionId: string;
  slug: string;
  deployUrl: string;
  auditDashboardUrl: string;
  auditVerifyUrl: string;
  badgeSvgUrl: string;
  createdAt: string;
}

/**
 * Persist this in the platform's vendor table (Postgres / KV / whatever).
 * The badge SVG URL is what you embed in the vendor's profile page so any
 * visitor sees their "verified · N/M" forensic-clean status.
 */
function recordFor(
  vendor: Vendor,
  result: IncorporateSuccess,
): SignupRecord {
  return {
    vendorId: vendor.id,
    tenantSessionId: result.audit.sessionId,
    slug: result.sociedad.slug,
    deployUrl: result.deploy.oneClickUrl,
    auditDashboardUrl: result.audit.dashboardUrl,
    auditVerifyUrl: result.audit.verifyUrl,
    badgeSvgUrl: `https://ar-agents.vercel.app/api/badge/${result.audit.sessionId}`,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodic compliance digest per tenant (recipe 19 in a fan-out loop)
// ─────────────────────────────────────────────────────────────────────────────

interface TenantHealth {
  vendorId: string;
  totalEvents: number;
  tampered: number;
  hmacWired: boolean;
  alert: string | null;
}

export async function platformComplianceSweep(
  records: SignupRecord[],
): Promise<TenantHealth[]> {
  const results: TenantHealth[] = [];
  for (const r of records) {
    const audit = (await fetchAudit(r.tenantSessionId, { verify: true })) as {
      count: number;
      verification?: { tampered: number; verified: number; total: number; hmacWired: boolean };
    };
    const v = audit.verification ?? { tampered: 0, verified: 0, total: 0, hmacWired: false };
    let alert: string | null = null;
    if (!v.hmacWired) alert = "HMAC not wired in deploy — log unverified.";
    else if (v.tampered > 0)
      alert = `Tampering detected on tenant ${r.vendorId}: ${v.tampered} entries.`;
    results.push({
      vendorId: r.vendorId,
      totalEvents: audit.count,
      tampered: v.tampered,
      hmacWired: v.hmacWired,
      alert,
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Example: signup + initial audit verify
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. New vendor signs up on the platform.
  const vendor: Vendor = {
    id: "v_42",
    legalName: "Berreta Software",
    representanteName: "Pérez, Juan",
    representanteCuit: "20-12345678-9",
    contactEmail: "ops@berreta.example",
    category: "software",
    expectedMonthlyRevenueArs: 800_000,
  };

  // 2. Spawn the sociedad-IA spec.
  const result = await spawnVendorSociedad(vendor);
  const record = recordFor(vendor, result);

  console.log("Vendor onboarded:", record);

  // 3. Verify the signup audit entry was actually written + signed.
  const sweep = await platformComplianceSweep([record]);
  console.log("Initial compliance sweep:", sweep);

  // 4. Embed the badge in the vendor's profile page in the platform UI.
  console.log("Badge URL for vendor profile:", record.badgeSvgUrl);
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("Recipe 20 failed:", err);
    process.exit(1);
  });
}

export { main };
