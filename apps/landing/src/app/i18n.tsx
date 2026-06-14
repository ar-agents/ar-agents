"use client";

import { usePathname } from "next/navigation";
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

/** Path-based detection: any URL under /en/* (or /en exactly) is English. */
function langFromPath(pathname: string): Lang | null {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return null;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  // `lang` is DERIVED, not synced via effects: path wins (any /en/* URL is
  // English), otherwise the user's stored preference. Deriving instead of
  // mirroring-with-effects removes the race that previously let the path-sync
  // effect fight a manual toggle during async navigation (e.g. toggling ES on
  // an /en page left lang stuck on "en", and toggling EN on a mirror-less page
  // like the home bounced straight back to "es").
  const [pref, setPref] = useState<Lang>("es");

  // Read the stored preference once on mount. On /en/* URLs this is cosmetic
  // (path overrides anyway); on canonical URLs it restores the last choice.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") setPref(stored);
  }, []);

  const lang: Lang = langFromPath(pathname) ?? pref;

  // Reflect the active language on <html lang> for a11y/SEO.
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  // A manual toggle sets the preference and persists it. If the current page
  // has an /en mirror, LangSwitch also navigates; the derived `lang` then
  // follows the new path. No effect-driven reconciliation, so no bounce-back.
  const setLang = useCallback((v: Lang) => {
    setPref(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v);
    }
  }, []);

  const t = lang === "es" ? ES : EN;
  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Dictionary. Keep keys descriptive (page.section.role) so additions are
// safe and maps never collide. Technical terms stay in English on both
// sides, "Edge Runtime", "Vercel KV", "OpenTelemetry", "idempotencia",
// "webhook", "preference" all read natively in AR dev Spanish.
// ---------------------------------------------------------------------------

export const EN = {
  // hero
  hero_h1_l1: "Open infrastructure for AI corporations.",
  hero_h1_l2: "Built in Argentina.",
  hero_sub:
    "A Sociedad Automatizada runs on AI agents, not employees. ar-agents is the open-source code to incorporate and operate one.",
  cta_deploy: "Deploy on Vercel",
  cta_github: "GitHub",
  cta_npm: "npm",
  cta_cookbook: "Cookbook",
  cta_try_live: "Try it with a live agent",

  // comparison
  compare_h2: "How it compares",
  compare_col_feature: "Feature",
  compare_col_official: "(official)",
  compare_col_stripe: "Toolkit",
  compare_partial: "partial",
  compare_no: "no",
  compare_yes: "yes",
  compare_full: "full",
  compare_thin: "thin REST",
  compare_node_only: "Node-only",
  compare_optional: "optional",
  compare_client_only: "client only",
  compare_row_schemas: "Vercel AI SDK 6 tool schemas",
  compare_row_ar: "Argentine-specific (cuotas, ARCA, AR phone)",
  compare_row_tools: "Tool count",
  compare_row_webhooks: "Webhooks: HMAC + dedup + replay window",
  compare_row_edge: "Edge Runtime + Vercel KV adapters",
  compare_row_otel: "OpenTelemetry instrumentation",
  compare_row_idem: "Deterministic idempotency by default",
  compare_row_hitl: "Programmatic HITL on irreversible ops",
  compare_row_coverage: "MercadoPago coverage",

  // what's in the box
  whats_h2: "What's in the box",
  whats_payments_t: "Payments",
  whats_payments_d:
    "create / capture / refund · OAuth marketplace · Checkout Pro · Order Management",
  whats_subs_t: "Subscriptions",
  whats_subs_d: "create / get / pause / resume / cancel · plans · saved cards",
  whats_cuotas_t: "Cuotas",
  whats_cuotas_d: "AR issuer-promo catalog · installments · 3DS challenge resolution",
  whats_qrpoint_t: "QR + Point",
  whats_qrpoint_d: "in-store QR · physical Point devices · Stores + POS",
  whats_webhooks_t: "Webhooks",
  whats_webhooks_d:
    "HMAC verification · replay window · deduplication · handle_webhook combo",
  whats_state_t: "State",
  whats_state_d:
    "InMemory + Vercel KV adapters out of the box · pluggable interface",
  whats_obs_t: "Observability",
  whats_obs_d:
    "OpenTelemetry traces via subpath · audit log adapter · circuit breaker",
  whats_safety_t: "Safety",
  whats_safety_d:
    "deterministic idempotency by default · programmatic HITL on 8 irreversible ops",

  // other primitives
  other_h2: "The toolkit: one package per piece of the stack",
  other_intro_a: "Every piece of the stack an Argentine business needs, as an independent npm package. They compose with each other and with the flagship,",
  other_intro_b: ".",
  other_card_npm: "npm",
  other_card_source: "source",
  other_card_demo: "live demo →",

  // primitive purposes
  pp_identity:
    "CUIT/CUIL validation + AFIP/ARCA padrón lookup (constancia con monotributo + condición IVA). WSAA SOAP via subpath.",
  pp_identity_attest:
    "Verification orchestrator (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity). Returns HMAC-signed attestation with a trust level.",
  pp_whatsapp:
    "WhatsApp Business Cloud API. Webhook + HMAC verify. AR phone normalizer. scopedTo mode binds outbound tools to a single sender.",
  pp_facturacion:
    "AFIP/ARCA factura electrónica (WSFE). Factura A/B/C, NC/ND, FCE MiPyMEs. Local pre-flight validator catches the 10 most common rejection reasons before the round-trip.",
  pp_banking:
    "CBU/CVU validation with bank/PSP identification + BCRA Central de Deudores + BCRA Principales Variables (USD oficial, CER, UVA, reservas, BADLAR, inflación). 11 tools total.",
  pp_shipping:
    "Andreani (full REST), OCA, Correo Argentino. cotizar / crear / trackear / cancelar. Provincia + CPA helpers.",
  pp_mi_argentina:
    "Mi Argentina OIDC (login with the AR government identity). PKCE, RS256 ID-token verification, JWKS caching, refresh, end-session. Web Crypto only, runs on Edge.",
  pp_boletin_oficial:
    "Boletín Oficial as a structured firehose: search, filter by sección, get norma by id, subscribe to keywords/CUITs/organismos. The 'Vercel for legal monitoring' that the AR ecosystem was missing.",
  pp_igj:
    "Inspección General de Justicia (IGJ) open data: search entities, fetch domicilios / autoridades / balances / asambleas. Wraps the public CKAN at datos.jus.gob.ar. Sample dataset (not real-time), `coverageNote` surfaces every result.",
  pp_firma_digital:
    "Argentine Firma Digital (Ley 25.506 / ONTI) verification: parse X.509 certs, verify chains anchored at AC-Raíz Argentina, verify CMS / PKCS#7 detached signatures, extract CUIT from signer subject. Verification only, signing requires hardware tokens.",
  pp_gde_tad:
    "TAD (Trámites a Distancia) + GDE (Gestión Documental Electrónica) primitives: Domicilio Electrónico Constituido notification ingestion, trámite tracking, IGJ inscription pre-flight. The 4th pieza for sociedades-IA, RFC-001 § 3.4. No documented public API yet; adapter pattern + scrape-based defaults.",
  pp_mercadolibre:
    "Independent SDK + tool collection for the Mercado Libre marketplace API (items, categories, questions, orders, packs, claims, shipments, reputation, promotions, webhooks). OAuth coalescing, /myfeeds replay, HITL gates on irreversible ops. Community-built, not affiliated.",
  pp_agentic_commerce_bridge:
    "Open-source merchant facilitator for the Agentic Commerce Protocol (ACP) bridging ChatGPT, Claude, Gemini and other agentic-commerce clients to MercadoLibre + MercadoPago. ACP-compliant checkout sessions, signed webhooks, .well-known/acp.json discovery, auto-issued AFIP Factura A/B/C. First LATAM agentic-commerce bridge.",
  pp_ap2:
    "First faithful TypeScript implementation of the Agent Payments Protocol (AP2) v0.2, schemas, ES256 SD-JWT VC mandates (Checkout + Payment, open + closed), 8 constraint evaluators, signed Checkout/Payment receipts. Edge-Runtime-compatible. Aligned with the FIDO Alliance Agentic Auth WG reference Python SDK.",
  pp_incorporate:
    "Zero-dependency TypeScript client for `ar-agents.ar/api/auto-incorporate`, lets an external agent (USA-LLC, ChatGPT, Claude, Gemini) self-incorporate an Argentine sociedad-IA in one call. Returns generated source files, Vercel deploy URL, signed audit-log reference.",
  pp_mcp:
    "MCP server bundling all 13 tool-bearing packages. One install in Claude Desktop / Cursor / any MCP host. Auto-detects which packages to enable from env vars.",

  // quick start
  quick_h2: "Quick start",

  // composition
  comp_h2: "Composition example: billing assistant",
  comp_intro_a: "shows MP composing with identity, identity-attest, and whatsapp in a single agent. Validates CUIT against ARCA, gates large charges with verification (WhatsApp OTP), creates the MP subscription, replies on WhatsApp.",
  comp_tier_lt5k: "direct charge, no verification",
  comp_tier_5k_50k: "requires trust ≥ 0.3 (whatsapp_otp)",
  comp_tier_50k_500k: "requires trust ≥ 0.5 (email_magic_link / mp_identity)",
  comp_tier_gt500k: "requires trust ≥ 0.7 (auth0 with MFA → 0.85)",

  // faq
  faq_h2: "Frequently asked questions",
  faq_q1: "How is this different from the official mercadopago SDK?",
  faq_a1:
    "The official mercadopago SDK is a thin REST client. ar-agents adds Vercel AI SDK 6 tool schemas, deterministic idempotency keys (LLM-retry-safe), webhook HMAC verification with 5-minute replay window, programmatic HITL on 8 irreversible operations, Edge-Runtime support via Web Crypto, Vercel KV adapters, and OpenTelemetry instrumentation. You can use both packages in the same project.",
  faq_q2: "Does it run on Edge Runtime?",
  faq_a2:
    "Yes. The whole package is Web Crypto-based with no node:crypto dependency. Runs on Vercel Edge, Cloudflare Workers, Deno, and any V8-isolate runtime. Webhook signature verification, HMAC, and idempotency keys all use the Web Crypto API.",
  faq_q3: "What is HITL on irreversible operations?",
  faq_a3:
    "Eight tools mutate state irreversibly (refund_payment, cancel_subscription, delete_customer_card, etc.). The toolkit accepts a requireConfirmation callback that blocks execution until your code returns true. This is a programmatic gate, not just LLM instructions.",
  faq_q4: "How does the deterministic idempotency work?",
  faq_a4:
    "Four mutating tools (create_payment, create_subscription, create_payment_preference, refund_payment) derive their idempotency key from a SHA-256 hash of the meaningful inputs. Same inputs → same key → MP dedupes server-side. An LLM retrying a tool call returns the existing resource instead of double-charging.",
  faq_q5: "Is it free?",
  faq_a5:
    "Yes. MIT license. No paid tier, no telemetry, no usage caps. Every published tarball ships SLSA v1 npm provenance attestation.",
  faq_q6: "What about AFIP, WhatsApp, banking, shipping?",
  faq_a6:
    "Sidecar packages cover the rest of the Argentine business stack. @ar-agents/identity (CUIT + AFIP/ARCA padron with monotributo + IVA), @ar-agents/facturacion (factura electronica WSFE), @ar-agents/whatsapp (Business Cloud API), @ar-agents/banking (CBU/CVU + BCRA Central de Deudores), @ar-agents/shipping (Andreani/OCA/Correo Argentino), @ar-agents/identity-attest (HMAC-signed verification orchestrator). Each ships independently.",
  faq_q7: "Is there an MCP server?",
  faq_a7:
    "Yes. @ar-agents/mcp bundles all 13 tool-bearing packages into one MCP server compatible with Claude Desktop, Cursor, Codeium, Continue, Cline. Listed on Glama and the official MCP Registry as io.github.ar-agents/mcp.",

  // footer
  footer_by: "MIT ·",
  footer_report: "report an issue",

  // demo terminal
  demo_status_ready: "ready",
  demo_status_user: "receiving prompt",
  demo_status_tool_running: "calling tool",
  demo_status_tool_done: "tool ok",
  demo_status_assistant: "responding",
  demo_status_done: "done",
  demo_replay: "Replay",

  // live chat
  live_status_ready: "live · ready",
  live_status_streaming: "live · streaming",
  live_close: "Close live demo",
  live_empty:
    "Ask the agent to charge, subscribe, or compute installments. Real Claude Sonnet 4.6 via Vercel AI Gateway + mocked tools (no real accounts charged).",
  live_input_placeholder: "Try asking it something in English or Spanish…",
  live_send: "Send",
  live_err_rate: "Rate-limited. Wait a couple of minutes and try again.",
  live_err_generic:
    "Live demo currently unavailable. Reload or try the scripted scenarios above.",

  // suggestions (live chat chips)
  sug_subscription_l: "Monthly subscription",
  sug_subscription_p:
    "Create a monthly $1500 ARS subscription for new@example.com",
  sug_cuotas_l: "Galicia installments",
  sug_cuotas_p:
    "Charge $30,000 ARS to juan@example.com on his Galicia card. Apply the best installment promo available.",
  sug_marketplace_l: "Marketplace split",
  sug_marketplace_p:
    "Generate a $8,000 ARS preference for seller @ferri. My platform takes 12%.",
} as const;

export const ES: Translations = {
  hero_h1_l1: "Infraestructura abierta para sociedades de IA.",
  hero_h1_l2: "Hecha en Argentina.",
  hero_sub:
    "Una Sociedad Automatizada opera con agentes de IA, no con empleados. ar-agents es el código abierto para constituirla y operarla.",
  cta_deploy: "Deployar en Vercel",
  cta_github: "GitHub",
  cta_npm: "npm",
  cta_cookbook: "Recetario",
  cta_try_live: "Probalo con un agente real",

  compare_h2: "Cómo se compara",
  compare_col_feature: "Característica",
  compare_col_official: "(oficial)",
  compare_col_stripe: "Toolkit",
  compare_partial: "parcial",
  compare_no: "no",
  compare_yes: "sí",
  compare_full: "completa",
  compare_thin: "REST básico",
  compare_node_only: "solo Node",
  compare_optional: "opcional",
  compare_client_only: "solo cliente",
  compare_row_schemas: "Schemas de tools del Vercel AI SDK 6",
  compare_row_ar: "Argentino-específico (cuotas, ARCA, teléfono AR)",
  compare_row_tools: "Cantidad de tools",
  compare_row_webhooks: "Webhooks: HMAC + dedup + replay window",
  compare_row_edge: "Edge Runtime + adapters de Vercel KV",
  compare_row_otel: "Instrumentación OpenTelemetry",
  compare_row_idem: "Idempotencia determinística por default",
  compare_row_hitl: "HITL programático en ops irreversibles",
  compare_row_coverage: "Cobertura de MercadoPago",

  whats_h2: "Qué incluye",
  whats_payments_t: "Pagos",
  whats_payments_d:
    "create / capture / refund · OAuth marketplace · Checkout Pro · Order Management",
  whats_subs_t: "Suscripciones",
  whats_subs_d:
    "create / get / pause / resume / cancel · planes · tarjetas guardadas",
  whats_cuotas_t: "Cuotas",
  whats_cuotas_d:
    "Catálogo de promos AR · cuotas · resolución de challenge 3DS",
  whats_qrpoint_t: "QR + Point",
  whats_qrpoint_d: "QR en local · dispositivos Point físicos · Stores + POS",
  whats_webhooks_t: "Webhooks",
  whats_webhooks_d:
    "Verificación HMAC · ventana de replay · deduplicación · handle_webhook combo",
  whats_state_t: "State",
  whats_state_d:
    "Adapters InMemory + Vercel KV listos · interfaz pluggable",
  whats_obs_t: "Observabilidad",
  whats_obs_d:
    "Trazas OpenTelemetry vía subpath · adapter de audit log · circuit breaker",
  whats_safety_t: "Seguridad",
  whats_safety_d:
    "idempotencia determinística por default · HITL programático en 8 ops irreversibles",

  other_h2: "El toolkit: un paquete por pieza del stack",
  other_intro_a: "Cada pieza del stack que un negocio argentino necesita, como package independiente en npm. Componen entre sí y con el insignia,",
  other_intro_b: ".",
  other_card_npm: "npm",
  other_card_source: "código",
  other_card_demo: "demo en vivo →",

  pp_identity:
    "Validación de CUIT/CUIL + lookup en padrón AFIP/ARCA (constancia con monotributo + condición IVA). WSAA SOAP vía subpath.",
  pp_identity_attest:
    "Orquestrador de verificación (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity). Devuelve attestation firmada con HMAC y un trust level.",
  pp_whatsapp:
    "WhatsApp Business Cloud API. Webhook + verificación HMAC. Normalizador de teléfonos AR. Modo scopedTo: bindea las tools de salida a un solo sender.",
  pp_facturacion:
    "Factura electrónica AFIP/ARCA (WSFE). Factura A/B/C, NC/ND, FCE MiPyMEs. Validador local pre-flight que atrapa los 10 motivos de rechazo más comunes antes del round-trip.",
  pp_banking:
    "Validación de CBU/CVU con identificación de banco/PSP + Central de Deudores BCRA + Principales Variables BCRA (USD oficial, CER, UVA, reservas, BADLAR, inflación). 11 tools en total.",
  pp_shipping:
    "Andreani (REST completo), OCA, Correo Argentino. cotizar / crear / trackear / cancelar. Helpers de provincia + CPA.",
  pp_mi_argentina:
    "OIDC de Mi Argentina (login con la identidad del gobierno argentino). PKCE, verificación RS256 del ID token, JWKS cacheado, refresh, end-session. Solo Web Crypto, corre en Edge.",
  pp_boletin_oficial:
    "Boletín Oficial como firehose estructurado: búsqueda, filtro por sección, obtener norma por id, suscripciones por keyword/CUIT/organismo. El 'Vercel for legal monitoring' que faltaba en el ecosistema AR.",
  pp_igj:
    "Inspección General de Justicia (IGJ) datos abiertos: búsqueda de entidades, domicilios / autoridades / balances / asambleas. Wrappea el CKAN público en datos.jus.gob.ar. Dataset es muestreo (no real-time), `coverageNote` viaja con cada resultado.",
  pp_firma_digital:
    "Firma Digital argentina (Ley 25.506 / ONTI): parsea certs X.509, verifica cadenas ancladas en AC-Raíz Argentina, verifica firmas CMS / PKCS#7 desligadas, extrae CUIT del subject del firmante. Sólo verificación, la firma real requiere token físico.",
  pp_gde_tad:
    "TAD (Trámites a Distancia) + GDE (Gestión Documental Electrónica): ingestión de notificaciones del Domicilio Electrónico Constituido, tracking de trámites, pre-flight de inscripciones IGJ. La 4ta pieza de las sociedades-IA, RFC-001 § 3.4. Sin API pública documentada todavía; adapter pattern + defaults vía scrape.",
  pp_mercadolibre:
    "SDK y tool collection independiente para el marketplace de Mercado Libre (items, categorías, preguntas, órdenes, packs, reclamos, shipments, reputación, promociones, webhooks). OAuth coalescing, replay de /myfeeds, gates HITL en operaciones irreversibles. Community-built, sin afiliación.",
  pp_agentic_commerce_bridge:
    "Merchant facilitator open-source para el Agentic Commerce Protocol (ACP) que puentea ChatGPT, Claude, Gemini y otros clientes agentic-commerce con MercadoLibre + MercadoPago. Sesiones de checkout ACP, webhooks firmados, discovery .well-known/acp.json, emisión automática de Factura A/B/C AFIP. Primer bridge agentic-commerce de LATAM.",
  pp_ap2:
    "Primera implementación TypeScript fiel del Agent Payments Protocol (AP2) v0.2, schemas, mandatos ES256 SD-JWT VC (Checkout + Payment, open + closed), 8 evaluadores de constraints, recibos Checkout/Payment firmados. Edge-Runtime-compatible. Alineado con el SDK Python de referencia del FIDO Alliance Agentic Auth WG.",
  pp_incorporate:
    "Cliente TypeScript zero-dependency para `ar-agents.ar/api/auto-incorporate`, permite que un agente externo (USA-LLC, ChatGPT, Claude, Gemini) auto-incorpore una sociedad-IA argentina en una sola llamada. Devuelve los archivos generados, la URL de deploy en Vercel y la referencia firmada del audit-log.",
  pp_mcp:
    "Servidor MCP que bundlea los 13 packages con tools. Una sola instalación en Claude Desktop / Cursor / cualquier host MCP. Auto-detecta qué packages habilitar a partir de env vars.",

  quick_h2: "Inicio rápido",

  comp_h2: "Ejemplo de composición: asistente de cobros",
  comp_intro_a:
    "muestra MP componiéndose con identity, identity-attest y whatsapp en un solo agente. Valida el CUIT contra ARCA, gatea cobros grandes con verificación (WhatsApp OTP), crea la suscripción de MP y responde por WhatsApp.",
  comp_tier_lt5k: "cobro directo, sin verificación",
  comp_tier_5k_50k: "requiere trust ≥ 0.3 (whatsapp_otp)",
  comp_tier_50k_500k: "requiere trust ≥ 0.5 (email_magic_link / mp_identity)",
  comp_tier_gt500k: "requiere trust ≥ 0.7 (auth0 con MFA → 0.85)",

  // faq (ES)
  faq_h2: "Preguntas frecuentes",
  faq_q1: "¿En qué se diferencia del SDK oficial mercadopago?",
  faq_a1:
    "El SDK oficial mercadopago es un cliente REST básico. ar-agents agrega tool schemas del Vercel AI SDK 6, idempotency keys determinísticas (resistentes a retry de LLM), verificación de webhook HMAC con ventana de replay de 5 minutos, HITL programático en 8 operaciones irreversibles, soporte Edge Runtime via Web Crypto, adapters de Vercel KV, e instrumentación OpenTelemetry. Podés usar ambos packages en el mismo proyecto.",
  faq_q2: "¿Corre en Edge Runtime?",
  faq_a2:
    "Sí. Todo el package usa Web Crypto, sin dependencia de node:crypto. Corre en Vercel Edge, Cloudflare Workers, Deno, y cualquier runtime V8-isolate. Verificación de webhooks, HMAC, e idempotency keys usan la Web Crypto API.",
  faq_q3: "¿Qué es HITL en operaciones irreversibles?",
  faq_a3:
    "8 tools modifican estado irreversiblemente (refund_payment, cancel_subscription, delete_customer_card, etc). El toolkit acepta un callback requireConfirmation que bloquea la ejecución hasta que tu código devuelva true. Es un gate programático, no solo instrucciones al LLM.",
  faq_q4: "¿Cómo funciona la idempotency determinística?",
  faq_a4:
    "Cuatro tools (create_payment, create_subscription, create_payment_preference, refund_payment) derivan la idempotency key de un hash SHA-256 de los inputs relevantes. Mismos inputs → misma key → MP deduplica server-side. Un LLM que reintenta un tool devuelve el recurso existente en vez de cobrar dos veces.",
  faq_q5: "¿Es gratis?",
  faq_a5:
    "Sí. Licencia MIT. Sin tier pago, sin telemetría, sin límites de uso. Todos los tarballs publicados llevan attestation de provenance npm SLSA v1.",
  faq_q6: "¿Qué hay de AFIP, WhatsApp, banking, shipping?",
  faq_a6:
    "Packages sidecar cubren el resto del stack argentino: @ar-agents/identity (CUIT + padrón AFIP/ARCA con monotributo + IVA), @ar-agents/facturacion (factura electrónica WSFE), @ar-agents/whatsapp (Business Cloud API), @ar-agents/banking (CBU/CVU + BCRA Central de Deudores), @ar-agents/shipping (Andreani/OCA/Correo Argentino), @ar-agents/identity-attest (orquestador de verificación HMAC). Cada uno se publica independiente.",
  faq_q7: "¿Hay servidor MCP?",
  faq_a7:
    "Sí. @ar-agents/mcp bundlea los 13 packages con tools en un único servidor MCP compatible con Claude Desktop, Cursor, Codeium, Continue, Cline. Listado en Glama y en el MCP Registry oficial como io.github.ar-agents/mcp.",

  footer_by: "MIT ·",
  footer_report: "reportar un issue",

  demo_status_ready: "listo",
  demo_status_user: "recibiendo prompt",
  demo_status_tool_running: "llamando tool",
  demo_status_tool_done: "tool ok",
  demo_status_assistant: "respondiendo",
  demo_status_done: "completado",
  demo_replay: "Replay",

  live_status_ready: "live · listo",
  live_status_streaming: "live · streameando",
  live_close: "Cerrar demo en vivo",
  live_empty:
    "Pedile que cobre, suscriba, o calcule cuotas. Real Claude Sonnet 4.6 vía Vercel AI Gateway + tools mockeados (no se cobran cuentas reales).",
  live_input_placeholder: "Probá pedirle algo en español o inglés…",
  live_send: "Enviar",
  live_err_rate: "Rate-limited. Esperá un par de minutos y probá de nuevo.",
  live_err_generic:
    "El demo en vivo no está disponible. Recargá o probá los scenarios scripted arriba.",

  sug_subscription_l: "Suscripción mensual",
  sug_subscription_p:
    "Creá una subscription mensual de $1500 ARS para nuevo@example.com",
  sug_cuotas_l: "Cuotas Galicia",
  sug_cuotas_p:
    "Cobrale $30.000 ARS a juan@example.com con su tarjeta Galicia, aplicale las mejores cuotas que tenga",
  sug_marketplace_l: "Marketplace split",
  sug_marketplace_p:
    "Generá una preference de $8.000 ARS para el seller @ferri, mi platform se lleva 12%",
};
