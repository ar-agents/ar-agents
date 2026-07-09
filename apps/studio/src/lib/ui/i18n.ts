// Pure i18n module for the studio UI (roadmap M1-3a: static UI i18n with a
// language toggle). es-AR is the default and the copy of record; en is a
// faithful, plain translation. No React import here (mirrors stage.ts /
// agent-error.ts), so this stays unit-testable without a DOM and reusable
// from both the client context and any future server-rendered copy.
//
// src/lib/ui/stage.ts and src/lib/ui/agent-error.ts are NOT touched by this
// module: their exported es-AR string constants stay the single source of
// truth, and the `agentError.*` / `stage.*` entries below simply duplicate
// those same es values (see the comments next to each) so this dictionary is
// still the one place every visible string is looked up from.

export type Locale = "es" | "en";

export const LOCALES: readonly Locale[] = ["es", "en"];

export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_STORAGE_KEY = "ar-studio-locale";

// The cookie the language toggle writes so the server can localize the page
// metadata (see layout.tsx). Same value as LOCALE_STORAGE_KEY on purpose;
// kept as a distinct named constant because one is a localStorage key and
// the other a cookie name.
export const LOCALE_COOKIE_NAME = "ar-studio-locale";

export const MESSAGES = {
  // Shared actions, reused across components instead of duplicating the
  // same word under multiple ids.
  "action.retry": { es: "Reintentar", en: "Retry" },
  "action.confirm": { es: "Confirmar", en: "Confirm" },
  "action.cancel": { es: "Cancelar", en: "Cancel" },
  "action.copied": { es: "Copiado", en: "Copied" },
  "action.refresh": { es: "Actualizar", en: "Refresh" },
  "action.approve": { es: "Aprobar", en: "Approve" },
  "action.deny": { es: "Denegar", en: "Deny" },
  "action.resume": { es: "Reanudar", en: "Resume" },
  "action.send": { es: "Enviar", en: "Send" },

  // Shared loading/error copy reused verbatim across page.tsx and
  // operation-dashboard.tsx.
  "society.loading": { es: "Cargando...", en: "Loading..." },
  "error.server_unreachable": {
    es: "No se pudo hablar con el servidor. Probá de nuevo en un rato.",
    en: "Could not reach the server. Try again in a bit.",
  },

  // Toggle
  "toggle.language.label": { es: "Cambiar idioma", en: "Switch language" },

  // src/app/page.tsx
  "app.title": { es: "ar-agents studio", en: "ar-agents studio" },
  "app.tagline": {
    es: "Creá una sociedad automatizada conversando.",
    en: "Chat your way from idea to an operating automated society.",
  },
  "session.loading": { es: "Iniciando sesión...", en: "Starting session..." },
  "account.error": {
    es: "No pudimos iniciar tu sesión anónima. Puede ser un problema de red.",
    en: "We could not start your anonymous session. It might be a network problem.",
  },
  "society.error": {
    es: "No pudimos cargar el estado de tu sociedad.",
    en: "We could not load your society's status.",
  },

  // src/components/chat.tsx
  "chat.empty": {
    es: "Contame qué querés armar y empezamos.",
    en: "Tell me what you want to build and let's get started.",
  },
  "role.user": { es: "vos", en: "you" },
  "role.agent": { es: "agente", en: "agent" },
  "chat.preview.replaced": {
    es: "borrador anterior (reemplazado por uno más nuevo)",
    en: "previous draft (replaced by a newer one)",
  },
  "chat.thinking": { es: "pensando...", en: "thinking..." },
  "chat.input.placeholder": {
    es: "Ej: quiero automatizar la facturación de mi kiosco",
    en: "E.g.: I want to automate my kiosk's billing",
  },
  "tool.preview_society.pending": {
    es: "armando el borrador de la sociedad...",
    en: "putting together the society draft...",
  },
  "tool.preview_society.done": { es: "borrador listo", en: "draft ready" },
  "tool.good_standing.pending": {
    es: "consultando el certificador...",
    en: "checking the certifier...",
  },
  "tool.good_standing.done": {
    es: "estado del registro consultado",
    en: "registry status checked",
  },
  "tool.my_society.pending": { es: "revisando tu sociedad...", en: "reviewing your society..." },
  "tool.my_society.done": { es: "sociedad revisada", en: "society reviewed" },
  "tool.generic.pending": { es: "ejecutando {name}...", en: "running {name}..." },
  "tool.generic.done": { es: "{name} listo", en: "{name} done" },
  "tool.error": { es: "{name}: no se pudo completar", en: "{name}: could not complete" },

  // These four duplicate src/lib/ui/agent-error.ts's exported es constants
  // (CAP_MESSAGE, NO_MODEL_MESSAGE, PROVIDER_NO_CREDIT_MESSAGE,
  // PROVIDER_SATURATED_MESSAGE, NETWORK_MESSAGE, UNKNOWN_MESSAGE) on purpose:
  // agent-error.ts is not editable (its tests import those constants), so
  // chat.tsx looks up the localized copy here by `kind` and only falls back
  // to `agentError.message` (the es constant) if a lookup ever misses.
  "agentError.cap": {
    es: "Llegaste al límite gratuito de este mes. Un cap es un tope de gasto en modelos para que la demo no te salga cara a vos ni a nosotros. El mes que viene se resetea.",
    en: "You reached this month's free limit. A cap is a spending limit on models so the demo does not get expensive for you or for us. It resets next month.",
  },
  "agentError.no_model_configured": {
    es: "Todavía no hay un modelo de lenguaje configurado en este entorno. Definí OPENROUTER_API_KEY o AI_GATEWAY_API_KEY (ver .env.example) para activar el agente.",
    en: "There is no language model configured in this environment yet. Set OPENROUTER_API_KEY or AI_GATEWAY_API_KEY (see .env.example) to activate the agent.",
  },
  "agentError.provider_no_credit": {
    es: "El proveedor de modelos rechazó el pedido por falta de crédito. Es un problema de configuración nuestro, no tuyo.",
    en: "The model provider rejected the request for lack of credit. This is a configuration problem on our side, not yours.",
  },
  "agentError.provider_saturated": {
    es: "El modelo está saturado en este momento. Esperá unos segundos y probá de nuevo.",
    en: "The model is saturated right now. Wait a few seconds and try again.",
  },
  "agentError.network": {
    es: "No se pudo hablar con el agente (falla de red). Probá de nuevo en un rato.",
    en: "Could not reach the agent (network failure). Try again in a bit.",
  },
  "agentError.unknown": {
    es: "Algo salió mal hablando con el agente. Probá de nuevo en un rato.",
    en: "Something went wrong talking to the agent. Try again in a bit.",
  },

  // src/components/journey-rail.tsx (STAGES labels live in stage.ts and stay
  // untouched; these duplicate the same es copy so the rail can render a
  // localized label without editing that file).
  "journey.heading": { es: "Tu recorrido", en: "Your journey" },
  "stage.idea": { es: "Idea", en: "Idea" },
  "stage.validacion": { es: "Validación", en: "Validation" },
  "stage.spec": { es: "Especificación", en: "Specification" },
  "stage.constitucion": { es: "Constitución", en: "Incorporation" },
  "stage.operacion": { es: "Operación", en: "Operation" },

  // src/components/operation-dashboard.tsx
  "dashboard.society.heading": { es: "Tu sociedad", en: "Your society" },
  "dashboard.society.subtitle": {
    es: "{tipo} · registro {registryId}",
    en: "{tipo} · registry {registryId}",
  },
  "dashboard.goodStanding.noData": { es: "sin datos", en: "no data" },
  "dashboard.status.active": { es: "activa", en: "active" },
  "dashboard.status.suspended": { es: "suspendida", en: "suspended" },
  "dashboard.pendingApprovals.badge": { es: "{count} pendientes", en: "{count} pending" },
  "dashboard.agent.heading": { es: "Agente de la sociedad", en: "The society's agent" },
  "dashboard.agent.deployedIn": { es: "Desplegado en", en: "Deployed at" },
  "dashboard.agent.projectInfo": {
    es: "Proyecto {project} · desde {date}",
    en: "Project {project}, since {date}",
  },
  "dashboard.agent.deployState": {
    es: "Estado del despliegue: {state}",
    en: "Deploy status: {state}",
  },
  "dashboard.agent.manualExplain": {
    es: "Studio no tiene un token de Vercel configurado, así que el despliegue es manual: hacé click, pegá las variables de abajo en el proyecto nuevo y guardá la API key ya, no se puede volver a ver.",
    en: "Studio does not have a Vercel token configured, so the deploy is manual. Click through, paste the variables below into the new project, and save the API key now, it cannot be shown again.",
  },
  "dashboard.agent.deployToVercel": { es: "Desplegar en Vercel", en: "Deploy to Vercel" },
  "dashboard.agent.envVarsLabel": { es: "Variables de entorno", en: "Environment variables" },
  "dashboard.agent.copyEnvVars": { es: "Copiar variables", en: "Copy variables" },
  "dashboard.agent.saveKeyWarning": {
    es: "Guardá el valor de AGENT_API_KEY en un lugar seguro: no lo vamos a volver a mostrar.",
    en: "Save the AGENT_API_KEY value somewhere safe, we will not show it again.",
  },
  "dashboard.agent.notDeployedYet": {
    es: "Desplegá la app que va a operar la sociedad las 24 horas.",
    en: "Deploy the app that will operate the society around the clock.",
  },
  "dashboard.agent.deployRateLimited": {
    es: "Llegaste al límite de despliegues de hoy. Probá de nuevo mañana.",
    en: "You reached today's deploy limit. Try again tomorrow.",
  },
  "dashboard.agent.deployError": {
    es: "No se pudo desplegar el agente. Probá de nuevo en un rato.",
    en: "Could not deploy the agent. Try again in a bit.",
  },
  "dashboard.agent.deploying": { es: "Desplegando...", en: "Deploying..." },
  "dashboard.agent.deployCta": { es: "Desplegar agente", en: "Deploy agent" },
  "dashboard.approvals.heading": { es: "Aprobaciones pendientes", en: "Pending approvals" },
  "dashboard.approvals.error": {
    es: "No se pudieron cargar las aprobaciones.",
    en: "Could not load the approvals.",
  },
  "dashboard.approvals.empty": {
    es: "No hay aprobaciones pendientes.",
    en: "There are no pending approvals.",
  },
  "dashboard.approvals.defaultTool": { es: "acción", en: "action" },
  "dashboard.killswitch.heading": { es: "Interruptor de emergencia", en: "Emergency switch" },
  "dashboard.killswitch.explain": {
    es: "Como administrador (art. 102) podés suspender la sociedad en cualquier momento: mientras esté suspendida, el agente no puede ejecutar ninguna acción.",
    en: "As administrator (art. 102) you can suspend the society at any time. While suspended, the agent cannot execute any action.",
  },
  "dashboard.suspend.action": { es: "Suspender sociedad", en: "Suspend society" },
  "dashboard.resume.title": { es: "Reanudar sociedad", en: "Resume society" },
  "dashboard.suspend.explainWill": {
    es: "Mientras esté suspendida, el agente de la sociedad no podrá ejecutar ninguna acción.",
    en: "While suspended, the society's agent will not be able to execute any action.",
  },
  "dashboard.suspend.explainResume": {
    es: "La sociedad vuelve a poder operar normalmente.",
    en: "The society goes back to operating normally.",
  },
  "dashboard.suspend.reasonLabel": { es: "Motivo (opcional)", en: "Reason (optional)" },
  "dashboard.suspend.reasonPlaceholder": {
    es: "Ej: quiero revisar la actividad reciente",
    en: "E.g.: I want to review recent activity",
  },
  "dashboard.suspend.confirmCheckbox": {
    es: "Confirmo esta acción como administrador de la sociedad.",
    en: "I confirm this action as administrator of the society.",
  },
  "dashboard.suspend.applyError": {
    es: "No se pudo aplicar el cambio. Probá de nuevo en un rato.",
    en: "Could not apply the change. Try again in a bit.",
  },
  "dashboard.suspend.applying": { es: "Aplicando...", en: "Applying..." },
  "dashboard.usage.heading": { es: "Uso este mes", en: "Usage this month" },
  "dashboard.usage.error": {
    es: "No se pudo cargar el uso de la cuenta.",
    en: "Could not load the account's usage.",
  },
  "dashboard.usage.tokens": {
    es: "Tokens: {inTok} entrada · {outTok} salida",
    en: "Tokens: {inTok} in, {outTok} out",
  },
  "dashboard.usage.realCost": { es: "Costo real: {cost}", en: "Real cost: {cost}" },
  "dashboard.usage.priceIfOperative": {
    es: "Precio si estuviera operativa (5x): {price}",
    en: "Price if it were operating (5x): {price}",
  },
  "dashboard.usage.capRemaining": {
    es: "Te queda {remaining} del límite gratuito de este mes.",
    en: "You have {remaining} left of this month's free limit.",
  },

  // src/components/constitution-card.tsx
  "constitution.error.alreadyExists": {
    es: "Esta cuenta ya tiene una sociedad constituida. Solo se puede constituir una por cuenta.",
    en: "This account already has an incorporated society. Only one can be incorporated per account.",
  },
  "constitution.error.art102Required": {
    es: "Falta aceptar la responsabilidad del art. 102.",
    en: "You still need to accept the art. 102 responsibility.",
  },
  "constitution.error.cuitInvalid": {
    es: "El CUIT del administrador no es válido.",
    en: "The administrator's CUIT is not valid.",
  },
  "constitution.error.adminNameRequired": {
    es: "Falta el nombre del administrador.",
    en: "The administrator's name is missing.",
  },
  "constitution.error.rateLimited": {
    es: "Demasiados intentos. Esperá un rato y volvé a intentar.",
    en: "Too many attempts. Wait a bit and try again.",
  },
  "constitution.error.generic": {
    es: "No se pudo constituir la sociedad. Probá de nuevo en un rato.",
    en: "Could not incorporate the society. Try again in a bit.",
  },
  "constitution.alreadyHasSociety": {
    es: "Esta cuenta ya tiene una sociedad constituida.",
    en: "This account already has an incorporated society.",
  },
  "constitution.draftLabel": { es: "Borrador de sociedad", en: "Society draft" },
  "constitution.noName": { es: "Sin nombre", en: "No name" },
  "constitution.capitalSocial": {
    es: "· capital social {amount}",
    en: "· share capital {amount}",
  },
  "constitution.credentialsWarning": {
    es: "Guardá estas credenciales ahora: no se muestran de nuevo.",
    en: "Save these credentials now, they will not be shown again.",
  },
  "constitution.copyAdmin": { es: "Copiar admin", en: "Copy admin" },
  "constitution.copyGate": { es: "Copiar gate", en: "Copy gate" },
  "constitution.cta": { es: "Constituir (borrador)", en: "Incorporate (draft)" },
  "constitution.dialog.title": { es: "Constituir {name}", en: "Incorporate {name}" },
  "constitution.dialog.explain": {
    es: "Pre-ley esto crea un registro simulado (BORRADOR): no presenta nada ante ningún organismo y no mueve dinero.",
    en: "Pre-law, this creates a simulated record (DRAFT). It does not file anything with any agency and does not move money.",
  },
  "constitution.adminNameLabel": { es: "Nombre del administrador", en: "Administrator's name" },
  "constitution.adminNamePlaceholder": { es: "Nombre y apellido", en: "First and last name" },
  "constitution.adminCuitLabel": { es: "CUIT del administrador", en: "Administrator's CUIT" },
  "constitution.adminCuitPlaceholder": { es: "20-12345678-6", en: "20-12345678-6" },
  "constitution.cuitInvalid": { es: "CUIT inválido.", en: "Invalid CUIT." },
  "constitution.art102Accept": {
    es: "Acepto la responsabilidad de administrador bajo el art. 102 (supervisión no delegable de la sociedad automatizada).",
    en: "I accept the administrator responsibility under art. 102 (non-delegable supervision of the automated society).",
  },
  "constitution.submitting": { es: "Constituyendo...", en: "Incorporating..." },

  // src/components/credentials-panel.tsx (ROADMAP.md M3-1)
  "credentials.heading": { es: "Credenciales", en: "Credentials" },
  "credentials.needsDeploy": {
    es: "Desplegá el agente primero para poder configurar sus credenciales.",
    en: "Deploy the agent first to configure its credentials.",
  },
  "credentials.error": {
    es: "No se pudieron cargar las credenciales.",
    en: "Could not load the credentials.",
  },
  "credentials.status.configured": { es: "configurada", en: "configured" },
  "credentials.status.missing": { es: "falta", en: "missing" },
  "credentials.status.verified": { es: "verificada", en: "verified" },
  "credentials.status.unverified": { es: "sin verificar", en: "unverified" },
  "credentials.status.hint": { es: "termina en {hint}", en: "ends in {hint}" },
  "credentials.action.configure": { es: "Configurar", en: "Configure" },
  "credentials.action.edit": { es: "Editar", en: "Edit" },
  "credentials.action.save": { es: "Guardar", en: "Save" },
  "credentials.action.saving": { es: "Guardando...", en: "Saving..." },

  "credentials.modelKey.label": { es: "Modelo de lenguaje", en: "Language model" },
  "credentials.modelKey.choicePlatform": {
    es: "Usar el modelo de la plataforma",
    en: "Use the platform's model",
  },
  "credentials.modelKey.choiceOwn": { es: "Usar mi propia clave", en: "Use my own key" },
  "credentials.modelKey.apiKeyLabel": { es: "Clave de API de Anthropic", en: "Anthropic API key" },
  "credentials.modelKey.apiKeyPlaceholder": { es: "sk-ant-...", en: "sk-ant-..." },
  "credentials.modelKey.help": {
    es: "Se usa para operar el agente de la sociedad. Conseguila en console.anthropic.com.",
    en: "Used to run the society's agent. Get one at console.anthropic.com.",
  },

  "credentials.mercadopago.label": { es: "Mercado Pago", en: "Mercado Pago" },
  "credentials.mercadopago.accessTokenLabel": {
    es: "Access token de producción",
    en: "Production access token",
  },
  "credentials.mercadopago.help": {
    es: "developers.mercadopago.com, tu app, Credenciales de producción.",
    en: "developers.mercadopago.com, your app, Production credentials.",
  },

  "credentials.whatsapp.label": { es: "WhatsApp Business", en: "WhatsApp Business" },
  "credentials.whatsapp.accessTokenLabel": { es: "Token de acceso", en: "Access token" },
  "credentials.whatsapp.phoneNumberIdLabel": {
    es: "ID del número de teléfono",
    en: "Phone number ID",
  },
  "credentials.whatsapp.help": {
    es: "Meta Business Manager, WhatsApp Business, API. El ID es numérico, no el número en sí.",
    en: "Meta Business Manager, WhatsApp Business, API. The ID is numeric, not the phone number itself.",
  },

  "credentials.afip.label": { es: "Certificado AFIP", en: "AFIP certificate" },
  "credentials.afip.certLabel": { es: "Certificado (PEM)", en: "Certificate (PEM)" },
  "credentials.afip.keyLabel": { es: "Clave privada (PEM)", en: "Private key (PEM)" },
  "credentials.afip.cuitLabel": { es: "CUIT", en: "CUIT" },
  "credentials.afip.envLabel": { es: "Entorno", en: "Environment" },
  "credentials.afip.envHomo": { es: "Homologación (prueba)", en: "Homologation (test)" },
  "credentials.afip.envProd": { es: "Producción", en: "Production" },
  "credentials.afip.help": {
    es: "Emitido por ARCA, Clave Fiscal, Asociar Servicio Web. Cubre facturación (wsfe) y padrón.",
    en: "Issued by ARCA, Clave Fiscal, Asociar Servicio Web. Covers invoicing (wsfe) and the taxpayer registry.",
  },

  "credentials.treasury.label": { es: "Cuenta de retiro (Manteca)", en: "Off-ramp account (Manteca)" },
  "credentials.treasury.apiKeyLabel": { es: "API key", en: "API key" },
  "credentials.treasury.userIdLabel": { es: "ID de usuario", en: "User ID" },
  "credentials.treasury.bankAccountIdLabel": { es: "Cuenta bancaria", en: "Bank account" },
  "credentials.treasury.help": {
    es: "Panel de Manteca, sección de API. Convierte USDC de la tesorería a pesos.",
    en: "Manteca dashboard, API section. Converts the treasury's USDC to pesos.",
  },

  "credentials.result.savedVerified": { es: "Guardado y verificado.", en: "Saved and verified." },
  "credentials.result.savedUnverified": {
    es: "Guardado (sin verificar contra un servicio en vivo).",
    en: "Saved (not verified against a live service).",
  },
  "credentials.redeploy.pending": {
    es: "Redesplegando la sociedad para que tome el cambio...",
    en: "Redeploying the society so the change takes effect...",
  },
  "credentials.redeploy.ok": { es: "Sociedad redesplegada.", en: "Society redeployed." },
  "credentials.redeploy.error": {
    es: "El dato se guardó, pero no se pudo redesplegar la sociedad. Probá de nuevo más tarde.",
    en: "The data was saved, but the society could not be redeployed. Try again later.",
  },
  "credentials.redeploy.unavailable": {
    es: "El dato se guardó. Este entorno no puede redesplegar automáticamente.",
    en: "The data was saved. This environment cannot redeploy automatically.",
  },
  "credentials.error.saveFailed": {
    es: "No se pudo guardar. Probá de nuevo en un rato.",
    en: "Could not save. Try again in a bit.",
  },

  // src/components/society-cockpit.tsx (ROADMAP.md M3-2): the "sociedad en
  // vivo" cockpit, the founder-facing replacement for visiting the raw
  // deploy URL.
  "cockpit.heading": { es: "La sociedad en vivo", en: "The society, live" },
  "cockpit.subtitle": {
    es: "{version} · activa hace {uptime}",
    en: "{version} · running for {uptime}",
  },
  "cockpit.provisioning": {
    es: "Activando el panel en vivo por primera vez. Puede tardar unos minutos en aparecer.",
    en: "Activating the live panel for the first time. It can take a few minutes to show up.",
  },
  "cockpit.unavailable": { es: "sin datos todavía", en: "no data yet" },
  "dashboard.agent.viewDeployTechnical": { es: "ver deploy (técnico)", en: "view deploy (technical)" },

  "cockpit.deploy.heading": { es: "Estado del deploy", en: "Deploy status" },
  "cockpit.deploy.state.ready": { es: "en línea", en: "live" },
  "cockpit.deploy.state.building": { es: "construyendo", en: "building" },
  "cockpit.deploy.state.queued": { es: "en cola", en: "queued" },
  "cockpit.deploy.state.initializing": { es: "iniciando", en: "initializing" },
  "cockpit.deploy.state.error": { es: "con error", en: "errored" },
  "cockpit.deploy.state.canceled": { es: "cancelado", en: "canceled" },
  "cockpit.deploy.state.blocked": { es: "bloqueado", en: "blocked" },

  "cockpit.clients.heading": { es: "Clientes externos conectados", en: "Connected external clients" },
  "cockpit.clients.summary": { es: "{wired}/{total} configurados", en: "{wired}/{total} configured" },
  "cockpit.clients.hint": {
    es: "Completá los que faltan en Credenciales, abajo.",
    en: "Fill in the missing ones in Credentials, below.",
  },

  "cockpit.killswitch.heading": { es: "Estado operativo (visto por el agente)", en: "Operating state (as seen by the agent)" },

  "cockpit.approvals.heading": { es: "Aprobaciones pendientes", en: "Pending approvals" },
  "cockpit.approvals.summary": { es: "{count} esperando aprobación", en: "{count} awaiting approval" },
  "cockpit.approvals.empty": { es: "No hay nada esperando aprobación.", en: "Nothing is awaiting approval." },

  "cockpit.audit.heading": { es: "Acciones recientes", en: "Recent actions" },
  "cockpit.audit.empty": {
    es: "Todavía no hay acciones registradas.",
    en: "No actions have been recorded yet.",
  },
  "cockpit.audit.errored": { es: "con error", en: "errored" },

  "cockpit.usage.heading": { es: "Uso y tesorería de la sociedad", en: "The society's usage and treasury" },
  "cockpit.usage.unavailable": {
    es: "Todavía no hay datos de uso ni tesorería de la sociedad operando. Esta sección se completa con el trabajo de tesorería en curso.",
    en: "There is no usage or treasury data from the operating society yet. This section fills in with the treasury work in progress.",
  },

  // src/app/layout.tsx metadata
  "meta.title": { es: "ar-agents studio", en: "ar-agents studio" },
  "meta.description": {
    es: "Creá una sociedad automatizada conversando, sobre ar-agents.",
    en: "Chat your way from idea to an operating Argentine automated society, on top of ar-agents.",
  },
} satisfies Record<string, Record<Locale, string>>;

export type MessageId = keyof typeof MESSAGES;

/** Looks up a message, falling back to DEFAULT_LOCALE when the requested
 *  locale's value is missing or empty (defensive: every entry above is
 *  filled in, but this keeps a bad edit from ever rendering blank copy). */
export function t(locale: Locale, id: MessageId): string {
  const entry = MESSAGES[id];
  const value = entry[locale];
  if (value) return value;
  return entry[DEFAULT_LOCALE];
}

/** `t` plus `{key}` placeholder substitution. Unknown placeholders (no
 *  matching key in `vars`) are left untouched rather than erased. */
export function format(locale: Locale, id: MessageId, vars: Record<string, string>): string {
  const template = t(locale, id);
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/** Narrows a value read from storage (or anywhere else untrusted) down to a
 *  known Locale, defaulting to DEFAULT_LOCALE for anything else (missing,
 *  empty, or an unrecognized code). */
export function resolveInitialLocale(stored: string | null | undefined): Locale {
  if (stored === "es" || stored === "en") return stored;
  return DEFAULT_LOCALE;
}

/** The page metadata (browser tab title and description) for a locale,
 *  used by generateMetadata in src/app/layout.tsx. Pure so it is unit
 *  testable without next/headers or a DOM. */
export function metadataForLocale(locale: Locale): { title: string; description: string } {
  return {
    title: t(locale, "meta.title"),
    description: t(locale, "meta.description"),
  };
}
