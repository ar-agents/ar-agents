# Recipe 02 — Daily-triage agent

A complete Vercel AI SDK 6 agent that, given a one-line instruction in Argentine Spanish, runs the full morning routine: reputation check → orders to ship → unanswered questions → claims with imminent SLA.

```ts
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MeliClient } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

const agent = new Agent({
  model: anthropic("claude-sonnet-4-6"),
  system: `Sos un asistente operacional para vendedores de Mercado Libre Argentina.
Hablás en español rioplatense, sos directo y específico.
Cuando reportás un problema (reputación amarilla/roja, claim por vencer, stock en cero),
indicás CLARAMENTE la severidad y la acción a tomar.

Reglas:
- Empezá por get_seller_reputation. Si hay alerta CRITICAL, eso es lo único que importa hoy.
- Para preguntas: usá classify_question_spam ANTES de mostrarlas — descartá spam, marcá borderline.
- Para claims: ordenalos por due_date ascendente. Cualquiera con < 24h restantes es prioritario.
- Para órdenes: separá las que ya están listas para imprimir etiqueta vs las que falta confirmar pago.`,
  tools: meliTools(client, { siteId: "MLA", sellerId: 123_456_789 }),
  stopWhen: ({ steps }) => steps.length >= 8,
});

export async function morningTriage() {
  const r = await agent.generate({
    prompt: "Dame el resumen operativo de hoy.",
  });
  return r.text;
}
```

Sample output:

```
🟡 REPUTACIÓN AMARILLA. Métrica delayed_handling_time: 4.2% (warning a 3%, critical a 6%).
   Acción: despachar todo lo del jueves antes de las 18h.

📦 ÓRDENES PARA DESPACHAR (12)
   8 listas para imprimir etiqueta (Mercado Envíos generó las guías).
   4 esperando confirmación de pago — no hagas nada todavía.

💬 PREGUNTAS PENDIENTES (5 reales, descarté 3 spam)
   - MLA1402155766 "¿Hay stock en talle M?" — sí, hay 12.
   - MLA1399004412 "¿Aceptan transferencia bancaria fuera de MELI?" — política: rechazar amablemente.
   ...

⚖️ CLAIMS POR RESPONDER
   ⚠️ Claim 5421 (orden 89342) vence en 19h. Tipo: missing_product. Subí prueba de envío.
```

The agent loop respects the `stopWhen` budget (8 steps max) so it doesn't spiral on a slow MELI day.
