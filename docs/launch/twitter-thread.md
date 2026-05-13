# Draft — Twitter thread connecting /arg to Sturzenegger announcement

> Tone notes: Naza's voice is direct, no fluff, builder-first. Use "/arg"
> with the slash. Drop emojis. Argentine Spanish. Each tweet ≤ 280 chars.
> The sequence funnels: shock → context → product → proof → ask.

---

## Thread A — &ldquo;Si Sturzenegger lo dice, alguien tiene que escribirlo&rdquo;

**1/** El 28 de abril Sturzenegger anunció en Expo EFI: Argentina va a
ser el primer país con régimen jurídico para *sociedades de IA*.
Empresas sin humanos. Solo código.

Su número: 50M habitantes + 500M agentes IA pagando impuestos acá.

El plan está. La capa técnica no.

**2/** Yo escribo /arg.

Es la infraestructura abierta para que esas sociedades — y cualquier
agente argentino — operen contra el Estado.

11 packages npm. Vercel AI SDK 6 + MCP. MIT.

ar-agents.ar

**3/** Lo que ya está shipeado:

@ar-agents/identity → CUIT + AFIP/ARCA padrón
@ar-agents/mercadopago → 89 tools de cobro
@ar-agents/whatsapp → Business Cloud + AR phones
@ar-agents/banking → CBU/CVU + BCRA
@ar-agents/facturacion → factura electrónica WSFE

**4/** Y los que cierran el círculo sociedad-IA:

@ar-agents/mi-argentina → OIDC del gobierno
@ar-agents/boletin-oficial → BO como firehose
@ar-agents/igj → datos de IGJ
@ar-agents/firma-digital → verificación Ley 25.506
@ar-agents/identity-attest → KYC sin RENAPER
@ar-agents/shipping → Andreani / OCA / Correo

**5/** Una sociedad-IA en producción se ve así:

→ igj_search_entities (¿existe el nombre?)
→ identity.lookup_cuit_afip (validar CUIT)
→ mp.create_subscription (cobrar)
→ facturacion.emitir (factura A)
→ wa.send_template (notificar)
→ bo.subscribe (monitorear)

12 segundos.

**6/** Demo completo con los 17 pasos de incorporación + operación:

ar-agents.ar/sociedades-ia

Manifiesto:

ar-agents.ar/manifiesto

RFC-001 (identidad + firma de agentes en AR):

ar-agents.ar/rfcs/001

**7/** /arg es civil. Comercial. OSS.

No vende a SIDE. No participa en contratos de inteligencia. Es la capa
para que developers + sociedades operen — no para sustituirlas en
seguridad estatal.

Esa es la diferencia con la otra narrativa que está sonando.

**8/** Si construís en Argentina, /arg ya es la base.

Si te interesa contribuir o sumarte al working group:

github.com/ar-agents/ar-agents

Issues abiertos. PRs bienvenidos. Consulting groups: dale, conversemos.

— Naza

---

## Thread B — &ldquo;Modo developer&rdquo; (alternativa más técnica)

**1/** Shipped 11 npm packages this week:

```
pnpm add @ar-agents/mercadopago      // 89 typed MP tools
pnpm add @ar-agents/identity          // AFIP/ARCA CUIT lookup
pnpm add @ar-agents/mi-argentina      // gov OIDC, PKCE+RS256
pnpm add @ar-agents/boletin-oficial   // BO firehose+subs
pnpm add @ar-agents/igj               // sociedades open data
pnpm add @ar-agents/firma-digital     // Ley 25.506 verify
```

**2/** All Vercel AI SDK 6 tools.
All Edge-Runtime-compatible (Web Crypto, no node:crypto).
All AGENTS.md-equipped for runtime tool selection.
All idempotent + HITL-gated where it matters.

MCP server bundles them all:

`pnpm add @ar-agents/mcp`

**3/** The wedge: when Sturzenegger's *sociedad de IA* law passes (or
doesn't — doesn't matter for the lib's value today), every entity
that wants to operate in Argentina needs this exact stack.

We just made it free + composable.

**4/** ar-agents.ar

— Naza

---

## Notes for posting

- Best window: Tuesday-Thursday morning AR time (10–12 ARG).
- Tag: @sturzenegger if framing around his plan; @rauchg if technical
  thread (he RTs Vercel-stack things).
- Reply guard: prepare answers for likely Qs:
  - "¿Y si la ley no pasa?" → "El stack sirve igual. Funciona para
    empresas humanas hoy."
  - "¿Cómo se diferencia de AfipSDK?" → "TS-first, Vercel AI SDK 6
    schemas, MCP-native, AGENTS.md, idempotencia determinística,
    Web Crypto only."
  - "¿Querés contratos del gobierno?" → "No. Es civil/comercial/OSS,
    explícito en el manifiesto."
