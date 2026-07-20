/**
 * Single source of truth for the published-package + canonical-tool counts shown
 * across the site. Surfaces used to drift (published-package counts said
 * 34/35/36/37/40; tool counts said 221/235/243).
 *
 * Every RENDERED (TSX) surface should import these constants. Static served files
 * that cannot import (public/*.md, public/.well-known/* cards) hand-maintain the
 * same numbers; agents.json is generated from the manifests (36 tool-bearing
 * packages + 252 tools). Keep all of them in sync when the counts change.
 *
 * Keep these in sync with reality:
 *   PUBLISHED_PACKAGES = packages/* dirs with a package.json + "private": false
 *     (`ls packages` minus python-incorporate, which is Python-only + unpublished).
 *   CANONICAL_TOOLS    = sum of tools across every packages/tools.manifest.json,
 *     identical to what /api/discovery + /.well-known/agents.json emit (252).
 *
 * agents.json's toolCount is generated from the manifests at build, so it is the
 * live cross-check for CANONICAL_TOOLS.
 *
 * 2026-07-13: added @ar-agents/cli (0.1.0, terminal on-ramp) and
 * @ar-agents/wallet-cdp (0.2.0, +2 tools) after their npm publish. 37 -> 39
 * packages, 243 -> 245 -> 252 tools (ap2 0 -> 7 after ai-sdk.ts parsing).
 */
/**
 * Every published @ar-agents/* package (packages/* dirs that are not
 * "private": true; python-incorporate is Python-only + unpublished).
 * /api/stats aggregates npm downloads over this list, so a missing name
 * silently drops that package from the public numbers.
 */
export const PUBLISHED_PACKAGE_NAMES = [
  "@ar-agents/aduana",
  "@ar-agents/agentic-commerce-bridge",
  "@ar-agents/anses",
  "@ar-agents/ap2",
  "@ar-agents/banking",
  "@ar-agents/banking-bcra",
  "@ar-agents/bind",
  "@ar-agents/boletin-oficial",
  "@ar-agents/cli",
  "@ar-agents/cnv-emisor",
  "@ar-agents/constancia",
  "@ar-agents/core",
  "@ar-agents/dnrpa",
  "@ar-agents/facturacion",
  "@ar-agents/fecred",
  "@ar-agents/firma-digital",
  "@ar-agents/gde-tad",
  "@ar-agents/identity",
  "@ar-agents/identity-attest",
  "@ar-agents/igj",
  "@ar-agents/iibb",
  "@ar-agents/incorporate",
  "@ar-agents/inpi",
  "@ar-agents/iva-percepciones",
  "@ar-agents/iva-retenciones",
  "@ar-agents/mcp",
  "@ar-agents/mercadolibre",
  "@ar-agents/mercadopago",
  "@ar-agents/mi-argentina",
  "@ar-agents/shipping",
  "@ar-agents/sicore",
  "@ar-agents/suss",
  "@ar-agents/tienda-nube",
  "@ar-agents/treasury",
  "@ar-agents/uala",
  "@ar-agents/wallet-cdp",
  "@ar-agents/whatsapp",
  "@ar-agents/wscdc",
  "@ar-agents/x402",
] as const;

export const PUBLISHED_PACKAGES = PUBLISHED_PACKAGE_NAMES.length;
export const CANONICAL_TOOLS = 252;
