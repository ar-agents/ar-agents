/**
 * GET /api/conformance-history?url={baseUrl}
 * POST /api/conformance-history?url={baseUrl}  (also accepts the same params via body)
 *
 * Time-series of RFC-002 + RFC-004 conformance scores for a target URL.
 * Stored in Vercel KV (Upstash, sa-east-1) as a capped list per-URL with a
 * 90-day TTL.
 *
 * Use cases:
 *  - The /registro page can show a sparkline of each entry's recent
 *    cert-score (trend, not just snapshot).
 *  - A regulator can confirm a sociedad-IA stayed conformant over time,
 *    not just at one moment.
 *  - The downstream GitHub Actions workflow (recipe 27) can POST
 *    nightly scores to build a long-horizon trend.
 *
 * Behavior:
 *  - GET: returns the stored history. If `refresh=1`, runs the
 *    certifier first + appends the new point, then returns the
 *    updated history.
 *  - POST: always runs the certifier + appends + returns the new
 *    point + the full history.
 *
 * Storage:
 *  - Key: `conformance-history:{base64url(url)}` (avoids collisions
 *    on URL-special chars).
 *  - Value: capped list (max 365 entries) of `{ts, score, rating}`.
 *  - TTL: 90 days from last append.
 *
 * If KV isn't wired, falls back to in-memory (per-instance).
 */

import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SITE = "https://ar-agents.vercel.app";
const MAX_HISTORY = 365;
const TTL_SECONDS = 90 * 24 * 60 * 60;
const KEY_PREFIX = "conformance-history:";

interface Point {
  ts: string;        // ISO-8601 UTC
  score: number;     // 0-100
  rating: "A" | "B" | "C" | "D" | "F" | "N/A";
}

interface HistoryResponse {
  $schema: string;
  target: { baseUrl: string };
  points: Point[];
  backend: "vercel-kv" | "in-memory";
  fetchedAt: string;
}

const memStore = new Map<string, Point[]>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

function urlKey(url: string): string {
  const buf = Buffer.from(url, "utf8");
  const b64 = buf.toString("base64url");
  return `${KEY_PREFIX}${b64}`;
}

function isValidUrl(u: string): URL | null {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:") return null;
    return p;
  } catch {
    return null;
  }
}

async function readHistory(url: string): Promise<Point[]> {
  if (isKvWired()) {
    try {
      const raw = await kv.lrange<Point>(urlKey(url), 0, -1);
      return Array.isArray(raw) ? raw : [];
    } catch {
      // fall through
    }
  }
  return memStore.get(url) ?? [];
}

async function appendPoint(url: string, point: Point): Promise<Point[]> {
  if (isKvWired()) {
    try {
      const key = urlKey(url);
      await kv.rpush(key, point);
      await kv.ltrim(key, -MAX_HISTORY, -1);
      await kv.expire(key, TTL_SECONDS);
      return await readHistory(url);
    } catch {
      // fall through
    }
  }
  const arr = memStore.get(url) ?? [];
  arr.push(point);
  if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
  memStore.set(url, arr);
  return arr;
}

async function fetchCertifier(url: string): Promise<Point | null> {
  try {
    const r = await fetch(`${SITE}/api/certifier?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { score?: number; rating?: Point["rating"] };
    if (typeof data.score !== "number" || !data.rating) return null;
    return {
      ts: new Date().toISOString(),
      score: data.score,
      rating: data.rating,
    };
  } catch {
    return null;
  }
}

function buildResponse(
  baseUrl: string,
  points: Point[],
): HistoryResponse {
  return {
    $schema: `${SITE}/schemas/conformance-history.v1.json`,
    target: { baseUrl },
    points,
    backend: isKvWired() ? "vercel-kv" : "in-memory",
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") || "").trim();
  const refresh = searchParams.get("refresh") === "1";

  if (!url) {
    return NextResponse.json(
      { error: "Missing required query parameter: url" },
      { status: 400 },
    );
  }
  const parsed = isValidUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid URL. Must be http:// or https://." },
      { status: 400 },
    );
  }

  let points: Point[];
  if (refresh) {
    const newPoint = await fetchCertifier(parsed.origin);
    if (newPoint) {
      points = await appendPoint(parsed.origin, newPoint);
    } else {
      points = await readHistory(parsed.origin);
    }
  } else {
    points = await readHistory(parsed.origin);
  }

  return NextResponse.json(buildResponse(parsed.origin, points), {
    headers: {
      "cache-control": refresh
        ? "no-store, no-cache"
        : "public, max-age=60, stale-while-revalidate=300",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  let url = (reqUrl.searchParams.get("url") || "").trim();
  if (!url) {
    try {
      const body = (await req.json()) as { url?: string };
      url = (body.url || "").trim();
    } catch {
      // ignore
    }
  }
  if (!url) {
    return NextResponse.json(
      { error: "Missing required parameter: url" },
      { status: 400 },
    );
  }
  const parsed = isValidUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid URL. Must be http:// or https://." },
      { status: 400 },
    );
  }

  const newPoint = await fetchCertifier(parsed.origin);
  if (!newPoint) {
    return NextResponse.json(
      { error: "Failed to run certifier against the target URL." },
      { status: 502 },
    );
  }
  const points = await appendPoint(parsed.origin, newPoint);
  return NextResponse.json(
    {
      ...buildResponse(parsed.origin, points),
      latest: newPoint,
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
