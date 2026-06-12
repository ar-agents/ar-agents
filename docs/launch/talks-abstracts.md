# Draft — Talk abstracts for Nerdearla, JSConfAR, Vercel Ship LATAM

> Three abstracts targeting different communities. Pick the one that fits
> the venue's audience. Submission deadlines vary — check each conf.

---

## Abstract 1 — Nerdearla (general dev / civic-tech crossover)

**Título:** *El stack abierto para que un agente IA opere en Argentina*

**Duración:** 20-25 min

**Resumen (~150 words):**

En abril de 2026 el Ministro Sturzenegger anunció su plan para que
Argentina sea la primera jurisdicción con un régimen legal para
&ldquo;sociedades de IA&rdquo;: empresas sin humanos, solo código. La
narrativa ya está siendo escrita desde arriba; lo que falta es la capa
técnica que hace que esas sociedades — y cualquier developer argentino
construyendo agentes — puedan operar contra el Estado.

En esta charla muestro ar-agents, una colección de 36 packages npm (235 herramientas)
open-source que cubre AFIP/ARCA, Mercado Pago, WhatsApp, BCRA, Boletín
Oficial, IGJ, Firma Digital, Mi Argentina y RENAPER-bypass — todo como
tools del Vercel AI SDK 6, todo Edge-Runtime-compatible, todo MIT.

Vamos a ver el flujo end-to-end: cómo una sociedad-IA ficticia se
incorpora, factura, paga monotributo y atiende clientes en menos de 30
segundos de ejecución de agente.

**Audiencia ideal:** Developers AR, civic-tech, regtech, fintech.

**Take-aways:**
- Cómo está estructurado el stack ar-agents.
- El gap político y por qué la ventana es ahora.
- Cómo contribuir.

---

## Abstract 2 — JSConfAR (TypeScript / Vercel community)

**Título:** *Vercel AI SDK 6 tools, idempotencia determinística y
verificación de Firma Digital — todo en Edge Runtime*

**Duración:** 30 min

**Resumen (~150 words):**

El Vercel AI SDK 6 te da un slot estándar para tools, pero los detalles
fastidiosos de hacer un tool *agent-ergonomic* — idempotencia bajo
retries, HITL en operaciones irreversibles, AGENTS.md por package,
schemas Zod tipados, manifests machine-readable, Web Crypto en lugar de
node:crypto — son todos decisiones de ingeniería que se repiten paquete
a paquete.

Esta charla disecciona cómo ar-agents resuelve estos patrones en 33
packages npm open-source enfocados en integraciones argentinas (AFIP,
MercadoPago, WhatsApp, BCRA, Boletín Oficial, Firma Digital, etc.).
Vamos a ver:

- Por qué Edge Runtime + Web Crypto = no más bugs de Node-only.
- Cómo derivar idempotency keys determinísticas para sobrevivir LLM
  retries.
- Cómo escribir AGENTS.md que el LLM lee en runtime para elegir tools.
- Adapter pattern + UnconfiguredAdapter como default safe-by-default.

**Audiencia ideal:** TypeScript devs, Vercel users, agent builders.

**Repo en vivo:** github.com/ar-agents/ar-agents

---

## Abstract 3 — Vercel Ship LATAM (more strategic / framing)

**Título:** *Government as a Vercel-native API: building open
infrastructure for Argentina's AI agent jurisdiction*

**Duración:** 20-30 min

**Resumen (~150 words):**

The Argentine government has announced it wants to be the first
jurisdiction with legal personhood for AI-only companies (Sturzenegger,
April 2026). 50M humans + 500M AI agents paying taxes in AR is the
projection.

The political narrative is being built top-down, but the technical
substrate that those agent-companies need — Stripe-grade APIs to AFIP,
Mercado Pago, WhatsApp, identity providers, the Boletín Oficial — does
not exist. There is no "gov.br auth + Pix + Open Finance" equivalent in
Argentina.

This talk shows ar-agents: a Vercel-native, MIT-licensed npm scope that
fills that gap. 36 packages (235 typed tools), all built on Vercel AI SDK 6, all
Edge-Runtime-compatible, all MCP-native. The talk frames the strategic
positioning (open + civilian, distinct from the SIDE/Palantir track)
and walks the technical decisions that make Vercel the right platform
for this kind of public-sector dev infrastructure.

**Audience:** Vercel customers, LATAM dev leadership, gov-tech.

**Hook line:** "If India has India Stack and Brazil has gov.br, what
does Argentina have? Today nothing. Next year, ar-agents."

---

## Submission tracking

| Conf            | Submitted | Deadline | URL                        |
| --------------- | --------- | -------- | -------------------------- |
| Nerdearla       | TODO      | check    | nerdearla.com (Aug?)       |
| JSConfAR        | TODO      | check    | jsconf.ar                  |
| Vercel Ship LATAM | TODO    | check    | vercel.com/ship            |

## Bio (reusable across confs)

**Nazareno Clemente** is an Argentine independent developer building
the open infrastructure stack for AI agents in Argentina. Author of
the ar-agents toolkit (`@ar-agents/*` on npm), fiscally registered as a
monotributista en CABA, currently based in Spain. Previously: built
Astro (astro.ar), Publi (publi.ar). Twitter: @nazaclemente. GitHub:
@naza00000.
