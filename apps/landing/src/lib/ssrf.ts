/**
 * SSRF guard for endpoints that fetch a user-supplied URL server-side
 * (certifier, cert-badge, conformance-history). Best-effort on Edge (no DNS
 * resolution): blocks literal private/loopback/link-local/metadata targets and
 * non-web ports. Pair with rate limiting.
 */

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
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
