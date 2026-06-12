# `/play` walkthrough — 60-second video script

**Audience:** Sturzenegger's office / Gazzo Huck (TIC) / press / SV.
**Goal:** prove the technical implementation of a sociedad-IA exists today and is auditable end-to-end.
**Format:** screen recording (QuickTime cmd+shift+5, Loom, or OBS), 1080p, no music.
**Voice:** Spanish rioplatense, calm, no salesy energy.
**Duration target:** 55–70 seconds.

---

## Storyboard

| t | scene | screen | voiceover |
|---|-------|--------|-----------|
| 0:00 | open | `ar-agents.ar` home | "Esto es ar-agents — la implementación de referencia open-source para sociedades de IA argentinas." |
| 0:05 | nav | click `play live ↗` | "El proyecto que anunció Sturzenegger el 28 de abril propone que existan empresas 100% IA. Esta es la página donde se las puede ver operando hoy." |
| 0:11 | `/play` loads | full-screen, audit log empty | "Esto es una sociedad-IA simulada llamada ACME-AI SAS. Ningún tool toca APIs reales — todo está sandboxed." |
| 0:18 | click scenario 01 | `cobro B2B` highlights | "Le pido que cobre 75 mil pesos a un cliente B2B con CUIT real." |
| 0:24 | streaming | tool calls appear in audit log right pane | "Mirá lo que pasa." |
| 0:28 | `validate_cuit` | algorithm-only pill | "Primero valida el CUIT con el algoritmo mod-11 de AFIP. Pure algoritmo, no toca red." |
| 0:34 | `lookup_cuit_afip` | mocked-upstream pill | "Después consulta el padrón ARCA — esto en producción usa el certificado WSAA real, acá está mockeado." |
| 0:40 | `lookup_credit_situation` | mocked-upstream pill | "Cruza con BCRA Central de Deudores antes de decidir." |
| 0:46 | `mp_create_subscription` + `send_whatsapp_text` | audit-logged pill | "Si está al día, crea la suscripción de Mercado Pago y manda el link por WhatsApp. Cada llamada queda en el audit log con timestamp HMAC-firmado." |
| 0:54 | open audit entry | expand the JSON inputs/outputs | "Reproducible. Auditable. RFC-001 § 9." |
| 0:58 | back to home | scroll to `/architecture` link | "33 paquetes en npm, 221 tools. MIT. SLSA v1 provenance. Listo para complementar la ley el día uno." |
| 1:05 | end | URL highlighted | "ar-agents.ar/play" |

## Production notes

- **Browser**: incognito Chrome window at 1280×800 (matches the `/play` max-width — page chrome looks dense and intentional, not stretched).
- **Cursor**: visible (Loom shows it natively; QuickTime needs the cursor option toggled on).
- **Mouse motion**: deliberate. Pause 0.5–1s between clicks.
- **Audio**: room mic, no compression, normalize at -3dB peak.
- **Subtitles**: bake in Spanish subtitles (ffmpeg burn-in, or Loom's auto-captions). The international audience reads them.
- **End card**: 2 seconds of static title `ar-agents.ar/play` over white background. No CTA button — just the URL.
- **Export**: H.264, 8 Mbps, AAC 192kbps. ~30 MB max. Works on WhatsApp, Telegram, embedded in tweets.

## Where to publish

- LinkedIn post (Naza personal) — gets it into Argentine corporate / VC circles.
- Twitter/X thread — pin the tweet for 30 days; first reply is the link to `/incorporar`.
- Email attachment OR YouTube unlisted link in the cold emails. Embed > attachment if mail clients allow it.
- Hacker News submission — `Show HN: An interactive demo of an AI-only Argentine company under our country's proposed legal regime`.

## What NOT to do

- No music or stinger animations — the dignity of the demo is its own mood.
- No "before/after" or "with us / without us" framing — the regulator audience reads that as marketing.
- No talking-head intro — the screen is the protagonist.
- No animated arrows or callouts — the audit log is the callout.
- Don't hold the camera on yourself ever. This is a tool demo, not a personality demo.
