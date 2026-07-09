# Sociedad-IA Starter

> The reference Next.js app for an Argentine **sociedad-IA** — an AI-only company under [Argentina's proposed regime](https://ar-agents.ar/sociedades-ia). Operated by an LLM agent on top of [`@ar-agents/*`](https://ar-agents.ar) (37 packages, 243 tools). MIT-licensed, SLSA-provenanced, RFC-001-governed. Deploy in one click.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter&project-name=sociedad-ia-starter&env=AGENT_API_KEY,ANTHROPIC_API_KEY,AFIP_CERT_PEM,AFIP_KEY_PEM,AFIP_CUIT,MERCADOPAGO_ACCESS_TOKEN,WHATSAPP_ACCESS_TOKEN,WHATSAPP_PHONE_NUMBER_ID,AUDIT_HMAC_SECRET&envDescription=Set%20AGENT_API_KEY%20(openssl%20rand%20-hex%2032)%20to%20enable%20%2Fapi%2Fagent%20and%20ANTHROPIC_API_KEY%20to%20boot.%20Each%20section%20degrades%20gracefully%20when%20its%20env%20vars%20are%20missing.&envLink=https://github.com/ar-agents/ar-agents/blob/main/apps/sociedad-ia-starter/.env.example)
[![Live demo](https://img.shields.io/badge/▲%20Live%20demo-ar--agents.vercel.app%2Fplay-black)](https://ar-agents.ar/play)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![SLSA v1](https://img.shields.io/badge/SLSA-v1-success)](https://slsa.dev)

## Lo que hace

Una sociedad-IA argentina necesita 16 piezas operativas (identity, banking, factura, MP, WhatsApp, BCRA, Boletín Oficial, IGJ, GDE/TAD…). Este starter las cablea todas:

- **Agent loop** (`POST /api/agent`) — un `Experimental_Agent` del Vercel AI SDK 6 con tools de 8 paquetes `@ar-agents/*` más `registrar_decision` (anota una decisión de negocio, no necesita ningún cliente externo). Protegido: exige `Authorization: Bearer <AGENT_API_KEY>` (fail-closed, 503 sin la key) y rate-limit 20/min por IP, porque corre tools reales y gasta tokens.
- **Audit log local** (`lib/audit-log.ts`): cada tool call del agent loop (éxito, error, o un refuse de gobernanza) queda ahí, con timestamp y resumen redactado, firmado HMAC si `AUDIT_HMAC_SECRET` está seteado. Visible vía `GET /api/status` -> `audit`, y en el cockpit de studio ("Acciones recientes").
- **Webhook receiver** (`POST /api/webhooks/mercadopago`) — verifica firma HMAC + replay window, parsea evento, dispatch.
- **Morning cron** (`GET /api/cron/morning`) — rutina diaria que lee DEC inbox + Boletín Oficial + manda digest.
- **Status page** (`GET /`) — muestra qué clientes externos están configurados vs. faltan env vars.

## Quickstart

```bash
pnpm install
cp .env.example .env.local
$EDITOR .env.local           # completá los valores reales
pnpm dev                     # http://localhost:3020
```

Cada cliente externo (ARCA, MP, WhatsApp) tiene degradación graciosa: si falta una env var, el tool correspondiente queda en modo `unconfigured` y el agente surface el error sin tirar la app.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter)

1. Click en el botón de arriba.
2. Pegar las env vars de `.env.example` en Settings → Environment Variables.
3. Para activar el cron: agregar `vercel.json` con `crons: [{ path: "/api/cron/morning", schedule: "0 12 * * *" }]`.

## Configuración por capas

| Variables | Habilita |
| --- | --- |
| (ninguna) | `bankingTools` (algoritmo + BCRA público), `gdeTadTools` (algoritmo), `igjTools`, `boletinOficialTools` |
| `AFIP_CERT_PEM` + `AFIP_KEY_PEM` + `AFIP_CUIT` | `identityTools` con padron real, `facturacionTools` |
| `MERCADOPAGO_ACCESS_TOKEN` | `mercadoPagoTools` (89 tools) |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | `whatsappTools` |
| `MERCADOPAGO_WEBHOOK_SECRET` | webhook receiver verifica firma |
| `CRON_SECRET` | cron rechaza requests sin Authorization header |
| `AUDIT_HMAC_SECRET` | entradas del audit log local firmadas (HMAC); sin ella se guardan igual, sin firmar |

Sin nada configurado, la app sigue funcionando: `pnpm dev` → la home page muestra qué falta. Útil para tests en Vercel sin secretos reales.

## RFC-001 governance

Toda decisión irreversible (refunds, cancellations, transferencias) pasa por `requireConfirmation`. Cada tool call queda en el audit log local con timestamp, HMAC-firmado si `AUDIT_HMAC_SECRET` está seteado.

Lectura completa: <https://ar-agents.ar/rfcs/001>.

### Probar el audit log contra una sociedad deployada (prueba en vivo)

1. Desplegá la sociedad desde studio (mintea `AGENT_API_KEY`, `STUDIO_STATUS_TOKEN` y `AUDIT_HMAC_SECRET` solo, sin tocar nada a mano) o manual (pegá `.env.example` en Vercel, incluyendo `AUDIT_HMAC_SECRET`).
2. Con el `AGENT_API_KEY` que te mostró el deploy (una sola vez), corré una tarea real que no necesita ningún cliente externo configurado:
   ```bash
   curl -X POST https://<tu-deploy>.vercel.app/api/agent \
     -H "Authorization: Bearer $AGENT_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Anotá que vamos a priorizar clientes mayoristas este mes"}'
   ```
   El agente va a llamar `registrar_decision`.
3. Verificá que quedó en el audit log local:
   ```bash
   curl https://<tu-deploy>.vercel.app/api/status \
     -H "Authorization: Bearer $STUDIO_STATUS_TOKEN" | jq .audit
   ```
   La entrada más reciente tiene `tool: "registrar_decision"`, `governance: "create"`, `errored: false`, y un `summary` con el texto de la decisión.
4. O simplemente abrí el dashboard de studio: la sociedad aparece en "Acciones recientes" del cockpit, sin visitar nunca la URL del deploy.

## Trust + audit

- npm provenance attestations (SLSA v1) en cada `@ar-agents/*`.
- OpenSSF Scorecard auditando la cadena de suministro.
- Reportá vulnerabilidades vía `SECURITY.md` upstream.

## Soporte

- Cookbook: <https://ar-agents.ar/examples>
- Architecture: <https://ar-agents.ar/architecture>
- Threat model: <https://ar-agents.ar/security>
- Issues: <https://github.com/ar-agents/ar-agents/issues>

## License

MIT — same as the rest of the toolkit.
