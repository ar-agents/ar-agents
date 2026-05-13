# Outreach emails — sociedad-IA reference implementation

Three drafts. Send each independently; they're not a sequence.

**Tone notes:** short, factual, no exclamations, no power-pose marketing copy. Open with the verifiable claim, follow with the link, close with a calm offer to talk. Asume the recipient is busy and skim-reading. The hook is `/play` — the live URL where they can see the agent operating without setup.

**Subject-line discipline:** keep under 70 chars; lead with the noun phrase, not a verb. Argentine inboxes are flooded with subject-spam.

---

## 1 · Federico Sturzenegger — Min. Desregulación

**To:** vía formulario público en `https://fsturzenegger.com.ar/contacto` (Sturzenegger crowdsourcea públicamente).
**Cc/Twitter handle:** `@fedesturze`.

**Subject:** Implementación de referencia open-source para sociedades de IA — 16 paquetes ya publicados en npm

```
Federico, buenas tardes.

Soy Nazareno Clemente, programador argentino de 26 años. Vi el anuncio
de sociedades de IA del 28 de abril y construí —antes de que exista
el texto del proyecto— una implementación de referencia técnica open-
source para que, el día que la ley se promulgue, cualquier sociedad
pueda incorporarse en menos de 30 minutos.

El stack está publicado en npm con licencia MIT y SLSA v1 provenance:

  • 16 paquetes que cubren las 17 piezas operativas de una empresa
    argentina (CUIT, padrón ARCA, factura electrónica WSFE, BCRA Central
    de Deudores, Mercado Pago, WhatsApp, Boletín Oficial, IGJ, GDE/TAD).
  • Marco de responsabilidad de tres capas (RFC-001) para responder
    "si la IA rompe algo, ¿quién responde?". Pensado para anticipar el
    debate parlamentario.
  • Threat model público de 14 amenazas con mitigaciones explícitas.
  • Una sociedad-IA simulada que se puede operar en vivo, sin setup,
    desde el navegador: ar-agents.ar/play

Demo de 60 segundos (sin instalación, sin cuenta): /play recibe un
prompt, el agente ejecuta tools reales auditadas y muestra el log
RFC-001 al costado. Pensado específicamente para que un asesor pueda
verificar el flujo en una reunión o desde el celular.

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

**Word count:** ~240. Under the 250 ceiling for ministerial inboxes.

---

## 2 · César Gazzo Huck — Subsec TIC

**To:** vía DM en `@cesargazzo` (Twitter), o LinkedIn `linkedin.com/in/cesargazzo`. Ambos canales públicos confirmados.

**Subject (DM):** open-source argentino para sociedades-IA · OGP-aligned

```
César, buenas tardes.

Vi tu rol en Open Government Partnership y tu trabajo en gobierno abierto
desde la Subsec de País Digital. Quería contarte un proyecto que está
alineado con esa agenda.

Soy Naza Clemente. En los últimos seis meses construí ar-agents
(github.com/ar-agents/ar-agents) — una librería open-source MIT que
cubre las 17 piezas operativas de una empresa argentina (factura
electrónica WSFE, padrón ARCA, BCRA Central de Deudores, Mercado Pago,
WhatsApp, Boletín Oficial, IGJ, GDE/TAD). Pensado para que cualquier
desarrollador pueda construir un producto AR-compliant en horas, no
meses.

Después del anuncio de Sturzenegger del 28-abr, lo extendí para que
sea la implementación de referencia para sociedades de IA: RFC-001
con marco de responsabilidad de tres capas, threat model público,
provenance SLSA v1 en cada release, y un demo en vivo donde se ve
el agente operar la sociedad: ar-agents.ar/play

El proyecto encaja exactamente con lo que vos venís impulsando: open
data, open source, auditabilidad pública por default. No estoy pidiendo
nada — me gustaría tu input técnico cuando tengas un rato. Si el
gobierno termina necesitando una capa de infraestructura para el
régimen sociedades-IA, me encantaría que esta sea la opción default
y open.

¿Café o un call de 20 minutos cuando puedas?

Naza
naza@helloastro.co
```

**Word count:** ~210.

---

## 3 · Prensa — iProfesional / Cronista / La Nación tecnología

**To:** redacciones de tecnología (los emails públicos del staff están en cada medio). Mandalo de a uno, en español, no en blast — los periodistas del beat son ~6 personas en total.

**Subject:** Argentino de 26 años publicó la implementación técnica para sociedades-IA antes de que la ley exista

```
Hola,

Cubro el anuncio de sociedades de IA del 28 de abril. Mientras avanza
el debate político y se redacta el proyecto, terminé de publicar —el
8 de mayo— la implementación de referencia técnica open-source que
cualquier sociedad-IA argentina necesitaría el día 1 del régimen.

  • 16 paquetes en npm, MIT-licensed, SLSA v1 provenance.
  • 168 herramientas que cubren las 17 piezas de una empresa argentina:
    factura electrónica AFIP/ARCA, padrón ARCA, BCRA Central de
    Deudores, Mercado Pago, WhatsApp, Boletín Oficial, IGJ, GDE/TAD.
  • Una sociedad-IA simulada en vivo: ar-agents.ar/play
    (zero setup, 30 segundos para verla operar).
  • Marco público de responsabilidad de tres capas (RFC-001) que
    propone una respuesta concreta al ataque "¿quién paga si la IA
    rompe algo?".

Soy Nazareno Clemente, 26 años, monotributista. Hago esto desde
Buenos Aires, sin financiamiento estatal ni de fondos. Si hay un
ángulo que les sirva para nota — perfil del programador, deep-dive
técnico de la implementación, comparativa con DAO LLCs de Marshall
Islands / Wyoming, o threat model — estoy disponible para entrevista
en español o inglés.

Repositorio: github.com/ar-agents/ar-agents
Sitio: ar-agents.ar
Press kit: ar-agents.ar/press-kit
Demo en vivo: ar-agents.ar/play

Naza Clemente
naza@helloastro.co
WhatsApp/llamadas: +34 695 63 22 37
```

**Word count:** ~230.

---

## Schedule

- **D+0** (the day the video is recorded): send Sturzenegger via formulario.
- **D+0**: DM Gazzo Huck on Twitter (he's active there).
- **D+1** (next morning): send 1 press email to iProfesional, 1 to Cronista, 1 to La Nación tech. Stagger by ~30 min to avoid looking like a blast.
- **D+3**: if no response from Sturzenegger, follow-up via Twitter mention quoting the original tweet.
- **D+7**: if still no response from press, post the Show HN entry — it usually surfaces in BA tech twitter even if it doesn't make the front page.

## Things to NOT include

- No mention of money / fundraising / pricing.
- No claim that you have a relationship with any government office.
- No name-dropping of Reidel, Milei, or any minister-by-extension.
- No vendor-comparison ("better than AfipSDK") — that goes in `/vs`, not in cold email.
- No "would love your thoughts" closer — that's a request without a return for the recipient. Use a calm "30 minutes when you can" instead.

## Logging

After each send, log to `docs/launch/outreach-log.md`:

```
2026-MM-DD HH:MM  recipient  via  status (sent|delivered|read|replied)
```

When someone replies, archive the conversation under `docs/launch/conversations/` (private mirror of public references only — never paste private email content into the public repo).
