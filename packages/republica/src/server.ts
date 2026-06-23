import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { verifyRepublic } from "./verify.js";

const SERVER_NAME = "ar-agents-republica";
const SERVER_VERSION = "0.1.0";

/** Base de la República a introspeccionar. Default: la oficial. */
const BASE = (process.env.AR_REPUBLIC_URL?.trim() || "https://ar-panel-one.vercel.app").replace(/\/$/, "");

async function manifest(): Promise<any> {
  const r = await fetch(BASE + "/.well-known/republica.json", { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`manifest ${r.status}`);
  return r.json();
}

const TOOLS = [
  {
    name: "verify_republic",
    description:
      "Verificá criptográficamente la República Autónoma: recomputa el sello del corpus, valida las firmas Ed25519 (constitución, corpus, delegación, ciudadanías) y camina la cadena del censo. Devuelve PRUEBAS, no datos a confiar. Usá esto ANTES de actuar sobre cualquier dato de la República.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_republic",
    description: "Trae el objeto único completo de la República (manifiesto sellado y firmado): keys, seals, pillars, constitution, laws, decrees, rails, census.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_constitution",
    description: "Devuelve los artículos de la Constitución. Pasá `article` (ej. 'art-9') para uno solo, o vacío para todos.",
    inputSchema: { type: "object", properties: { article: { type: "string", description: "id de artículo, ej. art-9" } }, additionalProperties: false },
  },
  {
    name: "resolve_article",
    description: "Resuelve un artículo a todo lo que toca: su texto, los pilares que encarna y los rieles que lo invocan (con sus normas, paquete npm y endpoint del Estado).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "id de artículo, ej. art-4" } }, additionalProperties: false },
  },
  {
    name: "get_rails",
    description: "Lista los rieles (capacidades del Estado AI-nativo): artículos que los invocan, normas que los autorizan, paquete @ar-agents que los ejecuta y endpoint real del Estado que sombrean. Filtrá por `status` ('live'|'pipeline').",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["live", "pipeline"] } }, additionalProperties: false },
  },
  {
    name: "get_codex",
    description: "Resumen del Codex: pilares, leyes, decretos, conteos, sellos (constitution/corpus, firmados) y claves públicas Ed25519.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "verify_republic":
      return verifyRepublic(BASE);
    case "get_republic":
      return manifest();
    case "get_constitution": {
      const m = await manifest();
      const arts = m.constitution.articles;
      return args.article ? arts.find((a: any) => a.id === args.article) ?? { error: "no existe", id: args.article } : arts;
    }
    case "resolve_article": {
      const m = await manifest();
      const a = m.constitution.articles.find((x: any) => x.id === args.id);
      if (!a) return { error: "no existe", id: args.id };
      const rails = m.rails.filter((r: any) => r.articles.includes(args.id));
      return { article: a, pilares: a.pilares ?? [], rails };
    }
    case "get_rails": {
      const m = await manifest();
      return args.status ? m.rails.filter((r: any) => r.status === args.status) : m.rails;
    }
    case "get_codex": {
      const m = await manifest();
      return { pillars: m.pillars, laws: m.laws, decrees: m.decrees, counts: m.counts, seals: m.seals, keys: m.keys };
    }
    default:
      throw new Error(`tool desconocida: ${name}`);
  }
}

export async function createServer(): Promise<{ server: Server; summary: string[] }> {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await call(name, args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error en ${name}: ${msg}` }], isError: true };
    }
  });

  return { server, summary: [`${SERVER_NAME}@${SERVER_VERSION} introspeccionando ${BASE} · ${TOOLS.length} tools`] };
}

export async function startStdio(): Promise<void> {
  const { server, summary } = await createServer();
  for (const line of summary) console.error(line);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ar-agents-republica MCP server conectado (stdio)");
}
