# Demo video script — "Una sociedad de IA en producción"

**Target**: 2:45-3:00 min, single take, screen recording + voiceover. Optional face-cam.
**Idioma**: español argentino (canónico). EN voiceover en script alterno al final.
**Goal**: que cualquier dev / periodista / asesor político entienda en 3 min qué es esto y por qué importa AHORA.

---

## Setup pre-grabación (10 min)

Abrir en tabs separados:

1. `https://ar-agents.ar/sociedades-ia` — página tesis, scrolleada al mapa de 17 piezas
2. `https://whatsapp-hello.ar-agents.ar` — demo live, listo para tipear prompt
3. `https://github.com/ar-agents/ar-agents` — repo, con la vista de packages
4. `https://ar-agents.ar/rfcs/001` — RFC, scrolleado a la sección 9 (responsabilidad)
5. VS Code con `packages/mercadopago/AGENTS.md` abierto

Terminal en split (opcional): `pnpm --filter mp-hello dev` corriendo (port 3013) por si el live demo falla.

OBS Studio o Loom. Mic: cualquier USB decente o AirPods Pro. Resolución 1080p. Cursor visible.

---

## Script (timestamps + on-screen + voiceover)

### [0:00 – 0:12] Hook

**On screen**: Tab `/sociedades-ia` con eyebrow "/arg · sociedades de IA" + título visible.

**Voiceover**:
> "El 28 de abril, el ministro Sturzenegger anunció una nueva forma jurídica: empresa argentina, **cero humanos**, cien por ciento código. El martes pasado me puse a construir la infra técnica que pensé que iba a requerir. Esta es la semana que pasó."

### [0:12 – 0:45] El mapa de 17 piezas

**On screen**: Scrolleo lento al bloque `PASO / REQUIERE / COBERTURA /arg`. Cursor recorriendo las filas.

**Voiceover**:
> "Una sociedad de IA necesita diecisiete piezas técnicas para operar: existir como entidad, probar quién es ante el Estado, manejar plata, operar con clientes, monitorear el Boletín Oficial. Estas son. Dieciséis las cubre `@ar-agents/*` ya en npm. La que falta — domicilio legal digital, GDE/TAD — no la tiene nadie en el mundo. Trabajo en eso."

### [0:45 – 1:35] Demo en vivo

**On screen**: Tab `whatsapp-hello`. Prompt vacío. Tipear lentamente:

```
Cobrale $25.000 mensual a +5491155667788 con razón "Plan Pro".
Cuando tenga link de pago, mandáselo por WhatsApp.
```

Click "Send". Esperar.

**Voiceover** (mientras el agente compone):
> "Esto es Claude Sonnet 4.6 usando cuatro librerías en composición: `identity` para validar el CUIT, `mercadopago` para la suscripción, `facturacion` para emitir factura, y `whatsapp` para avisar. Real — apunta a sandbox de MP y ARCA homo. No es mock."

**On screen**: Cuando el agente devuelve, scrollear el output mostrando:
- Tool call `validate_cuit` → válido
- Tool call `create_subscription` → init_point URL
- Tool call `send_template` → message_id

**Voiceover**:
> "Cuatro tool calls, doce segundos. Si el cliente paga, el webhook de MP llega al endpoint, el agente confirma, emite factura A, manda comprobante. Sin humanos en el medio."

### [1:35 – 2:10] La arquitectura

**On screen**: Tab GitHub repo, vista `/packages/`. Cursor recorriendo la lista.

**Voiceover**:
> "Once paquetes npm. Cada uno independiente. Cada uno con `AGENTS.md` que el LLM lee en runtime — convención de Linux Foundation Agentic AI Foundation. Cada uno con npm provenance attestation, Edge Runtime via Web Crypto, idempotencia determinística por SHA-256 de los inputs para que los reintentos del agente no cobren dos veces."

**On screen**: VS Code con `packages/mercadopago/AGENTS.md`. Scroll rápido mostrando: decision tree, result schemas, error patterns, latency table.

**Voiceover** (sobre el scroll):
> "Tool selection rules. Result schemas que el modelo memoriza. Tablas de latencia. Patrones de error. Esto es lo que hace que un agente acierte el tool en el primer intento, no en el tercero."

### [2:10 – 2:45] El RFC y el ataque legal

**On screen**: Tab `/rfcs/001`, scrolleo a la sección "9. Marco de responsabilidad".

**Voiceover**:
> "El ataque central al plan Sturzenegger es: ¿quién responde si una sociedad-IA defrauda? El RFC-001 propone tres capas concatenadas: responsabilidad operativa del oficial digital — humano físico en IGJ —, responsabilidad de auditoría con logs HMAC-firmados de cada tool call, y operator-of-record para escribanos o plataformas SaaS que actúen como facade. Las tres son acumulativas. Una víctima tiene tres demandados."

**On screen**: Brevísimo zoom al footer del RFC: "License: CC0. Comments: github.com/ar-agents/ar-agents/discussions"

**Voiceover**:
> "CC cero. Comentarios públicos. Si te dedicás a derecho corporativo y querés discutir, hay un thread abierto."

### [2:45 – 3:00] CTA

**On screen**: Tab homepage `ar-agents.ar`.

**Voiceover**:
> "`ar-agents.ar`. MIT. Once paquetes en `npmjs.com/org/ar-agents`. Si sos dev y querés laburar en `@ar-agents/tad` — la pieza que falta —, hablemos. Si sos del equipo Sturzenegger, también."

**Final beat**: 1 segundo de silencio sobre la homepage. Cortar.

---

## Versión inglesa (alternativa, mismo timing)

### [0:00 – 0:12]
> "On April 28, Argentina's Minister of Deregulation announced a new corporate type: a company with zero human shareholders, zero human directors, zero human employees. Just code, paying taxes like any S.A. Last Tuesday I started building the technical infrastructure I thought it would need. Let me show you what shipped this week."

### [0:12 – 0:45]
> "An Argentine AI company needs 17 technical pieces to operate: existing as a legal entity, proving identity to the state, money in and out, customer ops, monitoring the official gazette. Sixteen of them are covered in `@ar-agents/*` on npm today. The seventeenth — digital legal address via GDE/TAD — nobody in the world has. I'm working on it."

### [0:45 – 1:35]
> "This is Claude Sonnet 4.6 composing four `@ar-agents` libraries: identity for CUIT validation, mercadopago for the subscription, facturacion for the electronic invoice, whatsapp for the customer notification. Real — pointed at MP sandbox and ARCA homo, not mocks."
>
> [after the agent returns]
> "Four tool calls, twelve seconds. If the customer pays, MP's webhook fires, the agent confirms, emits invoice A, sends receipt. No humans in the loop."

### [1:35 – 2:10]
> "Eleven independent npm packages. Each ships an `AGENTS.md` the LLM reads at runtime — Linux Foundation Agentic AI Foundation convention. Each with npm provenance attestations, Edge Runtime via Web Crypto, deterministic SHA-256 idempotency keys so retries never double-charge."
>
> [scrolling AGENTS.md]
> "Tool selection rules. Result schemas to memorize. Latency tables. Error patterns. This is what makes an agent pick the right tool on the first try."

### [2:10 – 2:45]
> "The central legal attack on Sturzenegger's plan is: who's liable when an AI company defrauds someone? RFC-001 proposes three layered tiers: operational liability of the digital officer — a human listed at IGJ —, audit liability via HMAC-signed tool-call logs, and operator-of-record liability for notaries or SaaS platforms acting as facade. All three accumulate. A victim has three defendants."
>
> [zoom footer]
> "CC0. Public comments. If you're a corporate lawyer and want to push back, there's an open thread."

### [2:45 – 3:00]
> "`ar-agents.ar`. MIT. Eleven npm packages. If you're a dev and want to work on `@ar-agents/tad` — the missing piece —, let's talk. Same if you're on Sturzenegger's team."

---

---

## Versión 60 segundos — alternativa para email/DM/WhatsApp

Mismo contenido más comprimido, pensado para attachear o linkear en cold emails. Highlight: el demo de `/play` con audit log en vivo es el protagonista.

### Storyboard (target 55-70 seg)

| t | scene | screen | voiceover ES |
|---|---|---|---|
| 0:00 | open | `ar-agents.ar` home | "Esto es ar-agents — implementación de referencia open-source para sociedades de IA argentinas." |
| 0:05 | nav | click `play live ↗` | "El proyecto que anunció Sturzenegger el 28 de abril propone que existan empresas 100% IA. Esta es la página donde se las puede ver operando hoy." |
| 0:11 | `/play` loads | full-screen, audit log empty | "Sociedad-IA simulada: ACME-AI SAS. Ningún tool toca APIs reales — todo sandboxed." |
| 0:18 | click scenario 01 | `cobro B2B` highlights | "Le pido que cobre 75 mil pesos a un cliente B2B con CUIT real." |
| 0:24 | streaming | tool calls aparecen en audit log | "Mirá lo que pasa." |
| 0:28 | `validate_cuit` | algorithm-only pill | "Primero valida CUIT con algoritmo mod-11. Pure algoritmo, no toca red." |
| 0:34 | `lookup_cuit_afip` | mocked-upstream pill | "Después consulta padrón ARCA — en producción usa cert WSAA real, acá mockeado." |
| 0:40 | `lookup_credit_situation` | mocked-upstream pill | "Cruza con BCRA Central de Deudores antes de decidir." |
| 0:46 | `mp_create_subscription` + `send_whatsapp_text` | audit-logged pill | "Si está al día, crea la suscripción de Mercado Pago y manda link por WhatsApp. Cada llamada queda en audit log con timestamp HMAC-firmado." |
| 0:54 | open audit entry | expand JSON inputs/outputs | "Reproducible. Auditable. RFC-001 § 9." |
| 0:58 | back to home | scroll to `/architecture` link | "13 paquetes en npm, 168 tools. MIT. SLSA v1 provenance." |
| 1:05 | end | URL `ar-agents.ar/play` | "ar-agents.ar/play" |

### Producción

- **Browser**: incognito Chrome 1280×800
- **Cursor**: visible, motion deliberado, 0.5-1s entre clicks
- **Audio**: room mic, no compression, normalize -3dB peak
- **Subtítulos**: bake-in español (descript / ffmpeg)
- **End card**: 2 seg URL sobre fondo blanco, sin CTA button
- **Export**: H.264 8 Mbps, AAC 192 kbps, ~30 MB max — funciona en WhatsApp / Telegram / tweets
- **NO**: música, stinger, animations, talking-head intro, callouts. La dignidad del demo es su mood.

### Cuándo usar la 60-seg vs la 3-min

- **60-seg `/play`-focused**: cold emails (Sturzenegger, Gazzo Huck, prensa), DMs cortos, attaches WhatsApp/Telegram
- **3-min completa**: HN, X thread, LinkedIn, YouTube principal

Ambas funcionan independientes. Grabás las dos el domingo si tenés tiempo, sino prioridad la 3-min y la 60-seg la generás de un crop después.

---

## Notas de grabación

- **Pacing**: hablá un toque más rápido de lo natural (ahorra segundos en pausas).
- **Errores**: si pifiás una palabra, seguí — la edición es 5 min con descript.com / Adobe Podcast Enhance.
- **Mouse cursor**: visible pero no nervioso. Movés a la región, paús medio segundo, click.
- **Música**: NO. Voiceover seco gana credibilidad técnica.
- **Subtítulos**: ES + EN, generados con descript o automáticos de YouTube + corrección.
- **Thumbnail**: el bloque del mapa de 17 piezas con un overlay "Sociedades de IA · ya implementadas en código · 16/17". Centra el "16/17" — visualmente claro.
- **Title YT (ES)**: `Una sociedad de IA argentina, en producción — implementación del plan Sturzenegger`
- **Title YT (EN)**: `An Argentine AI company in production — implementing the Sturzenegger plan`
- **Description YT**: 3 párrafos. Link al repo. Link al RFC. Link al manifiesto. Hashtags `#argentina #ai #agents #sturzenegger #vercel`.
- **Upload primero como unlisted**, mandá a 3 amigos para feedback (1 dev, 1 periodista, 1 abogado), después público.
