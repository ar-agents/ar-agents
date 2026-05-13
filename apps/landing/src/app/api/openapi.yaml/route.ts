/**
 * GET /api/openapi.yaml
 *
 * YAML mirror of the OpenAPI 3.1 schema served at /api/openapi. Many
 * tooling generators (codegen, Postman, Swagger UI) prefer YAML. Same
 * content, different serialization.
 *
 * Edge runtime. Fetches the JSON spec same-origin + converts to YAML
 * with a minimal pure-JS serializer (no dependencies). Cached briefly.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

const SITE = "https://ar-agents.ar";

// ─── minimal YAML serializer ────────────────────────────────────────────────
// Conservative output: always-quote strings that contain YAML-special chars,
// always-quote keys that aren't pure-alphanum, indentation as 2 spaces.

function isSimpleKey(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(s);
}

function needsQuoting(s: string): boolean {
  // YAML reserves these starts + various chars; just quote any string that
  // contains anything that isn't [A-Za-z0-9 _-.,/:].
  if (s === "") return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^-?\d/.test(s)) return true;
  if (/[\n\r\t#&*!|>'"%@`{}[\]]/.test(s)) return true;
  return false;
}

function escape(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function emitScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return needsQuoting(v) ? escape(v) : v;
  return JSON.stringify(v);
}

function emit(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const inner = emit(item, indent + 2);
          // Replace the leading padding of the first line with `- `.
          const lines = inner.split("\n");
          if (lines.length > 0) {
            lines[0] = `${pad}- ${lines[0].slice(indent + 2)}`;
          }
          for (let i = 1; i < lines.length; i++) {
            lines[i] = lines[i] ? lines[i] : lines[i];
          }
          return lines.join("\n");
        }
        if (Array.isArray(item)) {
          return `${pad}-\n${emit(item, indent + 2)}`;
        }
        return `${pad}- ${emitScalar(item)}`;
      })
      .join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const keyEmit = isSimpleKey(k) ? k : escape(k);
        if (v !== null && typeof v === "object" && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) {
          return `${pad}${keyEmit}:\n${emit(v, indent + 2)}`;
        }
        return `${pad}${keyEmit}: ${emitScalar(v)}`;
      })
      .join("\n");
  }
  return `${pad}${emitScalar(value)}`;
}

function toYaml(obj: unknown): string {
  return emit(obj, 0) + "\n";
}

export async function GET(req: Request) {
  // Fetch the canonical JSON from our own /api/openapi.
  const origin = new URL(req.url).origin || SITE;
  try {
    const r = await fetch(`${origin}/api/openapi`, {
      // Bound the fetch so a transient origin issue doesn't hang us.
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      return new Response(`# Failed to fetch /api/openapi: HTTP ${r.status}\n`, {
        status: 502,
        headers: { "content-type": "text/yaml; charset=utf-8" },
      });
    }
    const spec = await r.json();
    const yaml = toYaml(spec);
    return new Response(yaml, {
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return new Response(
      `# Error generating YAML: ${(e as Error).message}\n`,
      {
        status: 500,
        headers: { "content-type": "text/yaml; charset=utf-8" },
      },
    );
  }
}
