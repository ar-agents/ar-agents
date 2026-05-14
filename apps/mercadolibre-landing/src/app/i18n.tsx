"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "es";

const STORAGE_KEY = "lang";

export type Translations = Record<keyof typeof EN, string>;

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
};

const LangCtx = createContext<Ctx | null>(null);

export function useLang(): Ctx {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "es" ? "es" : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLangState(readInitialLang());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("lang", lang);
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [mounted, lang]);

  const setLang = useCallback((v: Lang) => setLangState(v), []);
  const t = lang === "es" ? ES : EN;

  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const EN = {
  banner_eyebrow: "Part of /arg",
  banner_title: "Open infrastructure for Argentina's AI agent jurisdiction.",
  banner_link_umbrella: "ar-agents.ar",
  banner_link_github: "GitHub",
  banner_link_npm: "npm",
  banner_link_demo: "Live demo",

  hero_eyebrow: "@ar-agents/mercadolibre · v0.4.3 · independent · MELI-unaffiliated",
  hero_h1_l1: "Mercado Libre Agent Toolkit.",
  hero_h1_l2: "Built on Vercel.",
  hero_sub:
    "The typed TypeScript SDK Mercado Libre stopped shipping when they archived mercadolibre/nodejs-sdk in February 2022 — rebuilt for the AI SDK era. 14 drop-in tools, 9 domains, OAuth coalescing, /myfeeds replay, HITL gates on irreversible ops, agentic-commerce feed generator.",
  hero_cta_install: "Install",
  hero_cta_demo: "Try the live demo",
  hero_cta_docs: "Read the docs",

  proof_tests: "116 tests passing",
  proof_audit: "0 prod CVEs",
  proof_size: "11 KB brotli",
  proof_runtime: "Edge-runtime ready",

  qs_h2: "Quickstart",
  qs_sub:
    "Three lines and an LLM is driving Mercado Libre. The 14 tools come pre-typed; the agent never sees a thrown exception — every result is a discriminated union.",

  domains_h2: "Nine domains. Production-grade.",
  domains_sub:
    "Every helper that follows the cookbook recipes — not an exhaustive endpoint dump. The point is to make the agent loop trivial, not to wrap REST calls.",

  d_items_t: "Items + Catalog",
  d_items_d:
    "get / multiget / create / update / pause / close / relist / search / scroll-iterate. Category predictor + technical-spec planner in one call (categorizeAndPlan).",
  d_questions_t: "Questions",
  d_questions_d:
    "List, answer (≤2000 chars), blacklist + heuristic spam classifier with explainable features (URL/phone/email + repetition + new-account + length).",
  d_orders_t: "Orders + Packs",
  d_orders_d:
    "Search, get, billing-info (CUIT/CUIL/DNI), packs (cart vs single). partitionByPack splits a feed into single-orders and cart-grouped buckets.",
  d_claims_t: "Claims & Mediation",
  d_claims_d:
    "search, evidences, messages + the 2-day SLA defendClaim helper (sequential uploads + partial-failure surface, never half-defended).",
  d_shipments_t: "Mercado Envíos",
  d_shipments_d:
    "Shipment + history + label blob (PDF / ZPL) routed through auth + retry + rate-limit + telemetry. Shipping options for any item.",
  d_reputation_t: "Reputation",
  d_reputation_d:
    "Thermometer (5_green → 1_red), pre-evaluated alert severities, monitorReputation async-iterator with rethrow on permanent errors.",
  d_promotions_t: "Promotions",
  d_promotions_d:
    "Candidates + opt-in. autoOptInPromotions enforces a per-item margin floor so you never give away the listing.",
  d_webhooks_t: "Webhooks",
  d_webhooks_d:
    "Typed parser + the /myfeeds 2-day replay nobody else implements. Dedup by (topic, resource, sent) so the live feed doesn't double-deliver.",
  d_aisdk_t: "Vercel AI SDK 6",
  d_aisdk_d:
    "meliTools(client, opts) returns a 14-tool ToolSet. Every tool returns { ok: true, ... } | { ok: false, code, message } — no thrown errors.",

  blind_h2: "Eight blindspots this fills",
  blind_sub:
    "Things every JS Mercado Libre integration gets wrong because the official archived SDK never modeled them.",

  blind_1_t: "Single-use refresh-token races",
  blind_1_d:
    "Two parallel refreshes invalidate both tokens. We coalesce per-userId via in-process AsyncLock + document the cross-process CAS pattern.",
  blind_2_t: "Per-seller rate limiting",
  blind_2_d:
    "Token bucket scoped to seller:<id>, default 24/s burst 60. Idle-bucket sweep every 256 acquires so multi-tenant hosts don't leak.",
  blind_3_t: "/myfeeds 2-day replay",
  blind_3_d:
    "When your service was down for 5 minutes, this is the only path that gets the events back. Auto-dedup on a live feed.",
  blind_4_t: "Category prediction + tech specs in one call",
  blind_4_d:
    "categorizeAndPlan parallelizes the two endpoints. Save a round-trip for every CSV-import row.",
  blind_5_t: "Claim defense in 2-day SLA",
  blind_5_d:
    "defendClaim does GET + sequential evidence uploads (parallel races MELI's one-shot semantics) + optional message. Stops on first failure.",
  blind_6_t: "Reputation thermometer alerts",
  blind_6_d:
    "evaluateReputationAlerts translates the level + rates into actionable severities. Critical/warning thresholds configurable.",
  blind_7_t: "Promotion margin guard",
  blind_7_d:
    "autoOptInPromotions never opts in below your floor — and skips candidates where MELI didn't suggest a discount.",
  blind_8_t: "Heuristic spam classifier",
  blind_8_d:
    "Explainable features (no LLM dependency). Pair the borderline label with an LLM second-pass before auto-answering.",

  prod_h2: "Built for production from day one.",
  prod_sub:
    "Every line you'd write yourself in your second integration is already there.",

  prod_idem_t: "Idempotent-only retry",
  prod_idem_d:
    "Default classifier retries GET / HEAD / OPTIONS / PUT / DELETE on 5xx. POST / PATCH never auto-retry on 5xx because MELI's gateway can split-brain.",
  prod_telemetry_t: "Pluggable telemetry",
  prod_telemetry_d:
    "onRequest / onResponse / onRetry / onRateLimitWait — wire OpenTelemetry, Sentry, Datadog without touching the lib. Hooks never see Authorization headers.",
  prod_timeout_t: "Request timeout default",
  prod_timeout_d:
    "30s default with AbortSignal.any composing your signal + the timeout signal. A wedged TCP connection can't burn your entire Vercel Edge budget.",
  prod_security_t: "Security-audited",
  prod_security_d:
    "No eval, no http://, no hardcoded secrets, SSRF-guard on path injection, FNV-1a hash on bearer-scope (no token leaks in telemetry). Threat model in SECURITY.md.",
  prod_edge_t: "Edge-runtime native",
  prod_edge_d:
    "Web Crypto only. Runs on Vercel Edge, Cloudflare Workers, Deno. ESM 11 KB brotli, ai-sdk subpath 54 KB, testing helpers 18 KB.",
  prod_tests_t: "116 tests, 4 against live MELI",
  prod_tests_d:
    "102 unit + 10 property + 4 integration against the real public API (categories, domain_discovery). publint + attw + pnpm audit --prod all green.",

  mcp_h2: "Plug it into Claude Desktop, Cursor, or Codeium",
  mcp_sub:
    "@ar-agents/mcp@0.9.0 bundles every package — including this one — into a single MCP server. One install, one config, all 14 MELI tools available to your favorite IDE agent.",
  mcp_label: "Add to Claude Desktop",

  // strategic features (v0.4)
  strat_h2: "Two strategic moves shipped in v0.4.0",
  strat_sub:
    "Beyond making MELI agent-friendly: making it agent-native commerce infrastructure.",
  strat_hitl_t: "Human-in-the-Loop gates",
  strat_hitl_d:
    "Irreversible ops (create_item, update_item_price_or_stock, answer_question, defend_claim) wait for a programmatic confirmation callback before firing. The LLM cannot bypass — it isn't a system-prompt rule, it's a function call that doesn't fire. Auto-approve thresholds + input-overrides ship out of the box.",
  strat_feed_t: "Agentic Commerce feed generator",
  strat_feed_d:
    "@ar-agents/mercadolibre/feed emits ACP-2026-04-17 product feeds from any seller's MELI catalog. ChatGPT/Claude/Gemini buyer agents discover MELI listings without crawling. Cursor-paginated + ETag-cached + reference implementation deployed on bridge-hello.",
  bench_h2: "Performance",
  bench_sub:
    "Numbers from the bench suite (`pnpm bench`). Run them yourself to verify.",
  bench_ratelim_t: "Rate limiter (concurrent acquire, 200 ops)",
  bench_ratelim_v: "38M ops/s",
  bench_classify_t: "Spam classifier (typical question)",
  bench_classify_v: "4.5M classifications/s",
  bench_pipeline_t: "Full pipeline (auth + rate-limit + retry, 100 sequential GETs)",
  bench_pipeline_v: "1.5M req/s",
  bench_size_t: "Bundle (brotli'd, all dependencies)",
  bench_size_v: "11.0 KB",

  footer_built: "Built by",
  footer_naza: "Nazareno Clemente",
  footer_part: "Part of /arg.",
  footer_license: "MIT licensed.",
  footer_unaffiliated: "Independent open-source project. Not affiliated with, endorsed by, or sponsored by Mercado Libre S.R.L. MERCADOLIBRE® is a registered trademark of Mercado Libre S.R.L., used here in a descriptive, nominative-fair-use sense.",
};

export const ES: Translations = {
  banner_eyebrow: "Parte de /arg",
  banner_title: "Infraestructura abierta para la jurisdicción de agentes de IA argentina.",
  banner_link_umbrella: "ar-agents.ar",
  banner_link_github: "GitHub",
  banner_link_npm: "npm",
  banner_link_demo: "Demo en vivo",

  hero_eyebrow: "@ar-agents/mercadolibre · v0.4.3 · independent · MELI-unaffiliated",
  hero_h1_l1: "Toolkit de Mercado Libre para Agentes.",
  hero_h1_l2: "Hecho en Vercel.",
  hero_sub:
    "El SDK tipado de TypeScript que Mercado Libre dejó de mantener cuando archivaron mercadolibre/nodejs-sdk en febrero de 2022 — reconstruido para la era del AI SDK. 14 tools listas, 9 dominios, OAuth coalescing, replay de /myfeeds, HITL gates en ops irreversibles, ACP feed generator.",
  hero_cta_install: "Instalar",
  hero_cta_demo: "Probar la demo",
  hero_cta_docs: "Leer los docs",

  proof_tests: "116 tests pasando",
  proof_audit: "0 CVEs en prod",
  proof_size: "11 KB brotli",
  proof_runtime: "Edge-runtime ready",

  qs_h2: "Quickstart",
  qs_sub:
    "Tres líneas y un LLM está manejando Mercado Libre. Las 14 tools vienen pre-tipadas; el agente nunca ve una excepción — cada resultado es una unión discriminada.",

  domains_h2: "Nueve dominios. Production-grade.",
  domains_sub:
    "Cada helper que sigue las cookbook recipes — no un dump exhaustivo de endpoints. El punto es hacer el agent loop trivial, no envolver llamadas REST.",

  d_items_t: "Items + Catálogo",
  d_items_d:
    "get / multiget / create / update / pause / close / relist / search / scroll-iterate. Predictor de categoría + planificador de tech-specs en una llamada (categorizeAndPlan).",
  d_questions_t: "Preguntas",
  d_questions_d:
    "Listar, responder (≤2000 chars), blacklist + clasificador heurístico de spam con features explicables (URL/phone/email + repetición + cuenta nueva + longitud).",
  d_orders_t: "Órdenes + Packs",
  d_orders_d:
    "Search, get, billing-info (CUIT/CUIL/DNI), packs (carrito vs single). partitionByPack divide un feed en buckets de single y de carrito.",
  d_claims_t: "Reclamos y Mediación",
  d_claims_d:
    "search, evidencias, mensajes + el helper defendClaim para el SLA de 2 días (uploads secuenciales + surface de falla parcial, nunca se queda a medio defender).",
  d_shipments_t: "Mercado Envíos",
  d_shipments_d:
    "Envío + historial + label blob (PDF / ZPL) ruteado por auth + retry + rate-limit + telemetría. Opciones de envío para cualquier item.",
  d_reputation_t: "Reputación",
  d_reputation_d:
    "Termómetro (5_green → 1_red), severidades de alertas pre-evaluadas, async-iterator monitorReputation con rethrow en errores permanentes.",
  d_promotions_t: "Promociones",
  d_promotions_d:
    "Candidates + opt-in. autoOptInPromotions enforces un piso de margen por item para que nunca regales el listing.",
  d_webhooks_t: "Webhooks",
  d_webhooks_d:
    "Parser tipado + el replay de /myfeeds de 2 días que nadie más implementa. Dedup por (topic, resource, sent) para que el feed live no duplique.",
  d_aisdk_t: "Vercel AI SDK 6",
  d_aisdk_d:
    "meliTools(client, opts) devuelve un ToolSet de 14 tools. Cada tool retorna { ok: true, ... } | { ok: false, code, message } — sin excepciones lanzadas.",

  blind_h2: "Ocho puntos ciegos que esto cubre",
  blind_sub:
    "Cosas que toda integración JS de Mercado Libre rompe porque el SDK oficial archivado nunca las modeló.",

  blind_1_t: "Carreras del refresh-token de un solo uso",
  blind_1_d:
    "Dos refreshes en paralelo invalidan ambos tokens. Coalesceamos por userId con AsyncLock in-process + documentamos el patrón de CAS cross-process.",
  blind_2_t: "Rate-limit por seller",
  blind_2_d:
    "Token bucket scopeado a seller:<id>, default 24/s burst 60. Sweep de buckets idle cada 256 acquires para que hosts multi-tenant no leakeen.",
  blind_3_t: "/myfeeds replay de 2 días",
  blind_3_d:
    "Cuando tu servicio estuvo caído 5 minutos, este es el único camino que recupera los eventos. Auto-dedup en feed live.",
  blind_4_t: "Predicción de categoría + tech-specs en una llamada",
  blind_4_d:
    "categorizeAndPlan paraleliza los dos endpoints. Ahorra un round-trip por cada fila de un import CSV.",
  blind_5_t: "Defensa de claim en SLA de 2 días",
  blind_5_d:
    "defendClaim hace GET + uploads secuenciales de evidencias (paralelo carrera la one-shot semantics de MELI) + mensaje opcional. Para en la primera falla.",
  blind_6_t: "Alertas del termómetro de reputación",
  blind_6_d:
    "evaluateReputationAlerts traduce el nivel + rates en severidades accionables. Thresholds critical/warning configurables.",
  blind_7_t: "Margin guard de promociones",
  blind_7_d:
    "autoOptInPromotions nunca opta debajo de tu piso — y skipea candidatos donde MELI no sugirió descuento.",
  blind_8_t: "Clasificador heurístico de spam",
  blind_8_d:
    "Features explicables (sin dependencia LLM). Pareá el label borderline con un LLM second-pass antes de auto-responder.",

  prod_h2: "Hecho para producción desde el día uno.",
  prod_sub:
    "Cada línea que escribirías vos mismo en tu segunda integración ya está acá.",

  prod_idem_t: "Retry solo en verbos idempotentes",
  prod_idem_d:
    "Classifier default retries GET / HEAD / OPTIONS / PUT / DELETE en 5xx. POST / PATCH nunca auto-retries en 5xx porque el gateway de MELI puede split-brain.",
  prod_telemetry_t: "Telemetría pluggable",
  prod_telemetry_d:
    "onRequest / onResponse / onRetry / onRateLimitWait — enchufá OpenTelemetry, Sentry, Datadog sin tocar la lib. Los hooks nunca ven headers Authorization.",
  prod_timeout_t: "Request timeout default",
  prod_timeout_d:
    "30s default con AbortSignal.any componiendo tu signal + el signal de timeout. Una conexión TCP wedged no puede quemar todo tu budget de Vercel Edge.",
  prod_security_t: "Auditado",
  prod_security_d:
    "Sin eval, sin http://, sin secrets hardcoded, SSRF-guard en path injection, hash FNV-1a en bearer-scope (sin leak de tokens en telemetría). Threat model en SECURITY.md.",
  prod_edge_t: "Edge-runtime native",
  prod_edge_d:
    "Solo Web Crypto. Corre en Vercel Edge, Cloudflare Workers, Deno. ESM 11 KB brotli, subpath ai-sdk 54 KB, testing helpers 18 KB.",
  prod_tests_t: "116 tests, 4 contra MELI real",
  prod_tests_d:
    "102 unit + 10 property + 4 integration contra la API pública real (categories, domain_discovery). publint + attw + pnpm audit --prod todo verde.",

  mcp_h2: "Enchufalo a Claude Desktop, Cursor o Codeium",
  mcp_sub:
    "@ar-agents/mcp@0.9.0 bundle todos los packages — incluido este — en un solo MCP server. Una instalación, una config, las 14 tools de MELI disponibles para tu IDE-agent favorito.",
  mcp_label: "Agregar a Claude Desktop",

  strat_h2: "Dos movimientos estratégicos en v0.4.0",
  strat_sub:
    "Más allá de hacer MELI agent-friendly: convertirlo en infraestructura agent-native de comercio.",
  strat_hitl_t: "Human-in-the-Loop gates",
  strat_hitl_d:
    "Operaciones irreversibles (create_item, update_item_price_or_stock, answer_question, defend_claim) esperan un callback programático de confirmación antes de ejecutar. El LLM no lo puede bypassear — no es una regla del system prompt, es una function call que no se dispara. Thresholds de auto-approve + input-overrides incluidos.",
  strat_feed_t: "Generador de Agentic Commerce feed",
  strat_feed_d:
    "@ar-agents/mercadolibre/feed emite product feeds ACP-2026-04-17 desde el catálogo MELI de cualquier seller. Los buyer agents (ChatGPT/Claude/Gemini) descubren listings de MELI sin crawlear. Cursor-paginated + ETag-cached + implementación de referencia desplegada en bridge-hello.",
  bench_h2: "Performance",
  bench_sub: "Números del bench suite (`pnpm bench`). Corrélos vos para verificar.",
  bench_ratelim_t: "Rate limiter (acquire concurrente, 200 ops)",
  bench_ratelim_v: "38M ops/s",
  bench_classify_t: "Clasificador de spam (pregunta típica)",
  bench_classify_v: "4.5M clasificaciones/s",
  bench_pipeline_t: "Pipeline completo (auth + rate-limit + retry, 100 GETs secuenciales)",
  bench_pipeline_v: "1.5M req/s",
  bench_size_t: "Bundle (brotli, todas las deps)",
  bench_size_v: "11.0 KB",

  footer_built: "Construido por",
  footer_naza: "Nazareno Clemente",
  footer_part: "Parte de /arg.",
  footer_license: "Licencia MIT.",
  footer_unaffiliated: "Proyecto open-source independiente. Sin afiliación, endoso o patrocinio de Mercado Libre S.R.L. MERCADOLIBRE® es una marca registrada de Mercado Libre S.R.L., usada aquí en sentido descriptivo / fair-use nominativo.",
};
