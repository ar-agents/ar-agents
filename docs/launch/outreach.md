# Draft — Outreach DMs for working group + advisors

> Three drafts. Personalized. Each ≤ 600 chars (DM-friendly). Spanish for
> AR contacts; English for international/MELI engineering.

---

## 1) Mariano Reingart — `pyafipws` author

**Channel:** GitHub issue / email (visible on his repo profile)
**Subject:** /arg — Argentine agent infrastructure, ¿charla?

Hola Mariano,

Soy Naza Clemente. Estoy shipeando una colección de packages npm open
source (`@ar-agents/*`, ar-agents.ar) que wrappea AFIP/ARCA,
Mercado Pago, BCRA, Boletín Oficial, IGJ, Firma Digital y otros como
tools del Vercel AI SDK 6 — pensando en agentes IA y en lo que va a
necesitar el régimen de "sociedades de IA" si llega a aprobarse.

Tu trabajo en `pyafipws` fue el reference que más leí cuando armé la
parte de WSAA + WSFE. Quería invitarte a un working group informal
para cuidar standards técnicos de esta capa. ¿Tenés 30 min para una
call esta semana?

Manifiesto: ar-agents.ar/manifiesto

Saludos,
Naza

---

## 2) Pablo Zamudio — Mercado Libre Tech (MP MCP author)

**Channel:** Medium DM / Twitter / LinkedIn
**Subject:** ar-agents/mercadopago + /arg — coordinación

Hola Pablo,

Vi tu post en medium.com/mercadolibre-tech sobre el MCP de MercadoPago.
Excelente trabajo — me resultó muy clarificador para encarar el agent-
ergonomics de mi propio package, `@ar-agents/mercadopago` (89 tools,
focus en AR-subscriptions, parte de un toolkit más amplio para integrar
agentes IA con servicios públicos AR).

No competimos: tu MCP cubre breadth multi-país; el mío profundiza en
patrones AR (cuotas, ARCA, factura electrónica). Quería abrir un canal
para coordinar cuando haya overlap, y eventualmente sumarte como
advisor del working group /arg.

¿Tenés tiempo para un café virtual?

Saludos,
Naza
ar-agents.ar

---

## 3) datos.gob.ar / datosgobar team

**Channel:** Email a contact@datos.gob.ar / Twitter @datosgobar
**Subject:** Wrapper open-source para CKAN de IGJ + georef-ar

Hola equipo,

Soy Naza Clemente, dev independiente. Acabo de publicar
`@ar-agents/igj`, un wrapper TypeScript del CKAN de datos.jus.gob.ar
para que developers AR (y agentes IA) puedan consumir datos de IGJ
directamente — search de entidades, autoridades, balances, etc. —
con tools del Vercel AI SDK 6 y un manifest machine-readable.

El package surface el `coverageNote` (dataset es muestreo) en cada
respuesta para que nadie use absencia de datos como prueba.

Próximos targets en mi roadmap: `@ar-agents/georef` (georef-ar-api),
`@ar-agents/series-tiempo`, `@ar-agents/datosgobar` (cliente CKAN
genérico).

¿Hay alguien con quien coordinar para que estos wrappers sean
endorsed-by-default por su equipo? Y para entender la cadencia de
republicación de los datasets para no romper el lib silenciosamente.

Saludos,
Naza
github.com/ar-agents/ar-agents

---

## Working group meta-message (envío masivo después de las primeras 3)

**Subject:** Argentine Agent Infrastructure WG — primera reunión

Hola,

Te invito a la primera reunión informal del Argentine Agent
Infrastructure Working Group. Objetivo: discutir y consensuar
estándares técnicos para la capa de integración entre agentes IA y
servicios públicos AR — con foco específico en ser civil/OSS y
extensible.

**Cuándo:** [TBD — sugiero un martes 19hs ARG]
**Dónde:** Discord (link al confirmar)
**Qué:** 60 min. Agenda:
- Estado actual de cada paquete /arg
- Gaps que faltan (GDE, INPI, ANSES, etc.)
- Convención AGENTS.md y standards de manifest
- Próximos 60 días: roadmap + responsables

**Quién:** Pensé en convocar a:
- @reingart (pyafipws)
- @relopezbriega (arca_arg)
- Pablo Zamudio (MELI MP MCP)
- datosgobar
- ACIJ / Dymaxion / Democracia en Red

¿Vienen? Confirmen y armo el calendar invite.

Saludos,
Naza
ar-agents.ar/manifiesto

---

## Notes for sending

- Send 1-by-1 personalized; don't BCC.
- For DMs that allow it, link to the manifesto + RFC-001 — those are the
  highest-signal pieces for technical credibility.
- Track responses in a spreadsheet (date sent / response / action).
- If no reply in 7 days, one polite follow-up. If no reply after that,
  drop and don't pester.
- Tone calibration: Mariano + datosgobar are civic-tech / open-source.
  Keep it humble + community-first. Pablo is a corporate engineer at
  MELI — keep it more product-oriented and acknowledging.
