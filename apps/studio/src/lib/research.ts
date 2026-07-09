/**
 * Web research for the agent's `research_web` tool (see docs/CONTRACT.md,
 * M1-2). Backed by Tavily (https://tavily.com, free tier available). Only
 * registered as a tool when `TAVILY_API_KEY` is set -- `tavilyConfigured()`
 * gates that at the route. `researchWeb` itself never throws: any failure
 * (missing key, timeout, non-200, bad body) resolves to a plain string the
 * model can read and keep going, never an unhandled rejection that would
 * break the tool-calling step.
 */

const TAVILY_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 5;

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface TavilyApiResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilyApiResponse {
  answer?: string;
  results?: TavilyApiResult[];
}

/** Whether `research_web` should be registered as a tool at all. */
export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

function formatResults(data: TavilyApiResponse): string {
  const results = (data.results ?? []).slice(0, MAX_RESULTS);
  if (results.length === 0) return "Sin resultados.";
  const lines = results.map((r, i) => {
    const title = r.title?.trim() || "(sin título)";
    const url = r.url?.trim() || "";
    const snippet = r.content?.trim() || "";
    return `${i + 1}. ${title}\n   URL: ${url}\n   ${snippet}`;
  });
  if (data.answer) lines.unshift(`Resumen: ${data.answer.trim()}`);
  return lines.join("\n");
}

/**
 * Runs a Tavily web search and returns a plain-text summary of up to
 * `MAX_RESULTS` results (title, URL, snippet), ready to hand back as a tool
 * result. Never throws: returns a Spanish error string on any failure
 * (missing key, network error, timeout, non-200 status, unparseable body).
 */
export async function researchWeb(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return "busqueda_web_no_configurada";

  let res: Response;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: MAX_RESULTS,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `busqueda_web_fallo: ${message}`;
  }

  if (!res.ok) {
    return `busqueda_web_fallo: status ${res.status}`;
  }

  const data = (await res.json().catch(() => null)) as TavilyApiResponse | null;
  if (!data) return "busqueda_web_fallo: respuesta_invalida";

  return formatResults(data);
}
