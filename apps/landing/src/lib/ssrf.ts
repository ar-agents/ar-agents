/**
 * SSRF guard for endpoints that fetch a user-supplied URL server-side
 * (certifier, cert-badge, conformance-history). Best-effort on Edge (no DNS
 * resolution): blocks literal private/loopback/link-local/metadata targets and
 * non-web ports. Pair with rate limiting.
 */

/** Private / loopback / link-local / CGNAT IPv4 (tested by first two octets). */
function isPrivateIPv4(a: number, b: number): boolean {
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Extract the embedded IPv4 of an IPv4-mapped (`::ffff:...`) or NAT64
 * (`64:ff9b::...`) IPv6 literal, in either dotted-quad or the hex-compressed form
 * `new URL()` normalizes to (e.g. `::ffff:169.254.169.254` -> `::ffff:a9fe:a9fe`).
 * Returns the four octets, or null if `h` is not such an embedding.
 */
function embeddedIPv4(h: string): [number, number, number, number] | null {
  let rest: string | null = null;
  if (h.startsWith("::ffff:")) rest = h.slice(7);
  else if (h.startsWith("64:ff9b::")) rest = h.slice(9);
  if (rest === null) return null;
  const dotted = rest.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) return [Number(dotted[1]), Number(dotted[2]), Number(dotted[3]), Number(dotted[4])];
  const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  return null;
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv6 literals: loopback / unspecified / ULA / link-local.
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
    // IPv4-mapped / NAT64 embedding a private IPv4 (SSRF-bypass: e.g.
    // ::ffff:169.254.169.254 -> the cloud metadata service, ::ffff:127.0.0.1 -> loopback).
    const emb = embeddedIPv4(h);
    if (emb && isPrivateIPv4(emb[0], emb[1])) return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    if (isPrivateIPv4(Number(m[1]), Number(m[2]))) return true;
  }
  return false;
}

/** Parse + validate an external URL. Returns null when unsafe to fetch. */
export function safeExternalUrl(u: string): URL | null {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (isPrivateHost(parsed.hostname)) return null;
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return null;
    return parsed;
  } catch {
    return null;
  }
}
