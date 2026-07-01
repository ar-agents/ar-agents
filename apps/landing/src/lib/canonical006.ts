/**
 * RFC-006 §2 canonical JSON — the ONE canonicalizer shared by the ledger, the
 * good-standing oracle, and the Sovereignty/Portability Bundle.
 *
 * Extracted into its own PURE, ZERO-DEPENDENCY module so the bundle's
 * verify/replay path can canonicalize IDENTICALLY without transitively importing
 * `@vercel/kv` (which ledger.ts pulls in). That import-purity is what lets the
 * bundle be verified and replayed off our own infrastructure.
 *
 * Deterministic: object keys sorted, no whitespace, strict JSON domain (throws on
 * bigint/function/symbol/undefined values, non-finite numbers, and array holes).
 * MUST stay byte-identical to the inline copies in the good-standing route and
 * lib/attestation.ts — every issued signature and the frozen RFC-006 test vectors
 * depend on these bytes, so change all copies together.
 */
export function canonical006(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`canonical: non-finite number out of domain (RFC-006 §2): ${value}`);
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") {
    throw new TypeError(`canonical: ${t} is out of domain (RFC-006 §2): not a JSON value`);
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        throw new TypeError(`canonical: array hole at index ${i} out of domain (RFC-006 §2)`);
      }
      out += (i ? "," : "") + canonical006(value[i]);
    }
    return out + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical006(obj[k])}`).join(",")}}`;
}
