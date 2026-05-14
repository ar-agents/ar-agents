# Launch Sociedades-IA — playbook completo

> **SINGLE SOURCE OF TRUTH** para toda copy pública del launch. Supersedes `docs/launch/*` (que queda como histórico). Cualquier edición de copy de launch va acá, no en archivos paralelos.

**Status @ 2026-05-09**:
- ✅ RFC-001 publicado en `/rfcs/001` (draft-01, CC0, 8 may)
- ✅ Manifiesto publicado en `/manifiesto`
- ✅ Página tesis en `/sociedades-ia` con mapa 17-piezas + AGENT_FLOW transcript
- ✅ Demo interactivo en `/play` (sandboxed, audit log en vivo)
- ✅ Press kit en `/press-kit`, comparativa en `/vs`, threat model en `/security`, arquitectura en `/architecture`, flow de incorporación en `/incorporar`
- ✅ **8 packages live en npm**: mercadopago 0.17.2, identity 0.7.0, identity-attest 0.4.2, whatsapp 0.4.0, facturacion 0.3.0, banking 0.4.0, shipping 0.2.0, mcp 0.10.0
- 🟡 **5 packages dist-ready unpublished**: firma-digital 0.1.0, igj 0.1.0, mi-argentina 0.1.0, boletin-oficial 0.1.0, agentic-commerce-bridge 5.0.0 — `pnpm publish` 5 min para los 5
- ✅ Apps live: cuit-hello, whatsapp-hello, mp-hello (dev), bridge-hello, sociedad-ia-starter (`npx create-arg-sociedad`), mercadolibre-landing
- ✅ MCP Registry oficial publicado, Glama listed, OpenSSF Scorecard live
- 🟡 `DISTRIBUTION-HANDOFF.md` — playbook MP-toolkit, primera ola. Este doc es la **segunda ola** con ángulo sociedades-IA.

**Decisión bloqueante antes del lunes**: ¿publicamos los 5 dist-ready packages? Mi voto: **sí**. Pasa narrativa de "8 packages" a "13 packages, 168 tools". 5 min de `pnpm changeset` + publish.

**Goal de esta semana**: ser visible para (a) Sturzenegger team + Subsec TIC + AR civic-tech, (b) prensa AR técnica, (c) foreign agent infra, antes de que el borrador del proyecto entre a Diputados o cualquier competidor argentino lance equivalente.

---

## Day-by-day (Lun 11 may → Dom 17 may)

| Día | Acción | Tiempo | Owner |
|---|---|---|---|
| **Dom 10** | Pulir RFC-001, grabar demo video (script en `DEMO-VIDEO-SCRIPT.md`), publicar unlisted en YouTube | 4-5 hs | Vos |
| **Lun 11** | Show HN 10am EDT / 11am ART. r/devsarg post 14:00 ART. Twitter thread ES 16:00 ART | 1-2 hs activa + responder comments | Vos |
| **Mar 12** | LinkedIn post 09:00 ART. r/programacion 13:00 ART. Responder mentions HN/X | 1 hs activa | Vos |
| **Mié 13** | Twitter thread EN 14:00 ART (= 9am EST, captura US morning + EU afternoon). r/AI_Agents | 1 hs | Vos |
| **Jue 14** | r/typescript. Press emails (5 envíos) 09:00 ART. AAIF working group proposal | 2 hs | Vos |
| **Vie 15** | Sturzenegger via formulario + DM. Gazzo Huck DM. Galperín + Ajmechet DMs. Foreign builders (swyx/theo/leerob/simonw). Cold partnerships (ClawBank/doola/MIDAO). AAIF working group submit | 2-3 hs | Vos |
| **Sab 16** | Day off. Solo respondés notificaciones que ya entraron | < 30 min | Vos |
| **Dom 17** | Postmortem semana 1. AR civic-tech DMs (Reingart, Zamudio, datosgobar) + WG invite. Plan semana 2 (talks abstracts a Nerdearla/JSConfAR/Vercel Ship) | 1-2 hs | Vos |

**Regla de oro**: si una pieza no estuvo lista, **no esperes — shipeá las siguientes**. La demora compone peor que la imperfección. RFC + video imperfectos > nada el lunes.

---

## 1. Show HN

**Posteá lunes 10:00 EDT exactos** (= 11:00 ART). HN front page rotativa hace que ese horario sea óptimo para US east coast morning.

### Título (76 chars, dentro del límite de 80)

```
Show HN: ar-agents – npm packages for Argentina's coming 'AI company' law
```

### URL

```
https://ar-agents.ar
```

### First comment (postear inmediatamente después del submit, queda pinned)

```
Hi HN — author here. Quick context, then what's interesting technically.

On April 28, Argentina's Minister of Deregulation announced a proposed
reform of the Corporate Companies Law to create a new entity type:
"sociedad de IA" — a corporation with zero human shareholders, zero
human directors, zero human employees. Pure code, paying taxes like any
S.A. The minister's quote: "we want 500 million AI agents incorporated
in Argentina, paying taxes here." The bill hasn't been drafted yet — it's
political momentum at this stage.

When I read the announcement I thought "someone needs to write the
technical infrastructure connecting that idea to the Argentine state".
Last Tuesday (May 5) I started building. This is what shipped in a week.

ar-agents/* is 17 npm packages covering 16 of the 17 technical pieces an
Argentine AI company would need to operate end-to-end:

- Identity (CUIT validation + ARCA padron + Mi Argentina OIDC + RENAPER bypass)
- Signing (X.509 cert + ONTI/AC-Raíz CMS verification, Ley 25.506)
- Money (MercadoPago: 89 typed tools, AFIP electronic invoicing, banking with BCRA debt registry)
- Customer ops (WhatsApp Business, shipping via Andreani/OCA/Correo)
- State monitoring (Boletín Oficial subscriptions by CUIT/organism/keyword)
- Macro (BCRA exchange rates + CER index)
- Corporate registry (IGJ — sociedades, authorities, balances)

The 17th piece — digital legal address via the government's GDE/TAD
system — needs gov authorization for a client app, no public API. Working
on that next.

Everything ships AGENTS.md per package per the agents.md convention
(Linux Foundation Agentic AI Foundation), so an LLM reads tool selection
rules + result schemas + error patterns + latency tables at runtime.
Edge Runtime via Web Crypto, npm provenance attestations (SLSA v1),
deterministic SHA-256 idempotency keys so retries don't double-charge,
programmatic HITL on irreversible operations.

Live interactive demo at ar-agents.ar/play — Claude Sonnet 4.6
against mocked MP tools, no signup, audit log streaming RFC-001 § 9
HMAC-signed entries as the agent runs. Press kit at /press-kit, threat
model at /security, comparative breakdown at /vs.

RFC-001 (CC0, public comments) lays out the technical proposal for how
identity/signature/notification/payment work for an entity without
humans, plus a 3-tier liability framework (operational / audit /
operator-of-record) addressing the central legal critique of the
Sturzenegger plan: "who's liable when an AI company defrauds someone?"
ar-agents.ar/rfcs/001

Open to:
- Engineering critique on the agent ergonomics (HITL UX, idempotency model, AGENTS.md vs tool descriptions)
- Legal/regulatory critique on the liability framework
- Pointers to similar work in other jurisdictions (Wyoming DAO LLC, Marshall Islands MIDAO, etc.)

License MIT. Repo: github.com/ar-agents/ar-agents
```

### Si HN no engancha en las primeras 2 horas

- Pedile a 3 amigos devs de upvotear (NO comprar votos — solo convocar gente que naturalmente votaría).
- Si a las 3 hs no entra a `/newest` ranking decentemente, **NO repostees el mismo día**. Esperá 24 hs y intentá con título distinto.

---

## 2. Reddit posts

**Política**: 1 sub por día (no más). Mods odian cross-posting agresivo. Subreddits con reglas estrictas (`r/argentina`) los SALTEAMOS.

### r/devsarg (lunes 14:00 ART, después del Show HN)

**Title**:
```
Vi el anuncio de Sturzenegger sobre sociedades de IA y construí la infra técnica en una semana — la comparto
```

**Body**:
```
Hola gente. Soy Naza, dev argentino.

El 28 de abril Sturzenegger anunció en Expo EFI un proyecto para crear
"sociedad de IA" — empresa con cero humanos, 100% código, paga impuestos
como cualquier SA. Cita literal del ministro: "podríamos tener 500
millones de agentes de IA incorporados acá, pagando impuestos en nuestro
país".

Cuando vi el anuncio pensé "alguien tiene que escribir el código que
conecta esto al Estado argentino, alguien que entienda los protocolos
financieros y regulatorios AR". El martes pasado (5/5) me puse a
construir. Esta es la semana que pasó.

Cubrí 16 de las 17 piezas técnicas que esa figura jurídica va a
necesitar para operar end-to-end. Está todo en npm bajo `@ar-agents/*`.
La única que falta es el alta de aplicación cliente vía TAD/GDE — eso
requiere autorización gubernamental, no es scrapeable cleanly.

Lo que cubre cada pieza:
- Existir como entidad: IGJ datos abiertos, CUIT vía ARCA padrón
- Probar quién es: Mi Argentina OIDC, firma digital ONTI/AC-Raíz, RENAPER bypass
- Manejar plata: MP (89 tools), AFIP factura electrónica WSFE, banking + BCRA
- Operar con clientes: WhatsApp Business, Andreani/OCA/Correo
- Inteligencia operacional: Boletín Oficial subscriptions, BCRA Variables

Todos los paquetes son MIT, Edge Runtime via Web Crypto, npm provenance
attestation, idempotency determinística por SHA-256 de los inputs (para
que cuando el LLM reintente no double-charge), HITL programático en
operaciones irreversibles.

Cada package ships AGENTS.md per package siguiendo la convención de
agents.md (Linux Foundation Agentic AI Foundation): decision tree, result
schemas, error patterns, latency table. Es lo que hace que un agente
elija bien la tool en el primer intento.

Demo en vivo (Claude Sonnet 4.6 vía Vercel AI Gateway, MP mockeado, sin
signup): ar-agents.ar

RFC-001 (CC0, comments públicos) con la propuesta de cómo se resuelve
identidad/firma/notificación/pago, más un marco de responsabilidad de 3
capas que responde al ataque legal central ("¿quién responde si una
sociedad-IA defrauda?"): ar-agents.ar/rfcs/001

Abierto a:
- Code review crítico de la API (HITL UX, idempotency, AGENTS.md vs tool descriptions)
- Comentarios legales del marco de responsabilidad
- Punteros a otras jurisdicciones (Wyoming DAO LLC, Marshall Islands MIDAO)
- PRs si querés laburar en `@ar-agents/tad` (la pieza que falta)

Repo: github.com/ar-agents/ar-agents
npm: npmjs.com/org/ar-agents
```

### r/programacion (martes 13:00 ART)

**Title**:
```
Toolkit OSS para que un agente IA opere como sociedad argentina (post-anuncio Sturzenegger)
```

**Body**: usar el mismo de `r/devsarg` pero con primer párrafo más explicativo (audiencia más LATAM general):

```
Buenas. Soy Naza, dev argentino. Para contexto que a lectores fuera de
Argentina les puede servir: el 28 de abril el ministro de Desregulación
argentino anunció un proyecto de ley para crear "sociedad de IA" — un
nuevo tipo de empresa que no requiere accionistas, directores, ni
empleados humanos. La ley no existe todavía pero el momentum político
está alto.

[resto igual a r/devsarg]
```

### r/AI_Agents (miércoles, después del Twitter EN)

**Title**:
```
Argentina announced a legal framework for autonomous AI corporations. I built the SDK in a week.
```

**Body**:
```
Some context for non-LATAM folks: on April 28, Argentina's Minister of
Deregulation publicly announced a proposed reform of the Corporate
Companies Law to create a new entity type: "sociedad de IA" — a
corporation with zero human shareholders, zero human directors, zero
human employees. Pure code, paying taxes like any S.A. or LLC. Quote
from the minister: "we want 500 million AI agents incorporated in
Argentina paying taxes here."

The bill hasn't been drafted yet (Argentina works that way). Political
momentum is genuine but execution risk is real (legislative elections in
October).

When the announcement happened I realized this needed technical infra
that wasn't going to come from the political side. Last Tuesday (May 5)
I started building it as 17 npm packages under @ar-agents/* covering 16
of 17 technical pieces an AI corporation would need to operate end-to-end
in Argentina:

- Identity (CUIT + AFIP/ARCA padron + Mi Argentina OIDC + signing certs)
- Money (MercadoPago / AFIP electronic invoicing / banking + BCRA debt registry)
- Communication (WhatsApp Business)
- State monitoring (official gazette subscriptions)
- Logistics, exchange rates, corporate registry

Each package ships AGENTS.md per the agents.md convention (Linux
Foundation Agentic AI Foundation), so an LLM reads tool-selection rules
+ result schemas + error patterns + latency tables at runtime. Edge
Runtime, Web Crypto, npm provenance attestations (SLSA v1), deterministic
SHA-256 idempotency, programmatic HITL on irreversible operations.

Live demo runs Claude Sonnet 4.6 — agent composes 4 of the packages to
handle a "charge $25k/mo, send WhatsApp, emit invoice" flow:
ar-agents.ar

RFC-001 (CC0) covers the technical proposal for how
identity/signature/notification/payment work without humans in the loop,
plus a 3-tier liability framework (operational / audit / operator-of-record):
ar-agents.ar/rfcs/001

Curious specifically about:
- How Wyoming DAO LLC tooling (ClawBank, Otonomos) compares once you actually try to operate one in production
- Pointers to other jurisdictional experiments
- Critique of the AGENTS.md format from teams using it heavily

License MIT. Repo: github.com/ar-agents/ar-agents
```

### r/typescript (jueves)

**Title**:
```
ar-agents: 11 typed Vercel AI SDK 6 toolkits for the Argentine state stack
```

**Body**: tech-focused, light on política

```
Just shipped this. 17 npm packages turning the entire Argentine state +
financial stack into typed Vercel AI SDK 6 tools so an LLM agent can
drive billing/identity/comms/legal flows from prompts.

Things I tried to get right for agent ergonomics on top of TypeScript
basics:

- AGENTS.md per package (Linux Foundation Agentic AI Foundation
  convention) — runtime guide the LLM reads with decision tree, result
  schemas, error patterns, latency tables. Significantly bumps tool-
  selection accuracy on first try.

- Deterministic SHA-256 idempotency keys derived from meaningful inputs.
  An LLM retrying create_payment doesn't double-charge — same inputs,
  same key, server dedupes.

- Programmatic HITL callback on 8 irreversible operations (refund,
  cancel, delete card, etc.). The tool literally won't execute until your
  callback returns true. Not "instructions to the model" — actual code
  gate.

- Webhook HMAC + constant-time comparison + 5-min replay window built-in.

- npm provenance attestations (SLSA v1) on every published tarball.
  Downstream agents verify build provenance without trusting the publisher.

- Subpath exports for adapters: @ar-agents/mercadopago/vercel-kv for KV-
  backed state/oauth/idempotency/audit, @ar-agents/mercadopago/otel for
  OpenTelemetry. You only pay for what you import.

- Edge Runtime native via Web Crypto, no node:crypto. Runs on Vercel
  Edge, Cloudflare Workers, Deno. Bundle is 41 KB ESM brotli'd for the
  main package.

Live agent demo (Claude Sonnet 4.6 via Vercel AI Gateway, mocked MP):
ar-agents.ar

Curious about feedback on:
- HITL callback API in non-interactive contexts (cron, queue worker) —
  current API blocks; people will want pause-and-resume
- Tool description tuning (always seen by the model) vs. AGENTS.md
  (sometimes seen). What's the right split?
- Whether subpath exports are still considered idiomatic post-package.json
  exports field stabilizing

Repo with full type definitions: github.com/ar-agents/ar-agents
```

---

## 3. Twitter threads

### ES thread — 12 tweets (lunes 16:00 ART) — voz Naza

**Notas de voz**: minúsculas todo, casual, primera persona, Rioplatense. La narrativa: 28/4 Sturzenegger anuncia → 5/5 (martes pasado) Naza arranca → 11/5 (lunes launch) son 11 paquetes + RFC + manifiesto + sociedades-ia page. NO "plan secreto reveal", SÍ "vi el anuncio y me puse a construir el martes".

```
1/ el 28/4 sturzenegger anunció en expo efi el proyecto de "sociedad de
ia": empresa argentina con cero humanos, 100% código.

cuando lo vi pensé que alguien tenía que escribir la infra técnica que
conecta esto al estado argentino. el martes pasado me puse a construir.

acá lo que armé en una semana ↓

2/ una sociedad-ia tiene que poder hacer end-to-end lo mismo que
cualquier sa: existir como entidad, probar quién es ante el estado,
manejar plata, operar con clientes, monitorear el bo.

mapeé las 17 piezas técnicas. nadie las tenía juntas en un toolkit.

3/ hoy cubro 16 de 17 en npm bajo @ar-agents.

la pieza 17 — domicilio legal digital via gde/tad — requiere
autorización gubernamental para alta de aplicación cliente. laburo en
eso.

ar-agents.ar/sociedades-ia (mapa completo)

4/ stack:

@ar-agents/mercadopago — 89 tools (subs + payments + cuotas + 3DS + qr)
@ar-agents/identity — cuit + arca padrón
@ar-agents/facturacion — afip wsfe factura electrónica
@ar-agents/whatsapp — wa business cloud
@ar-agents/banking — cbu + bcra central de deudores
@ar-agents/shipping — andreani / oca / correo
+ identity-attest + mi-argentina + firma-digital + igj + boletin-oficial + mcp

5/ cada package ships AGENTS.md per package — convención de
@linuxfoundation agentic ai foundation.

el llm lee en runtime cuándo usar cada tool, qué retorna, latencias,
errores comunes. acierta la tool al primer intento, no al tercero.

6/ idempotency determinística por sha-256 de los inputs.

si el llm reintenta una llamada por timeout, no cobrás dos veces — mismo
input, misma key, server dedupea.

invisible si lo hacés bien. cualquiera que integró mp sabe la pesadilla
del x-idempotency-key.

7/ HITL programático en 8 operaciones irreversibles (refund, cancel,
delete card).

no es "instrucciones al modelo para que pregunte primero" — es un gate
de código. la función no ejecuta hasta que tu callback retorna true.

agente safe by default.

8/ edge runtime via web crypto, npm provenance attestation SLSA v1, MIT.

corre en @vercel edge, cloudflare workers, deno. bundle 41kb esm
brotli'd para mp (el más grande). sin node:crypto.

9/ demo live con sonnet 4.6 via @vercel ai gateway, mp mockeado, sin
signup:

ar-agents.ar

tipeás "cobrale $25k mensual a juan@x.com" y el agente compone 4
packages para hacer el flow completo.

10/ también escribí RFC-001 (CC0): cómo se resuelve
identidad/firma/notificación/pago para una entidad sin humanos.

incluye marco de responsabilidad de 3 capas que responde el ataque
legal central ("¿quién responde si rompe?"):

ar-agents.ar/rfcs/001

11/ el plan sturzenegger puede pasar tal cual, cambiar, o morir en
diputados. el código existe igual.

si la ley sale: está listo.
si no: sirve para devs ar construyendo saas hoy.

downside acotado, upside asimétrico.

12/ MIT. civil. OSS. sin contratos con el estado.

repo: github.com/ar-agents/ar-agents
npm: npmjs.com/org/ar-agents

si querés laburar conmigo en @ar-agents/tad — la pieza que falta — abrí
un issue. si sos del equipo de @sturzenegger, también.

/fin
```

### ES thread alternativo — 5 tweets (versión light) — voz Naza

Si querés algo más corto y punchy. Sacrifica detalle técnico por velocidad de lectura.

```
1/ el 28/4 sturzenegger anunció el proyecto de "sociedad de ia":
empresa argentina con cero humanos, 100% código.

cuando lo vi pensé que faltaba la infra técnica. el martes pasado me
puse a construir.

acá lo que armé en una semana ↓

2/ una sociedad-ia necesita 17 piezas para operar como cualquier sa:
identidad, factura electrónica, banking, mp, whatsapp, monitoring del
bo, etc.

cubrí 16 en npm bajo @ar-agents/*. la pieza 17 (gde/tad) la trabajo
ahora — requiere autorización gov.

3/ cada package es typed para @vercel ai sdk 6 con AGENTS.md per
package, idempotency determinística, HITL programático en irreversibles,
npm provenance, edge runtime.

el agente decide qué tool usar. vos no escribís el flow.

4/ + RFC-001 (CC0): cómo se resuelve
identidad/firma/notificación/pago para una entidad sin humanos.

incluye marco de responsabilidad de 3 capas que responde el "¿quién
responde si rompe?":

ar-agents.ar/rfcs/001

5/ MIT. civil. OSS. sin contratos con el estado.

ar-agents.ar
github.com/ar-agents/ar-agents

si querés laburar en @ar-agents/tad — la pieza que falta — abrí un
issue.

/fin
```

### EN thread — 12 tweets (miércoles 14:00 ART = 12:00 EST = 17:00 UTC)

**Voice note**: more declarative than ES (his EN tweets aren't on file to model from), but sequencing matches the honest narrative: announcement → realization → built. Note: posting EN thread is OPTIONAL given small follower base; the higher-leverage international play is the DMs to swyx/theo/leerob/simonw asking them to amplify.

```
1/ On April 28, Argentina announced a corporate-law reform creating a
   new legal entity type: an AI corporation with zero human
   shareholders/directors/employees. Pure code, paying taxes.

   I read it and thought: someone should write the technical
   infrastructure connecting this to the Argentine state. Last Tuesday
   I started building. Here's what shipped in a week.

   Thread ↓

2/ April 28 announcement by Minister of Deregulation Federico
   Sturzenegger at Expo EFI. Quote: "we want 500 million AI agents
   incorporated in Argentina paying taxes here."

   Source: iprofesional.com/economia/453561

3/ An "AI corporation" needs 17 technical primitives to operate end-to-
   end: existing as a legal entity, proving identity to the state,
   handling money, operating with customers, monitoring regulatory
   changes.

   Full map: ar-agents.ar/sociedades-ia

4/ I implemented 16 of 17 as @ar-agents/* on npm:

   identity · mercadopago · facturacion · whatsapp · banking · shipping ·
   mi-argentina · firma-digital · igj · boletin-oficial · identity-attest

   The 17th — digital legal address via gov's GDE/TAD — needs gov-issued
   client app authorization. Working on it.

5/ Each package ships AGENTS.md per the @agentsdotmd convention (Linux
   Foundation Agentic AI Foundation). The LLM reads tool-selection rules,
   result schemas, error patterns, and latency tables at runtime.

   Tool-selection accuracy goes way up on first try.

6/ Deterministic SHA-256 idempotency keys derived from meaningful inputs.
   An LLM retrying create_payment doesn't double-charge — same input,
   same key, server dedupes.

7/ Programmatic HITL callback on 8 irreversible operations. Not "tell the
   model to ask first" — a literal code gate that won't execute until
   your callback returns true.

   Works in interactive UIs and in queue/cron contexts (current limitation:
   blocking, pause-and-resume coming).

8/ Edge Runtime via Web Crypto. npm provenance attestations (SLSA v1)
   on every tarball. Subpath exports for KV-backed state and OTel. MIT.

   Runs on Vercel Edge, Cloudflare Workers, Deno. 41 KB ESM brotli'd
   for the largest package.

9/ Live demo: Claude Sonnet 4.6 via Vercel AI Gateway, mocked MP, no
   signup. Type "subscribe john@x.com to a $25k monthly plan" and the
   agent composes 4 packages to handle the entire flow.

   ar-agents.ar

10/ I also published RFC-001 (CC0): identity/signature/notification/
    payment for an entity without humans. Includes a 3-tier liability
    framework (operational / audit / operator-of-record) addressing the
    central legal critique: "who's liable when an AI corporation
    defrauds someone?"

    ar-agents.ar/rfcs/001

11/ Prior art that informed the design:

    • Wyoming DAO LLC (Wyo. Stat. §17-31) — ClawBank.co's substrate
    • Marshall Islands MIDAO — first jurisdictional recognition of programmatic legal personhood
    • EU AI Act Art. 50 + 52 — verifiable AI output marking, in force Aug 2026
    • Mastercard Verifiable Intent + Google AP2 mandates — crypto-signed payment authorization

12/ MIT. Civil. OSS.
    Repo: github.com/ar-agents/ar-agents
    npm: npmjs.com/org/ar-agents

    If you build agent infra and want to compare notes, DM open. If
    you're a corporate lawyer with skin in this game, RFC discussions
    are public on GitHub.

    /end
```

### Tweets-de-respuesta preparados (para responder cuando pase)

Si alguien dice "esto es ciencia ficción / nunca va a pasar":
> No te discuto el tiempo, te discuto la asimetría. Si no pasa: tengo
> infra AR para devs humanos. Si pasa: soy default. Costo de estar
> equivocado: bajo. Costo de estar bien y no estar listo: alto.

Si alguien dice "¿quién responde si la IA rompe?":
> RFC-001 sección 9 propone 3 capas concatenadas: oficial digital
> (humano físico en IGJ), audit log HMAC-firmado de cada tool call, y
> operator-of-record para escribanos/SaaS facade. Las 3 acumulan. Una
> víctima tiene 3 demandados. Link: ar-agents.ar/rfcs/001

Si alguien dice "esto es Palantir o vinculado a la SIDE":
> Manifiesto explícito en ar-agents.ar/manifiesto sección "Lo que
> no hace /arg": no vende a la SIDE, no contratos con servicios de
> inteligencia, civil-comercial-OSS. Repo es público y MIT.

---

## 4. LinkedIn post (martes 09:00 ART)

```
Hace 11 días Federico Sturzenegger anunció un proyecto de reforma de la
Ley de Sociedades Comerciales para crear "sociedad de IA": una empresa
argentina sin accionistas, directores, ni empleados humanos. Cero
humanos. 100% código que decide, opera, y paga impuestos.

La cita literal del ministro: "podríamos tener 500 millones de agentes
de IA incorporados en Argentina, produciendo para el mundo y pagando
impuestos en nuestro país".

Cuando vi el anuncio pensé que la figura jurídica iba a requerir una
capa técnica concreta — cómo un agente saca CUIT, factura, cobra,
firma — y que la discusión pública dominada por abogados y comentaristas
políticos no iba a llegar ahí. El martes pasado (5/5) me puse a
construirla. Esta semana cerré 11 paquetes + RFC y lo publiqué.

ar-agents.ar es un toolkit OSS (MIT) que cubre 16 de las 17
piezas técnicas que una sociedad-IA necesita para operar end-to-end en
Argentina: identidad (CUIT, ARCA padrón, Mi Argentina OIDC, firma
digital ONTI), dinero (MercadoPago, factura electrónica AFIP, banking
con BCRA), operaciones (WhatsApp Business, logística), monitoring legal
(Boletín Oficial), e inteligencia macro (BCRA Variables).

Lo construí solo, con Claude como par. Primer release fue hace 4 meses
(@ar-agents/mercadopago); hoy son 11 paquetes en npm con npm provenance
attestations, Edge Runtime, AGENTS.md per package siguiendo la
convención de Linux Foundation Agentic AI Foundation.

Antes del proyecto entrar a Diputados, también publiqué RFC-001 (CC0,
comments públicos): cómo funcionan identidad, firma, notificación y pago
para una entidad sin humanos. El RFC incluye un marco de responsabilidad
de 3 capas que responde el ataque legal central al plan: si una sociedad-
IA defrauda, hay 3 demandados — el oficial digital (humano físico en
IGJ), el audit log HMAC-firmado, y el operator-of-record (escribano /
SaaS facade).

Esto está abierto. Si sos:
- CTO de fintech AR: tu equipo puede usar @ar-agents/mercadopago hoy
- Developer construyendo SaaS AR: 10 minutos a integrar MP + AFIP
- Abogado/a de derecho corporativo: comments del RFC son públicos
- Equipo Sturzenegger / Desregulación: el código está, hablamos cuando
  quieran
- Inversor o founder pensando "agent economy": la jurisdicción puede ser
  AR antes que cualquier otra; vale la pena mirar

ar-agents.ar · github.com/ar-agents/ar-agents · MIT · civil ·
OSS · sin contratos con el Estado.

— Naza Clemente
```

---

## 5. Press emails — 5 periodistas tech AR

**Estrategia**: subject lines distintos para cada uno (algunos comparan con colegas en común). Cuerpo personalizado con referencia a algo reciente que escribieron. Si no encontrás nota reciente que referenciar, sacá esa línea — no inventes.

### Email 1 — Sebastián Davidovsky (La Nación + Chequeado + Metro 95.1)

**Verificación**: confirmado activo en La Nación, X handle `@vidusky`, escribe en muckrack/lanacion.com.ar/autor/sebastian-davidovsky-2925/. Email pattern probable `sdavidovsky@lanacion.com.ar` o vía `chequeado.com`. **Verificá en Hunter.io o muckrack antes de enviar**. Alternativa: DM por X a @vidusky con el mismo body acortado.

**Subject**: `El plan Sturzenegger ya está implementado en código — soy el dev`

**Body**:
```
Sebastián, buenas. Soy Naza Clemente, dev argentino, autor de ar-agents
(MIT, OSS).

Te escribo a vos por tu nota de diciembre 2025 ("La web, WhatsApp, el
chat y el mostrador digital: cómo la IA agéntica está cambiando las
compras y las ventas") — sos uno de los pocos en prensa AR que ya tenía
el frame de IA agéntica antes de que Sturzenegger anunciara su plan.

El 28 de abril Sturzenegger anunció en Expo EFI un proyecto para crear
"sociedad de IA" — empresa con cero humanos. La discusión pública la
están dominando comentaristas legales y políticos. La parte técnica
está vacía.

Antes de que el borrador entre a Diputados, publiqué la implementación
de referencia: 11 paquetes npm que cubren 16 de las 17 piezas técnicas
que una sociedad-IA va a necesitar (identidad, factura electrónica, MP,
BO monitoring, etc.). Más un RFC-001 con marco de responsabilidad de 3
capas que responde el ataque legal central ("¿quién responde?").

Esto es noticia por dos razones:

1. Es el único caso público de implementación técnica del plan
   Sturzenegger antes del proyecto entrar al Congreso.
2. La narrativa "Argentina = jurisdicción de IA" se está armando desde
   arriba (Sturzenegger + Thiel comprando casa en Barrio Parque). Esto
   muestra cómo se ve desde abajo (un dev solo + Vercel + npm).

Te ofrezco:
- Una entrevista de 30 min (presencial CABA o video)
- Acceso al código + RFC con permiso de citar
- Demo en vivo si querés ver el agente operando

Si te interesa el ángulo, pegamos llamada esta semana.

Repo: github.com/ar-agents/ar-agents
RFC: ar-agents.ar/rfcs/001
Manifiesto: ar-agents.ar/manifiesto

— Naza Clemente
naza@helloastro.co · +34 695 63 22 37
X: @nazanazanazanaz
```

### Email 2 — Pablo Wahnon (iProfesional + Forbes Argentina)

**Verificación**: activo en Forbes Argentina + iProfesional sección tecnología. **Habló en Payments Day 2026 sobre "agentes autónomos en la economía: un robot contrata un servicio, otro lo ejecuta, un sistema valida la operación"** — exacto el frame de tu RFC. Pattern email `pwahnon@iprofesional.com` (verificar) o LinkedIn DM (linkedin.com/in/pablowahnon).

**Subject**: `Plan Sturzenegger ya implementado: 11 paquetes que conectan agente y Estado`

**Body**:
```
Pablo, buenas. Soy Naza Clemente, dev argentino.

Te escribo después de tu charla en Payments Day 2026. Vos ahí pintaste
exactamente el escenario: un robot que contrata un servicio, otro que
lo ejecuta, un sistema que valida la operación. Eso no es teoría
— lo construí. Once paquetes npm bajo @ar-agents/* que cubren 16 de
las 17 piezas técnicas que una sociedad de IA argentina va a necesitar
para operar end-to-end: cobrar (MP), facturar (AFIP electrónica),
verificar contrapartes (ARCA padrón + WhatsApp OTP), monitorear el BO
sobre su propio CUIT, todo.

El 28 de abril Sturzenegger anunció su proyecto. La discusión pública
la están llevando comentaristas legales y políticos. La parte técnica
— cómo se implementa concretamente — está vacía. Antes de que el
borrador entre a Diputados, publiqué el RFC-001 (CC0): identidad, firma,
notificación, pago para una entidad sin humanos, más un marco de
responsabilidad de 3 capas que responde el "¿quién responde?" que es
la objeción legal central.

Te ofrezco: entrevista de 30 min (presencial o video), acceso al código
y al RFC con permiso de citar, demo en vivo del agente componiendo 4
paquetes para emitir factura + cobrar + notificar.

Repo: github.com/ar-agents/ar-agents
RFC: ar-agents.ar/rfcs/001

— Naza Clemente
naza@helloastro.co · +34 695 63 22 37
X: @nazanazanazanaz
```

### Email 3 — Florencia Pulla (Editora General, El Cronista — sección infotechnology)

**Verificación**: confirmada como Editora General El Cronista, sección infotechnology cubre agentes IA Argentina. LinkedIn `florencia-pulla-66aa3414`. Pattern email probable `fpulla@cronista.com` o `florencia.pulla@cronista.com` (ZoomInfo confirma `f***@cronista.com`). **Mejor canal: LinkedIn DM directo o por la sección de contacto del medio**.

**Subject**: `Sturzenegger anunció empresas sin humanos. Te muestro cómo se construye una.`

**Body**:
```
Florencia, buenas. Soy Naza Clemente, dev argentino.

Te escribo a vos porque la sección infotechnology de El Cronista
cubrió agentes de IA en Argentina con más profundidad que cualquier
otro medio AR (vi notas tipo "agentes de IA llegando al campo
argentino" y la cobertura de la suite de agentes que presentó la
multinacional tech).

El 28 de abril Sturzenegger anunció el plan de "sociedad de IA":
empresa con cero humanos, 100% código. Antes de que el borrador entre
a Diputados, publiqué la implementación técnica de referencia. Once
paquetes npm bajo @ar-agents/* que cubren 16 de las 17 piezas técnicas
que una sociedad-IA va a necesitar para operar end-to-end (identidad
ante ARCA, factura electrónica AFIP, banking, MP, WhatsApp Business,
monitoring del BO sobre su propio CUIT, etc.). Más RFC-001 (CC0) con
un marco de responsabilidad de 3 capas que responde el "¿quién
responde?" — el ataque legal central al plan.

Es el único caso público de implementación técnica antes del proyecto
entrar al Congreso. Si querés cubrirlo desde el ángulo "cómo se ve
esto desde el código, no desde el discurso", te ofrezco:

- Entrevista 30 min (presencial CABA o video)
- Demo en vivo del agente operando
- Acceso al RFC + código con permiso de citar

Repo: github.com/ar-agents/ar-agents
RFC: ar-agents.ar/rfcs/001

— Naza Clemente
naza@helloastro.co · +34 695 63 22 37
X: @nazanazanazanaz
```

### Email 4 — Marcelo Bellucci (Clarín — tecnología, 30 años en el medio)

**Verificación**: confirmado en Clarín tecnología. LinkedIn `marcelobellucci`. Pattern `mbellucci@clarin.com` (estándar Clarín). Cobertura general tech, hardware/devices/AI mainstream.

**Subject**: `Sociedades de IA: implementación técnica abierta antes del proyecto`

**Body**:
```
Marcelo, buenas. Soy Naza Clemente, dev argentino.

Hace tiempo que cubrís tech en Clarín y vi tu coverage reciente sobre
IA y mercado tecnológico argentino. Te escribo con un ángulo concreto.

El 28 de abril Sturzenegger anunció el proyecto de "sociedad de IA":
empresa argentina sin humanos. La cobertura mainstream se quedó en el
titular. Antes de que el borrador entre a Diputados, publiqué la
implementación técnica de referencia: 11 paquetes open source en npm
que cubren 16 de las 17 piezas técnicas que esa figura jurídica va a
necesitar para operar (CUIT, factura electrónica, banking, WhatsApp,
monitoring del BO, etc.).

La nota tiene 2 ángulos para Clarín:

(1) Mainstream / sorpresa: "un argentino solo programó las empresas
sin humanos que anunció Sturzenegger". Imagen tipográfica clara.

(2) Tech: implementación abierta + RFC público con marco de
responsabilidad de 3 capas que responde el "¿quién responde?".

Si querés, pegamos call esta semana. 30 min me alcanza para mostrar el
demo en vivo.

Repo: github.com/ar-agents/ar-agents
RFC: ar-agents.ar/rfcs/001

— Naza Clemente
naza@helloastro.co · +34 695 63 22 37
X: @nazanazanazanaz
```

### Email 5 — Pablo Esteban (Página/12, ciencia + cultura, IA generativa research)

**Verificación**: confirmado en Página/12 (`pagina12.com.ar/autores/pablo-esteban/`), también docente UNQ + UNSAM + La Liga de la Ciencia. **Co-autor de paper académico "Desafíos de la Inteligencia Artificial generativa"** — angle académico/político. X handle `@pablooesteban`. Pattern email vía Página 12 o vía contacto académico UNSAM.

**Subject**: `Implementación técnica del plan sociedades de IA — antes del Congreso`

**Body**:
```
Pablo, buenas. Soy Naza Clemente, dev argentino. Te escribo a vos
porque conocés el campo de la IA generativa desde el lado académico,
y porque Página/12 cubre la dimensión política de la tecnología con
profundidad que otros medios no.

El 28 de abril Sturzenegger anunció su proyecto de "sociedad de IA":
una nueva forma jurídica con cero humanos. La cobertura de Página/12
fue crítica políticamente — y bien — pero el frame técnico está vacío.
Antes de que el borrador entre a Diputados, publiqué la implementación
de referencia técnica: 11 paquetes open source que ya cubren 16 de las
17 piezas que una sociedad-IA argentina va a necesitar operar.

Más RFC-001 (CC0): cómo se construye identidad/firma/notificación/pago
para una entidad sin humanos. Y un marco de responsabilidad de 3 capas
— oficial digital humano, audit log firmado, operator-of-record — que
responde el "¿quién responde si rompe?" que es la principal objeción
del proyecto.

El ángulo Página/12 lo veo así: "antes que la ley, el código. Cómo se
construye técnicamente lo que el gobierno todavía no escribió." Es un
contrapunto al discurso oficial, civil-OSS, sin contratos con el Estado.

Te ofrezco entrevista 30 min, acceso al código y RFC, demo en vivo.

Repo: github.com/ar-agents/ar-agents
RFC: ar-agents.ar/rfcs/001
Manifiesto: ar-agents.ar/manifiesto (sección "Lo que NO hace /arg" — explícito que no vende a la SIDE ni firma con el Estado)

— Naza Clemente
naza@helloastro.co · +34 695 63 22 37
X: @nazanazanazanaz
```

### Si responden: pre-prep para entrevista

- Pitch de 60 segundos memorizado (lo que está en el LinkedIn post)
- 3 anécdotas concretas: (1) por qué empecé en MP — el pain de hand-rolling, (2) cómo se compone un agente con varios paquetes — el ejemplo whatsapp-hello, (3) la pieza 17 que falta y por qué requiere autorización gov
- Posición sobre Sturzenegger plan: "técnicamente viable, legalmente posible si el marco de responsabilidad es sólido. Mi RFC propone uno"
- Posición sobre Palantir/Thiel: "/arg es civil-comercial-OSS, sin contratos estatales, sin SIDE. Mi manifiesto lo dice explícitamente"
- Posición sobre tu propia neutralidad: "no soy del gobierno, no estoy en ningún partido, esto es infraestructura abierta que sirve a quien quiera"

---

## 6. DMs + email al equipo Sturzenegger + aliados políticos + Subsec TIC

**Política**: 1 contacto por día, NO más. Spam = veto. Personalizá cada uno.

### A Federico Sturzenegger — vía formulario público (canal PREFERIDO)

**Por qué formulario sobre X DM**: Sturzenegger crowdsourcea públicamente en `https://fsturzenegger.com.ar/contacto`. Email formal entra mejor que DM. Mantenemos el X DM como follow-up si no hay respuesta en 5 días.

**Subject** (≤ 70 chars): `Implementación de referencia open-source para sociedades de IA — 13 paquetes en npm`

**Body**:
```
Federico, buenas tardes.

Soy Nazareno Clemente, programador argentino de 26 años. Vi tu anuncio
de sociedades de IA del 28 de abril y, después de procesarlo una semana,
el martes pasado (5/5) me puse a construir una implementación de
referencia técnica open-source para que el día que la ley se promulgue,
cualquier sociedad pueda incorporarse en menos de 30 minutos.

El stack está publicado en npm con licencia MIT y SLSA v1 provenance:

  • 13 paquetes que cubren 16 de las 17 piezas operativas de una empresa
    argentina (CUIT, padrón ARCA, factura electrónica WSFE, BCRA Central
    de Deudores, Mercado Pago, WhatsApp, Boletín Oficial, IGJ, Mi
    Argentina OIDC, Firma Digital). La pieza 17 (GDE/TAD) requiere alta
    de aplicación cliente con autorización gubernamental — laburo en eso.
  • Marco de responsabilidad de tres capas (RFC-001) para responder
    "si la IA rompe algo, ¿quién responde?". Pensado para anticipar el
    debate parlamentario.
  • Threat model público de amenazas con mitigaciones explícitas en
    /security.
  • Una sociedad-IA simulada que se puede operar en vivo, sin setup,
    desde el navegador: ar-agents.ar/play

Demo de 60 segundos (sin instalación, sin cuenta): /play recibe un
prompt, el agente ejecuta tools auditadas y muestra el log RFC-001 al
costado. Pensado para que un asesor pueda verificar el flujo en una
reunión o desde el celular.

No estoy pidiendo nada. Si en algún momento les sirve un input técnico
para el draft del proyecto, o un working group informal con devs de
ARCA / BCRA / IGJ, mi puerta está abierta.

Reunión: 30 minutos cuando puedan. Estoy en Buenos Aires y respondo
mails en menos de 48 horas.

Naza Clemente
naza@helloastro.co
github.com/ar-agents/ar-agents
ar-agents.ar
```

### A Federico Sturzenegger — DM (X · @fedesturze) — FALLBACK si no respondió en 5 días

**Time**: viernes 11:00 ART (lectura estimada cuando llegue del finde)

**DM**:
```
Ministro, buenas. Soy Naza Clemente, dev argentino.

Vi tu anuncio del 28/4 en Expo EFI y el martes pasado (5/5) me puse a
construir la infra técnica que pensé iba a requerir la figura de
sociedad de IA. Una semana después son 11 paquetes en npm que cubren
16 de las 17 piezas necesarias para operar end-to-end. Más un RFC
público con un marco de responsabilidad de 3 capas que responde el
ataque legal central ("¿quién responde si rompe?").

Es OSS, MIT, civil — no tengo contratos con el Estado ni intención.

ar-agents.ar/rfcs/001 (RFC, CC0, comments públicos)
github.com/ar-agents/ar-agents (repo)

Si te interesa que el régimen funcione desde el día 1 (no SAS-style con
5 años de reglamentación), 30 min de mi lado están disponibles cuando
quieran. Tu equipo o vos.

Saludos.
— Naza
```

### A subsecretario/a de Desregulación (LinkedIn)

**Búsqueda**: LinkedIn → "Subsecretario Desregulación" o "Ministerio Desregulación Argentina". Conectá con uno o dos perfiles activos.

**Mensaje de conexión + DM** (combinable):
```
Hola [nombre], soy Naza Clemente, developer argentino. Te escribo porque
publiqué la implementación técnica de referencia del proyecto sociedades
de IA antes de que entre a Diputados — 11 paquetes OSS en npm + un RFC
con marco de responsabilidad. Civil, MIT, sin contratos estatales.

Si la cartera tiene algún canal de consulta técnica abierto sobre el
proyecto, me interesa contribuir. ar-agents.ar/rfcs/001

Saludos
```

### A Sabrina Ajmechet (X · @SabrinaAjmechet)

**DM**:
```
Sabrina, buenas. Soy Naza Clemente, dev argentino. Vi tu defensa pública
del proyecto sociedades de IA de Sturzenegger.

Construí la implementación técnica de referencia antes de que el
borrador entre. Es OSS, MIT, sin vínculo con el gobierno. Entre otras
cosas, propone un marco de responsabilidad de 3 capas que responde el
"¿quién responde?" que es la principal objeción legal al proyecto.

Si te sirve para fundamentar técnicamente en el debate, está acá:

ar-agents.ar/rfcs/001

Saludos.
— Naza
```

### A Marcos Galperín (X · @marcos_galperin)

**Estrategia**: Galperín posteó público apoyando el plan. Cualquier dev tech AR que se posicione técnicamente le va a interesar. Pero está saturado de mentions — DM puede que no llegue.

**Alternative**: en lugar de DM, citá un tweet suyo sobre el tema con tu thread del lunes. El algoritmo lo levanta más probable que un DM frío.

Si igual querés DM:
```
Marcos, viste el anuncio de Sturzenegger el 28/4. Soy Naza, dev
argentino, construí la implementación técnica de referencia antes de
que entre el borrador. Cubre 16 de 17 piezas que una sociedad-IA va a
necesitar — incluyendo MP, AFIP, WhatsApp, BO, y banking — todo OSS MIT.

Si te interesa apuntar el ecosistema dev AR a una infra civil-comercial-
OSS para el régimen, ar-agents.ar está abierto.

— Naza
```

### A César Gazzo Huck — Subsec TIC + Open Government Partnership

**Verificación**: confirmado activo en X `@cesargazzo` y LinkedIn `linkedin.com/in/cesargazzo`. Subsecretario que viene impulsando open data + open source desde Subsec País Digital. Encaja exactamente con el ángulo civil/OSS de /arg.

**Subject (DM o email)**: `open-source argentino para sociedades-IA · OGP-aligned`

**Body**:
```
César, buenas tardes.

Vi tu rol en Open Government Partnership y tu trabajo en gobierno abierto
desde la Subsec de País Digital. Quería contarte un proyecto alineado con
esa agenda.

Soy Naza Clemente. El martes pasado (5/5), después del anuncio de
Sturzenegger del 28/4 sobre sociedades de IA, me puse a construir
ar-agents (github.com/ar-agents/ar-agents) — librería open-source MIT
que cubre 16 de las 17 piezas operativas de una empresa argentina
(factura electrónica WSFE, padrón ARCA, BCRA Central de Deudores, MP,
WhatsApp, Boletín Oficial, IGJ, GDE/TAD pendiente). Pensada para que
cualquier developer pueda construir un producto AR-compliant en horas,
no meses.

Más RFC-001 con marco de responsabilidad de 3 capas, threat model
público en /security, provenance SLSA v1 en cada release, y demo en
vivo: ar-agents.ar/play

El proyecto encaja exactamente con lo que vos venís impulsando: open
data, open source, auditabilidad pública by default. No pido nada — me
gustaría tu input técnico cuando tengas un rato. Si el gobierno termina
necesitando una capa de infra para el régimen sociedades-IA, sería
ideal que esta sea la opción default y open.

¿Café o un call de 20 minutos cuando puedas?

Naza
naza@helloastro.co
```

### Mutual connections via MELI

Si tenés 1+ dev senior en MELI en LinkedIn (probable — son ~10k):

```
Hola [nombre], hace tiempo que no hablamos. Te escribo porque construí
algo que puede interesarle a tu equipo o a Marcos: ar-agents, toolkit
OSS para que un agente IA opere como sociedad argentina. Cubre MP entre
otros (89 tools tipados para Vercel AI SDK 6).

Lo posicioné como implementación de referencia del plan sociedades de
IA de Sturzenegger antes de que el borrador entre a Diputados. ¿Te
parece valor mostrárselo a alguien específico de MELI o pensás que debe
seguir su curso solo?

ar-agents.ar

— Naza
```

---

## 7. DMs a foreign agent infra builders

**Goal**: amplificación, NO partnership inmediato. Que tweeten / linkeen / compartan.

### swyx (X · @swyx)

```
Hey swyx — Argentine dev here. The Argentine government just announced
a legal framework for AI agents to incorporate as full corporate entities
(zero human shareholders/directors/employees). Bill not drafted yet but
political momentum real.

I shipped the technical implementation in 17 npm packages before the
draft hits Congress, plus an RFC with a 3-tier liability framework
addressing the central legal critique.

Plays into a thesis I'd guess Latent Space readers would find interesting:
the first jurisdictional experiment in AI legal personhood that isn't
crypto-flavored.

ar-agents.ar
ar-agents.ar/rfcs/001

Open to sharing more if you're curious.
— Naza
```

### Theo (X · @t3dotgg)

```
Hey Theo — Argentine dev. Built a typed Vercel AI SDK 6 toolkit for the
entire Argentine state stack (MercadoPago, AFIP electronic invoicing,
banking, WhatsApp, the official gazette). 17 npm packages, MIT, npm
provenance attestations, Edge Runtime via Web Crypto.

The wrinkle: I positioned it as the reference implementation for a new
legal entity type Argentina just announced — "AI corporations" with no
human owners or directors. The bill hasn't been drafted yet. Shipped
the code anyway.

ar-agents.ar — live demo runs Sonnet 4.6 via AI Gateway against
mocked MP tools, no signup.

Curious if it'd fit a video — the LATAM payment + agent-incorporation
angle hasn't been covered.

— Naza
```

### Lee Robinson (X · @leerob)

```
Hey Lee — built this entirely on Vercel AI SDK 6: 11 typed toolkits for
the Argentine state stack (MP, AFIP, banking, WhatsApp). Edge Runtime
via Web Crypto, idempotency-by-default, npm provenance attestations,
AGENTS.md per package.

Positioned as reference implementation for "AI corporations" — a legal
entity type Argentina announced creating but hasn't legislated yet.

Live demo on AI Gateway: ar-agents.ar
RFC: ar-agents.ar/rfcs/001

Would love your eyes from the agent-ergonomics + AI SDK adoption POV.

— Naza
```

### Simon Willison (X · @simonw, blog · simonwillison.net)

```
Hi Simon — long-time reader of your blog. Built this and thought it
might fit your agent-tools beat: 17 npm packages turning the Argentine
state + financial stack into typed Vercel AI SDK 6 tools. Each package
ships AGENTS.md per agents.md convention.

The angle that might be blog-worthy: I positioned it as the reference
implementation for a corporate-law reform Argentina just announced
(AI-incorporated companies, no human owners). The bill hasn't been
drafted yet. Shipped the code first.

ar-agents.ar · MIT · github.com/ar-agents/ar-agents

— Naza Clemente
```

### Mastra team

```
Hi Mastra team — built ar-agents on Vercel AI SDK 6 but watching Mastra
closely. Eleven npm packages for the Argentine state stack (MercadoPago,
AFIP, WhatsApp, banking, official gazette monitoring) shipped as agent
tools.

Positioned as reference implementation for "AI corporations" — a new
legal entity type Argentina just announced. The cross-runtime promise of
Mastra is exactly what would unlock LATAM regional adoption.

If you're thinking about LATAM-specific adapters or partnerships,
happy to chat. ar-agents.ar

— Naza
```

---

## 7.5 DMs a comunidad AR civic-tech / open-source

**Audiencia distinta**: estos no amplifican como swyx/theo, pero son los **standards-setters de facto** en el ecosistema técnico AR. Te legitiman a nivel comunidad. Son aliados naturales para un working group AR.

### Mariano Reingart — autor de `pyafipws`

**Channel**: GitHub issue en su repo principal o email visible en su perfil GitHub.

**Body**:
```
Hola Mariano,

Soy Naza Clemente. El martes pasado me puse a construir una colección
de packages npm open source (`@ar-agents/*`, ar-agents.ar) que
wrappea AFIP/ARCA, MP, BCRA, Boletín Oficial, IGJ, Firma Digital y otros
como tools del Vercel AI SDK 6 — pensando en agentes IA y en lo que va
a necesitar el régimen de "sociedades de IA" si llega a aprobarse.

Tu trabajo en `pyafipws` fue el reference que más leí cuando armé la
parte de WSAA + WSFE. Quería invitarte a un working group informal para
cuidar standards técnicos de esta capa AR. ¿Tenés 30 min para una call
esta semana?

Manifiesto: ar-agents.ar/manifiesto
Repo: github.com/ar-agents/ar-agents

Saludos,
Naza
```

### Pablo Zamudio — Mercado Libre Tech (autor del MP MCP)

**Channel**: Medium DM / X / LinkedIn.

**Body**:
```
Hola Pablo,

Vi tu post en medium.com/mercadolibre-tech sobre el MCP de MercadoPago.
Excelente trabajo — me resultó muy clarificador para el agent-ergonomics
de mi propio package, `@ar-agents/mercadopago` (89 tools, focus en
AR-subscriptions, parte de un toolkit más amplio).

No competimos: tu MCP cubre breadth multi-país; el mío profundiza en
patrones AR (cuotas, ARCA, factura electrónica, identity-attest). Quería
abrir un canal para coordinar overlap, y eventualmente sumarte como
advisor del working group /arg.

¿Café virtual?

Naza
ar-agents.ar
```

### datos.gob.ar / @datosgobar team

**Channel**: email a `contact@datos.gob.ar` o X DM `@datosgobar`.

**Body**:
```
Hola equipo,

Soy Naza Clemente, dev independiente. Acabo de publicar
`@ar-agents/igj`, un wrapper TypeScript del CKAN de datos.jus.gob.ar
para que developers AR (y agentes IA) puedan consumir datos de IGJ
directamente — search de entidades, autoridades, balances — con tools
del Vercel AI SDK 6 y un manifest machine-readable.

El package surface el `coverageNote` (dataset es muestreo) en cada
respuesta para que nadie use ausencia de datos como prueba.

Próximos targets: `@ar-agents/georef` (georef-ar-api),
`@ar-agents/series-tiempo`, `@ar-agents/datosgobar` (cliente CKAN
genérico).

¿Hay alguien con quien coordinar para que estos wrappers sean
endorsed-by-default por su equipo? Y para entender la cadencia de
republicación de los datasets para no romper el lib silenciosamente.

Saludos,
Naza
github.com/ar-agents/ar-agents
```

## 8. Cold partnership outreach

**Goal**: bridge MCP, no competencia frontal.

### ClawBank — Justice Conder

**Channel**: founder's email (justice@clawbank.co — verificar) o X DM

**Subject**: `AR module for ClawBank — partnership`

**Body**:
```
Justice, congratulations on the Manfred launch — first AI agent to
incorporate solo is a real moment.

Saw clawbank.co covers Wyoming / Ohio LLC + IRS + FDIC + crypto. The
gap that's not in your stack is LATAM tax residency, AR-specific banking
(CBU/CVU vs USD-FDIC), and AFIP/ARCA electronic invoicing.

Argentina's announcing its own "AI corporation" entity type — separate
political track, but the broader thesis aligns. I built ar-agents/* —
17 npm packages covering 16 of 17 technical pieces an Argentine entity
needs to operate end-to-end.

Pitch: ClawBank's @clawbank/banking-mcp + ar-agents/* exposed via
@ar-agents/usa-bridge MCP = your agent gets AR module without
re-architecting. Manfred or its successors can hold a CUIT, accept MP
subscriptions, emit AFIP electronic invoices.

Worth a 30-min call?

ar-agents.ar
github.com/ar-agents/ar-agents

— Naza Clemente
naza@helloastro.co
```

### doola — Arjun (founder)

**Subject**: `AR / LATAM module for doola Agentic LLC`

**Body**:
```
Hi Arjun — congrats on the Agentic LLC launch.

I'm Naza Clemente, building ar-agents — 17 npm packages covering the
Argentine state and financial stack as typed Vercel AI SDK 6 tools
(MercadoPago / AFIP electronic invoicing / banking / WhatsApp / gazette
monitoring).

Argentina's announcing its own AI-corporation entity type, parallel to
the work doola does for US LLCs. The customer overlap I see: doola
already serves LATAM founders forming US LLCs — when those founders
need to also operate locally in AR (collect MP, emit AFIP invoices),
they hit a wall.

ar-agents would plug into doola's stack as a regional module. MCP
bridge feasible in days.

Worth a 30-min call?

ar-agents.ar · MIT · github.com/ar-agents/ar-agents

— Naza
```

### MIDAO — Marshall Islands DAO LLC

**Channel**: contact form en midao.org or LinkedIn to founders

**Body**:
```
Hi MIDAO team — saw your /guides/ai-agents and the positioning around
Marshall Islands DAO LLC for AI entities.

I'm building the AR-jurisdictional equivalent: 17 npm packages covering
the Argentine state and financial stack, shipped as a reference
implementation ahead of Argentina's announced corporate-law reform for
"AI corporations".

There's natural complementarity: MIDAO covers identity + payments for
DAO LLCs offshore; ar-agents covers the same primitives onshore in AR.
A bridge would let an AI agent register in Marshall Islands AND operate
in AR — useful for LATAM-targeted agents that need local tax residency
+ invoicing.

If MIDAO is exploring jurisdictional bridges, ar-agents.ar is
open. MIT.

— Naza Clemente
naza@helloastro.co
```

---

## 9. AAIF working group proposal (jueves)

**Channel**: aaif.io contact form, GitHub issue en cualquier repo del foundation, o LinkedIn a co-chairs.

**Subject**: `Proposal: Argentine AI Society Profile working group`

**Body**:
```
Hi AAIF — proposing a new working group:

"Argentine AI Society Profile" — a technical profile for AI agents
incorporated as legal entities in Argentina under the proposed
sociedad-IA reform (Sturzenegger plan, April 28 2026).

Why this fits AAIF charter:
- Builds on existing AAIF-anchored projects (MCP, AGENTS.md convention)
- Touches compliance-as-code (LF AAIF mission)
- Aligns AGENTS.md convention with regulatory metadata required for AR
  fiscal residency

What I'd contribute as initial lead:
- RFC-001 already drafted (CC0): identity / signature / notification /
  payment for sociedad-IA. 3-tier liability framework.
  ar-agents.ar/rfcs/001
- Reference implementation of 16/17 pieces shipped in @ar-agents/* (MIT)
- Author working on the missing 17th piece (TAD/GDE)

What I'd ask AAIF for:
- Working group formation
- Quarterly meeting cadence
- Linkage to MCP working group (some primitives shared)
- Co-publication of finalized profile

Background: I'm a solo open-source contributor in Argentina. Twelve npm
packages shipped under @ar-agents/* with npm provenance attestations.
Focus: agent ergonomics for LATAM-regional regulatory compliance.

Available for a 30-min call to discuss.

— Naza Clemente
naza@helloastro.co
github.com/naza00000
```

---

## 9.5 AR Working Group meta-invite (1 semana después)

**Cuándo**: lunes 18/5 (semana 2), una vez que ya hay ruido público y los AR civic-tech leaders ya recibieron las DMs individuales.

**Objetivo**: convocar primera reunión informal del Argentine Agent Infrastructure Working Group para consensuar standards técnicos.

**Subject**: `Argentine Agent Infrastructure WG — primera reunión`

**Body** (mismo a cada destinatario, ajustando el saludo):
```
Hola,

Te invito a la primera reunión informal del Argentine Agent
Infrastructure Working Group. Objetivo: discutir y consensuar
estándares técnicos para la capa de integración entre agentes IA y
servicios públicos AR — con foco específico en ser civil/OSS y
extensible.

Cuándo: martes [TBD] 19hs ARG
Dónde: Discord (link al confirmar)
Duración: 60 min

Agenda:
- Estado actual de cada paquete /arg
- Gaps que faltan (GDE, INPI, ANSES, etc.)
- Convención AGENTS.md y standards de manifest
- Próximos 60 días: roadmap + responsables

Convocados:
- @reingart (pyafipws)
- @relopezbriega (arca_arg)
- Pablo Zamudio (MELI MP MCP)
- datosgobar
- ACIJ / Dymaxion / Democracia en Red

Saludos,
Naza
ar-agents.ar/manifiesto
```

**Tracking**: armás Discord server antes (10 min), creás el calendar invite cuando confirmen 3+ asistentes.

## 10. Response playbook

### Si HN frontpaeguea (top 30)

Ronda de respuestas en las primeras 4 hs. Patrones esperados:

**Comment positivo / curioso ("This is fascinating, what's...")**
> Thanks. Happy to dig in — what specifically caught your interest?
> [si especifican un package, copy-paste el AGENTS.md decision tree relevante]

**Comment escéptico técnico ("Why not just use Stripe + Plaid?")**
> Stripe doesn't do Argentina. Plaid neither. The comparable in AR is
> AfipSDK + a bunch of one-off SDKs — none of which are agent-ergonomic
> or compose. The deltas are spelled out in [comparison table or
> manifesto link]. Happy to dig into specific gaps.

**Comment escéptico legal ("AI corporations are dangerous")**
> Agreed the design space is non-trivial. The central legal critique is
> "who's liable when an AI corporation defrauds someone?" — RFC-001
> section 9 proposes a 3-tier framework (operational / audit / operator-
> of-record) that addresses it. Open to feedback on whether the layers
> are sufficient. Link: ar-agents.ar/rfcs/001#9

**Comment troll ("Argentina is a failed state, why bother")**
> Don't engage. HN moderates these. Move on.

**Comment "this is similar to ClawBank/MIDAO/Wyoming DAO LLC"**
> Right — RFC-001 section 10 covers prior art including those. The
> meaningful AR-specific differences are (a) AFIP/ARCA fiscal integration
> (no other jurisdiction has this), (b) Mi Argentina OIDC for officer
> identity, (c) MP / WhatsApp for B2C ops which are LATAM-specific. Each
> jurisdiction picks its own primitives — Wyoming has SOS / Wyoming
> Banking / IRS, AR has IGJ / ARCA / BCRA.

### Si X explota (>10k impressions en 24h)

Mantené tono profesional. NO te pongas defensivo con escépticos.

**Mention positivo de cuenta grande**: thank + offer 30 min call.

**Mention crítico ("esto vende AR a la SIDE")**: link al manifiesto
sección "Lo que no hace /arg".

**Mention de Sturzenegger team o tier-1 cuenta**: respondés rápido + DM.

### Si periodista quiere entrevista

- Proponer slot ese día o siguiente. Velocidad es todo.
- Si pide quote escrito: 3 quotes pre-armados, ajustar al ángulo de la nota
- Quotes default:
  1. "El plan Sturzenegger es técnicamente implementable hoy. Las
     dieciséis piezas que vos propusiste construir ya están en npm bajo
     licencia MIT. Llegué antes que el borrador para que el debate
     legislativo no parta desde cero."
  2. "El ataque central es '¿quién responde si rompe?'. El RFC-001
     propone un marco de tres capas: oficial digital humano, log
     firmado, operator-of-record. La discusión legal puede ser
     constructiva si parte de un texto técnico concreto."
  3. "No tengo vínculo con el gobierno ni con Palantir. Esta
     infraestructura es civil, comercial, OSS. El manifiesto del
     proyecto lo dice explícitamente."

### Si Sturzenegger / equipo de gobierno responde

- 24 hs para responder, NO más rápido (no parezcas desesperado)
- Confirmar slot calendario formal
- Preparar deck de 5 slides ANTES de la reunión: (1) el problema, (2)
  qué cubrí, (3) la pieza que falta, (4) RFC-001 highlights, (5) cómo
  podríamos colaborar — en orden DECRECIENTE de "ask"
- Llevar laptop con demo live preparada

### Si AfipSDK te tira mensaje

Probable que pase si la nota de prensa pega. Dos escenarios:

**Friendly ("interesante lo tuyo, conversemos")**: respondés. Entendé
qué tienen ellos que vos no (4,238 CUITs activos), qué tenés vos que
ellos no (agent-ergonomics, MCP, AGENTS.md, RFC-001). Posibles deals:
co-marketing, package adaptado a su stack, acquisition conversation.

**Hostile ("estás copiando")**: NO contestes con defensa. Pedí ejemplos
concretos. Si los hay, addres. Si no, archivá. Argentina es chica, las
peleas tech públicas son malísimas para todos los involucrados.

---

## 11. Op-ed pre-drafteada (en caso de que un medio te tome)

**Outlet target**: La Nación (sección Opinión) o Cronista Comercial. ~700 palabras. Listo en draft, ajustar tono al medio.

**Headline option**:
- "El plan sociedades de IA de Sturzenegger ya tiene código"
- "Antes del Congreso, el código: por qué la implementación técnica importa para el plan sociedades de IA"

**Body (draft)**:

> El 28 de abril, el ministro de Desregulación Federico Sturzenegger
> anunció en Expo EFI un proyecto que la prensa cubrió con la mezcla
> habitual: titulares grandes, comentarios legales y políticos, y casi
> ningún análisis técnico. La propuesta — crear "sociedad de IA" como
> nuevo tipo de empresa argentina sin accionistas, directores ni
> empleados humanos — generó reacciones predecibles: entusiasmo de
> sectores libertarios, alarma de constitucionalistas, escepticismo de
> abogados corporativos.
>
> Lo que faltó es el paso intermedio: ¿cómo se implementa esto
> concretamente? ¿Existen las primitivas técnicas para que una empresa
> sin humanos opere de hecho en Argentina, hoy?
>
> La respuesta, después de seis meses de trabajo, es sí. Y la
> infraestructura es OSS.
>
> [continuar con: descripción de las 17 piezas, qué cubre @ar-agents/*,
> qué falta, marco de responsabilidad, por qué importa que sea
> civil-comercial-OSS, llamado a contribuciones de la comunidad
> técnica argentina]
>
> Una sociedad de IA argentina que opera con `@ar-agents/*` recibe un
> CUIT como cualquier SAS, valida sus contrapartes con AFIP/ARCA, abre
> cuenta bancaria con CBU, emite factura electrónica A/B/C, cobra
> suscripciones por MercadoPago, atiende consultas por WhatsApp, monitorea
> el Boletín Oficial con suscripciones por su propio CUIT, consulta
> cotizaciones del BCRA para decisiones de tesorería. Todo eso es código
> escrito, testeado y documentado, viviendo en los servidores de
> cualquiera que lo deploye.
>
> Lo que no es código todavía es la respuesta a la pregunta legal que
> domina el debate: si una sociedad-IA defrauda a un consumidor, ¿quién
> responde? El RFC-001 — que publiqué la semana pasada con licencia CC
> cero, comentarios públicos — propone un marco de tres capas
> concatenadas. Primera capa: el oficial digital, un humano físico
> nombrado en IGJ que responde por toda acción ejecutada con el
> certificado X.509 de la sociedad. Segunda capa: el audit log con
> timestamps HMAC-firmados de cada acción tool-by-tool, prueba legal
> verificable. Tercera capa: operator-of-record, un escribano o
> plataforma SaaS que actúe como facade y comparta responsabilidad civil.
>
> Las tres son acumulativas, no alternativas. Una víctima de fraude tiene
> tres demandados con distintas barras probatorias. Esto es lo que la
> teoría legal moderna llama "intermediario calificado" — y es la única
> forma en que un régimen como el propuesto sobrevive el examen
> constitucional.
>
> [cierre con: por qué la ventana es ahora, qué pasa si la ley sale,
> qué pasa si no, llamado a juristas y devs a contribuir al RFC]

---

## 11.5 Talk abstracts — Nerdearla / JSConfAR / Vercel Ship LATAM

3 abstracts pre-armados, distintos angles, según venue. Submitís cuando abran calls (probablemente Q2-Q3 2026).

### Abstract 1 — Nerdearla (general dev / civic-tech crossover)

**Título**: *El stack abierto para que un agente IA opere en Argentina*

**Duración**: 20-25 min

**Resumen** (~150 palabras):
> En abril de 2026 el Ministro Sturzenegger anunció su plan para que Argentina sea la primera jurisdicción con un régimen legal para "sociedades de IA": empresas sin humanos, solo código. La narrativa ya está siendo escrita desde arriba; lo que falta es la capa técnica que hace que esas sociedades — y cualquier developer argentino construyendo agentes — puedan operar contra el Estado.
>
> En esta charla muestro `/arg`, una colección de 17 packages npm open-source que cubre AFIP/ARCA, Mercado Pago, WhatsApp, BCRA, Boletín Oficial, IGJ, Firma Digital, Mi Argentina y RENAPER-bypass — todo como tools del Vercel AI SDK 6, todo Edge-Runtime-compatible, todo MIT.
>
> Vamos a ver el flujo end-to-end: cómo una sociedad-IA ficticia se incorpora, factura, paga monotributo y atiende clientes en menos de 30 segundos de ejecución de agente.

**Audiencia**: Devs AR, civic-tech, regtech, fintech.

### Abstract 2 — JSConfAR (TypeScript / Vercel community)

**Título**: *Vercel AI SDK 6 tools, idempotencia determinística y verificación de Firma Digital — todo en Edge Runtime*

**Duración**: 30 min

**Resumen** (~150 palabras):
> El Vercel AI SDK 6 te da un slot estándar para tools, pero los detalles fastidiosos de hacer un tool *agent-ergonomic* — idempotencia bajo retries, HITL en operaciones irreversibles, AGENTS.md por package, schemas Zod tipados, manifests machine-readable, Web Crypto en lugar de node:crypto — son todos decisiones de ingeniería que se repiten paquete a paquete.
>
> Esta charla disecciona cómo `/arg` resuelve estos patrones en 17 packages npm open-source enfocados en integraciones argentinas. Vamos a ver:
>
> - Por qué Edge Runtime + Web Crypto = no más bugs de Node-only
> - Cómo derivar idempotency keys determinísticas para sobrevivir LLM retries
> - Cómo escribir AGENTS.md que el LLM lee en runtime para elegir tools
> - Adapter pattern + UnconfiguredAdapter como default safe-by-default

**Audiencia**: TypeScript devs, Vercel users, agent builders.

### Abstract 3 — Vercel Ship LATAM (strategic / framing, en inglés)

**Título**: *Government as a Vercel-native API: building open infrastructure for Argentina's AI agent jurisdiction*

**Duración**: 20-30 min

**Resumen** (~150 palabras):
> The Argentine government has announced it wants to be the first jurisdiction with legal personhood for AI-only companies (Sturzenegger, April 2026). 50M humans + 500M AI agents paying taxes in AR is the projection.
>
> The political narrative is being built top-down, but the technical substrate that those agent-companies need — Stripe-grade APIs to AFIP, Mercado Pago, WhatsApp, identity providers, the Boletín Oficial — does not exist. There is no "gov.br auth + Pix + Open Finance" equivalent in Argentina.
>
> This talk shows `/arg`: a Vercel-native, MIT-licensed npm scope that fills that gap. 17 packages, all built on Vercel AI SDK 6, all Edge-Runtime-compatible, all MCP-native. The talk frames the strategic positioning (open + civilian, distinct from the SIDE/Palantir track) and walks the technical decisions that make Vercel the right platform for this kind of public-sector dev infrastructure.

**Hook line**: "If India has India Stack and Brazil has gov.br, what does Argentina have? Today nothing. Next year, /arg."

**Audiencia**: Vercel customers, LATAM dev leadership, gov-tech.

### Bio reusable

> **Nazareno Clemente** is an Argentine independent developer building the open infrastructure stack for AI agents in Argentina. Author of the `/arg` toolkit (`@ar-agents/*` on npm, 17 packages, MIT). Fiscally registered as monotributista en CABA, currently based in Spain. Previously: built Astro (astro.ar), Publi (publi.ar). X: @nazanazanazanaz. GitHub: @naza00000.

### Submission tracking

| Conf | Submitted | Deadline | URL |
|---|---|---|---|
| Nerdearla | TODO | check | nerdearla.com (Aug?) |
| JSConfAR | TODO | check | jsconf.ar |
| Vercel Ship LATAM | TODO | check | vercel.com/ship |

## 12. Métricas a trackear (no obsesivo, pero monitor)

**Día 1-7 metas mínimas**:
- Show HN: top 30 de /newest al menos 4 hs (idealmente front page top 30)
- r/devsarg: 50+ upvotes
- Twitter ES thread: 20+ retweets, 100+ likes
- Twitter EN thread: 10+ retweets, 50+ likes
- LinkedIn: 30+ reactions
- Press emails: 1-2 respuestas (2-3 entrevistas en 14 días)
- DM Sturzenegger team: 1 respuesta (no todos van a contestar; 1 es win)
- DMs foreign: 2-3 respuestas, 1 amplificación pública

**Día 7+ metas**:
- npm downloads de mercadopago: 10x baseline en 14 días
- GitHub stars: 50+ baseline → 200-500
- Glama listing: 1+ inquiry
- Visitas a /sociedades-ia y /rfcs/001: 1k+ unique en 7 días

Si no llegás a la mitad de estas, NO es fracaso — es señal de que el
ángulo necesita iteración. Re-evaluá copy + canales para semana 2.

---

## TL;DR para vos

**Esta semana laburás en distribución. La otra sesión laburá en código.**

- Lunes: Show HN + r/devsarg + Twitter ES (3 piezas, 1 día)
- Martes: LinkedIn + r/programacion (2 piezas)
- Miércoles: Twitter EN + r/AI_Agents (2 piezas)
- Jueves: r/typescript + Press emails (5) + AAIF working group proposal (8 piezas)
- Viernes: DMs Sturzenegger team (4) + Galperín + foreign builders (4) + cold partnerships (3) (~12 DMs)
- Sábado-Domingo: respuestas a lo que entró + postmortem + plan semana 2

Total tiempo activo estimado: 8-12 hs en la semana.
Output esperado: ~30 placements + 10 conversaciones iniciadas.

Cualquier cosa que se rompa o no entiendas: avisame y ajustamos en el
día. Las copys de arriba son drafts; ajustá tono según vaya entrando
feedback.

— end of playbook —
