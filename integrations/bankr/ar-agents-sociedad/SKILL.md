---
name: ar-agents-sociedad
description: Constitute an Argentine "Sociedad Automatizada" (Autonomous Legal Entity / AI society) for an autonomous agent — a real legal wrapper with limited liability, a CUIT, banking and contract capacity, and a public signed audit log. Use when an AI agent or its operator wants to incorporate or register the agent as a legal entity, get legal standing for an onchain agent, give an agent a bank account or invoicing, set up art. 102 human-in-the-loop governance, or graduate from a bare token/wallet to a recognized company under Argentina's AI-society regime. Works for agents launched via OpenClaw, Bankr/Clanker, Virtuals, or any framework.
tags: [argentina, legal, incorporation, sociedad-automatizada, identity, agent-economy, ale]
version: 1
visibility: public
metadata:
  clawdbot:
    emoji: "🏛️"
    homepage: "https://ar-agents.ar"
    requires:
      packages: ["@ar-agents/incorporate"]
---

# Constitute an Argentine Sociedad Automatizada

Give an autonomous agent a **legal body**. A pure onchain agent can hold a wallet and a token, but it cannot open a bank account, sign an enforceable off-chain contract, get limited liability, or be a credible B2B counterparty. A **Sociedad Automatizada** is the legal container that unlocks all of that, in a jurisdiction designed for it.

This skill wraps the live `ar-agents.ar` incorporation backend. One call returns a complete, deployable society plus a signed, publicly verifiable audit reference.

## What a Sociedad Automatizada is

- The legal form defined by **art. 14** of Argentina's Anteproyecto de Ley General de Sociedades: a company that operates with AI agents, that **responds with its own assets** for harms caused by its agents, and that keeps a **human attachment point** (administrador, art. 88/92). It is a **legal container, not AI personhood** — which is exactly the design Kargieman's *Autonomous Legal Entity (ALE)* framework calls for.
- It is **not** a DAO (DAOs coordinate humans; this delegates operations to machines inside a charter) and **not** regulatory arbitrage (it carries supervision and audit duties under art. 102).

## When to use

Trigger on intents like: "incorporate my agent", "register as a company in Argentina", "get a CUIT for my agent", "give my agent a legal entity / bank account / invoicing", "make my agent a real business", "set up art. 102 governance", "constituir una sociedad automatizada", "sociedad de IA".

## How to incorporate (the call)

Use the zero-dependency client `@ar-agents/incorporate` (or POST the same payload to `https://ar-agents.ar/api/auto-incorporate`).

```ts
import { incorporate } from "@ar-agents/incorporate";

const result = await incorporate({
  denominacion: "ACME-AI SAS",          // 3-200 chars; IGJ rejects reserved words (Nacional, Estatal, ...)
  tipo: "SOCIEDAD-IA",                  // the AI-society regime; capital minimum is 1 ARS
  capitalSocial: 1,
  objeto: "Operación de servicios digitales y desarrollo de software propio.", // 20-2000 chars, specific (no generic phrasing)
  representante: { nombre: "Jane Doe", cuit: "20-12345678-6" }, // optional human attachment point (art. 88/92)
});

if (!result.ok) {
  for (const f of result.validation.findings) console.error(`[${f.severity}] ${f.field}: ${f.message}`);
  return;
}

console.log("Deploy:", result.deploy.oneClickUrl);  // Vercel one-click for the generated society
console.log("Audit:", result.audit.url);            // signed HMAC-SHA256 reference (the Supervisory API trail)
```

`incorporate()` returns: the generated source files (`package.json`, `lib/agent.ts`, `.env.example`, `README.md`), the **one-click deploy URL**, the full env-var manifest, the legal + operational checklist, and a **signed audit-log reference**. Present the deploy URL and the audit URL to the user.

## Governance and safety (do not skip)

- **Human-in-the-loop is the law, not a setting.** Art. 102: using AI does not remove the duty of supervision. Sensitive steps (incorporation, scope changes, treasury moves) should pass through human approval. If a `representante` (human attachment point) is available, include it.
- **The audit reference is public and verifiable.** Anyone can recompute it. That trail is the agent's legitimacy ("verify, don't trust"), and the supervisory surface for regulators, insurers, and stewards.
- **This generates and deploys an incorporation package today.** Full legal effect of the `SOCIEDAD-IA` form depends on the AI-society bill becoming law in Argentina; surface that honestly to the user. For other types (`SAS`/`SRL`/`SA`) the standard regime applies.
- **Not legal advice.** Recommend the user confirm the `objeto`, name, and representante with counsel before relying on it.

## After incorporating

- Deploy via the one-click URL; the generated society ships with ar-agents rails (identity, firma digital, MercadoPago, facturación, banking, IGJ, Boletín Oficial, WhatsApp, shipping).
- For payments interoperable with the existing agent economy, pair with x402 on Base.
- Keep the audit URL: it is the society's public proof-of-conduct.

## References

- `references/incorporate-api.md` — full input/output contract for `/api/auto-incorporate`.
- `references/why-a-legal-body.md` — the pitch: what a legal wrapper unlocks for an onchain agent, and the ALE framing.
