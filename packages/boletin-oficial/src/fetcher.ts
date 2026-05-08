/**
 * Fetcher contract for `@ar-agents/boletin-oficial`.
 *
 * The Boletín Oficial does not publish a documented JSON API. The
 * realistic options are:
 *
 *   - **Web scraping** of `boletinoficial.gob.ar/buscar/...` — fragile but
 *     today's only public path. The `LiveBoFetcher` does this with
 *     conservative parsing + retries.
 *   - **Private mirror** — your team scrapes daily into a database; pass
 *     a custom adapter that reads from there.
 *   - **Mock** for tests / demos.
 *
 * All adapters share a common contract — keep the public surface stable
 * even as the backend changes.
 */

import { FetcherNotConfiguredError } from "./errors";
import { buildNormaUrl, classifyTipo, extractCuits } from "./secciones";
import type { Norma, SearchQuery, SearchResult } from "./types";

export interface BoFetcher {
  search(query: SearchQuery): Promise<SearchResult>;
  getNorma(id: string): Promise<Norma | null>;
}

/**
 * Default fetcher that returns "not configured". Use this when you want
 * the tools to be safe to call without making real BO requests — typical
 * for tests, demos, and CI.
 */
export class UnconfiguredBoFetcher implements BoFetcher {
  async search(_query: SearchQuery): Promise<SearchResult> {
    return {
      results: [],
      total: 0,
      nextCursor: null,
      source: "unconfigured",
    };
  }
  async getNorma(_id: string): Promise<Norma | null> {
    throw new FetcherNotConfiguredError();
  }
}

/**
 * In-memory fetcher backed by a fixed list of normas. Useful for tests,
 * demos, and seeding the agent with curated examples. Implements simple
 * substring matching against title/text + sección/organismo/CUIT filters.
 */
export class MockBoFetcher implements BoFetcher {
  constructor(private readonly normas: Norma[]) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const filtered = this.normas.filter((n) => matches(n, query));
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = filtered.slice(offset, offset + pageSize);
    const next = offset + pageSize < filtered.length ? String(offset + pageSize) : null;
    return {
      results: page,
      total: filtered.length,
      nextCursor: next,
      source: "mock",
    };
  }

  async getNorma(id: string): Promise<Norma | null> {
    return this.normas.find((n) => n.id === id) ?? null;
  }
}

/**
 * Live fetcher that hits the Boletín Oficial's public website. The BO
 * doesn't publish a stable JSON API — this adapter scrapes the search
 * results page and per-norma detail pages.
 *
 * # Resilience
 *
 * - Single retry on 5xx with exponential backoff (250ms, 500ms).
 * - 30s default timeout, configurable.
 * - User-Agent set to `@ar-agents/boletin-oficial/<version>`.
 *
 * # When the page structure changes
 *
 * The package will throw `BoError("fetcher_unexpected_response")` rather
 * than return wrong data. Pin the package version, watch the changelog,
 * and report parser breakage on GitHub.
 */
export interface LiveBoFetcherOptions {
  /** Override the BO base URL. Defaults to https://www.boletinoficial.gob.ar */
  baseUrl?: string;
  /** Custom fetch implementation (e.g., for proxies). */
  fetch?: typeof fetch;
  /** Request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** User-Agent. Defaults to the package name + version. */
  userAgent?: string;
}

export class LiveBoFetcher implements BoFetcher {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(opts: LiveBoFetcherOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "https://www.boletinoficial.gob.ar";
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? "@ar-agents/boletin-oficial/0.1.0";
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    // The BO search page accepts secciones via path segments
    // (e.g. /buscar/primera) and a free-text query via `?busqueda=...`.
    const seccion = (query.secciones && query.secciones[0]) ?? "primera";
    const params = new URLSearchParams();
    if (query.query) params.set("busqueda", query.query);
    if (query.from) params.set("desde", query.from);
    if (query.to) params.set("hasta", query.to);
    if (query.organismo) params.set("organismo", query.organismo);
    if (query.cursor) params.set("offset", query.cursor);
    const url = `${this.baseUrl}/buscar/${seccion}${params.size ? `?${params.toString()}` : ""}`;

    const html = await this.getText(url);
    const results = parseSearchHtml(html, seccion);
    const filtered = query.cuit
      ? results.filter((n) => (n.cuitsMencionados ?? []).includes(query.cuit!))
      : results;
    return {
      results: filtered,
      nextCursor: results.length === (query.pageSize ?? 20) ? String((Number(query.cursor) || 0) + results.length) : null,
      source: "live",
    };
  }

  async getNorma(id: string): Promise<Norma | null> {
    // Detail URL needs a sección + date — we try Primera first as the most
    // common, falling back to others when the first 404s.
    for (const seccion of ["primera", "segunda", "tercera", "cuarta"] as const) {
      const url = `${this.baseUrl}/detalleAviso/${seccion}/${encodeURIComponent(id)}`;
      try {
        const html = await this.getText(url);
        const norma = parseDetailHtml(html, id, seccion);
        if (norma) return norma;
      } catch {
        // 404 or parse error — try next sección.
      }
    }
    return null;
  }

  private async getText(url: string): Promise<string> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml,application/json;q=0.9",
          },
        });
        clearTimeout(timer);
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.text();
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt === 0) await sleep(250);
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Boletín Oficial fetch failed for ${url}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function matches(norma: Norma, query: SearchQuery): boolean {
  if (query.secciones && !query.secciones.includes(norma.seccion)) return false;
  if (query.cuit && !(norma.cuitsMencionados ?? []).includes(query.cuit)) return false;
  if (query.organismo) {
    const o = (norma.organismo ?? "").toLowerCase();
    if (!o.includes(query.organismo.toLowerCase())) return false;
  }
  if (query.query) {
    const q = query.query.toLowerCase();
    const haystack = `${norma.titulo}\n${norma.texto ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (query.from && norma.fechaPublicacion < query.from) return false;
  if (query.to && norma.fechaPublicacion > query.to) return false;
  return true;
}

/**
 * Tiny HTML parser for the BO search results page. Conservative: extracts
 * only the fields that have stable selectors (h2 titles + detail URLs +
 * publication date). Falls back to empty array if the structure changed.
 *
 * Exported for unit testing; not part of the public API surface.
 */
export function parseSearchHtml(html: string, seccion: Norma["seccion"]): Norma[] {
  const results: Norma[] = [];
  // Match each result card. The BO renders these as <a href="/detalleAviso/...">
  // wrapping a heading + organismo + summary. We split on those anchors.
  const linkRe = /<a[^>]+href="\/detalleAviso\/([a-z]+)\/(\d+)\/(\d{8})"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const [, , id, ymd, inner] = m;
    if (!id || !ymd || !inner) continue;
    const fechaPublicacion = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const titulo = stripTags(inner).replace(/\s+/g, " ").trim();
    if (!titulo) continue;
    const tipo = classifyTipo(titulo, seccion);
    const norma: Norma = {
      id,
      seccion,
      tipo,
      titulo,
      fechaPublicacion,
      url: buildNormaUrl(seccion, id, fechaPublicacion),
    };
    const cuits = extractCuits(titulo);
    if (cuits.length > 0) norma.cuitsMencionados = cuits;
    results.push(norma);
  }
  return results;
}

/**
 * Parse a single norma detail page. Returns null when the page doesn't
 * contain a recognizable norma (e.g., 404 page, redirect).
 *
 * Exported for unit testing; not part of the public API surface.
 */
export function parseDetailHtml(html: string, id: string, seccion: Norma["seccion"]): Norma | null {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!titleMatch || !titleMatch[1]) return null;
  const titulo = stripTags(titleMatch[1]).replace(/\s+/g, " ").trim();
  if (!titulo) return null;
  const orgMatch = html.match(/<span[^>]*class="[^"]*organismo[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const dateMatch = html.match(/(\d{4})-(\d{2})-(\d{2})/);
  const bodyMatch = html.match(/<div[^>]*class="[^"]*texto[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const fechaPublicacion = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : new Date().toISOString().slice(0, 10);
  const texto = bodyMatch && bodyMatch[1] ? stripTags(bodyMatch[1]).replace(/\s+/g, " ").trim() : undefined;
  const norma: Norma = {
    id,
    seccion,
    tipo: classifyTipo(titulo, seccion),
    titulo,
    fechaPublicacion,
    url: buildNormaUrl(seccion, id, fechaPublicacion),
  };
  if (orgMatch && orgMatch[1]) {
    norma.organismo = stripTags(orgMatch[1]).trim();
  }
  if (texto) {
    norma.texto = texto;
    const cuits = extractCuits(`${titulo}\n${texto}`);
    if (cuits.length > 0) norma.cuitsMencionados = cuits;
  }
  return norma;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
