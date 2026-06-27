# ar-agents homepage — critique panel + reference synthesis

Date: 2026-06-26. Inputs: 6-agent panel (3 critique lenses: conversion, design/UX, technical/SEO/a11y; 3 reference studies: Stripe, formation+compliance, dev+agent infra) over the new home preview. Copy still a rough first pass. Companion to `RELAUNCH-SCOPE.md`.

## 1. Consensus critique (ranked — flagged by multiple lenses = high confidence)

1. **Above-the-fold is text-only; no product, no proof, dead right side.** (design=critical, conversion, + my eval, + every reference). The one visual we own (HeroDiagram) is buried in section 2. The first screen reads like a README, not a startup. → Put a visual in the fold.
2. **Hero states the category noun, not the outcome; "sociedad automatizada" is undefined cold.** (conversion=high×2, my eval). A founder wants "a business that runs itself," not "to register an automated company." Define the term in the first sentence; lead with the outcome.
3. **Three equal CTAs = no CTA, and the primary is mislabeled.** (conversion=high, design=med). Pre-law "Empezar"→/incorporar promises a flow that legally dead-ends. → One primary (honest: "Generá tu sociedad" / waitlist), one secondary (the live agent), drop the third.
4. **No proof above the fold; the first thing after the headline is a *warning* banner.** (conversion=high, design, my eval). Proof (live agent, "we incorporated ourselves", 36 packages/MIT) is all below the fold. → Pull one proof strip up; reframe the law banner from "not ready" to "early access / why now."
5. **Nav hides all 5 items behind a hamburger on desktop; and the new full-width bar now misaligns with the 920px body.** (design=high, a11y=med). → Inline links on ≥768px in a container that shares the body's left edge; hamburger only on mobile. (The full-width change I made needs this follow-up or the logo floats off the H1 edge.)
6. **All machine signals still sell the OLD positioning.** (technical=critical×2). `<title>`/meta/OG/JSON-LD say "open infrastructure for AI corporations / 36 packages"; the FAQPage + HowTo JSON-LD describe Q&A/steps no longer on the page (Google policy risk + AI engines quote the wrong product). → Rewrite all meta around the new promise; delete or rebuild+render the FAQ/HowTo schema.
7. **`--text-muted` (#717171) fails WCAG AA** (4.3:1) for the eyebrows, law note, footer (all <18px). → lighten to ~#8a8a8a.
8. **Pure-black #000 + near-invisible cards = austere/terminal, not premium.** (design=med). → bg #0a0a0a, bg-tint ~#141414 so cards separate.
9. **Seven identical sections, no peak; El Auditor (the paid differentiator) looks like everything else.** → Give El Auditor a distinct, larger treatment with a signed-log visual.
10. **Entire home is a client component** (perf). → RSC + small client islands (heed `AGENTS.md`: Next 16 is non-standard, verify patterns first).
11. **Copy nits:** "las rieles" → **"los rieles"** (riel is masculine); lock one canonical number (36 packages / 235 tools / 89 flagship are used inconsistently).

## 2. Reference north-stars

**Master template — Stripe Atlas (`stripe.com/atlas`):** the best "complex legal thing → a few clicks" on the web, and our closest twin.
- Hero = imperative verb, 3 words ("Constituye tu startup"), subhead = outcome list, CTA repeats the verb.
- **The hero IS the product**: a live company-name input + entity toggle — you're mid-flow before you scroll.
- Shows the finished artifact (a sample company card w/ EIN, date, ownership).
- Borrows authority (Cooley LLP), proof ("100,000+ founders, 140+ countries"), open pricing with a value-stack offset.
- Hides the legal machinery (EIN/83(b)/stock) in a lower "what's included" checklist, never the hero.

**El Auditor — Vanta / Drata / Stripe Radar:** how to sell an invisible trust layer.
- Trust-as-headline in ~5 words ("Trust is everything" / "Win With Trust"); name the moat in the headline (Radar: "el poder de la red").
- Lead with the **agent doing the work** + "audit-ready / siempre listo para auditoría" as the core promise.
- Replace features with relief metrics + one tangible stat (Radar: "92% of cards already seen" + "reduces fraud 32%").
- The visual is the **signed-log artifact** (hash + signature + timestamp), not a dashboard — trust has no screen. Show your own trust badges (the law/article + signing standard).

**Dev/agent side — E2B / Resend / Neon / Browserbase:** make a toolkit feel like a product.
- **One tiny beautiful code snippet** as hero (Resend `await resend.emails.send({...})`), not a wall of code → e.g. `await company.invoice.create(...)`.
- Steal the line: Neon "integrate with a single command and **the LLM does the hard work**" — collapses the simple/technical tension in 9 words.
- **"Setup for your agent"** CTA next to the human one (Browserbase) → MCP / llms.txt.
- Proof bar: npm downloads + GitHub stars + scale (E2B "7M+ downloads · 1B+ sandboxes"); name all audiences in one line + quantify the agent one separately (Mintlify "startups, enterprises, and agents · 2B+ agents").
- Dual co-equal CTA everywhere: "Empezá gratis" + "Ver la documentación."

**Formation/compliance — Mercury, Firstbase, Doola, Clerky:**
- Speed promise (Mercury "apply in 10 minutes") → "constituida en minutos."
- Two-CTA for two audiences (Firstbase "Start my company" / "Onboard existing") → "Crear una sociedad" / "Conectar una existente."
- Name the fear (Doola "if you don't know what you don't know, we're for you") + risk-reversal/guarantee.
- Sell correctness/safety (Clerky "done safely, avoid expensive problems") with expert/lawyer endorsements.
- Name the regulated counterparties (Stripe Treasury names Fifth Third Bank + FDIC) → name **Bitso**, the banking partner, Base/CCTP for the money rails.

## 3. Prioritized action plan

**Tier A — quick wins (low risk, high impact; do first):**
- A1. Rewrite `layout.tsx` meta: `<title>`, description, OG, Twitter, and the JSON-LD `SoftwareApplication` headline/description → new positioning, Spanish-first. Fix `og:locale` (es_AR primary) + hreflang/x-default.
- A2. Delete the stale `FAQPage` + `HowTo` JSON-LD (or rebuild around the new story AND render a visible FAQ section).
- A3. `globals.css`: `--text-muted`→~#8a8a8a (AA); `--bg`→#0a0a0a, `--bg-tint`→~#141414.
- A4. Nav: inline links on desktop (shared 920–1100px container, logo aligned to H1), hamburger only on mobile; fix the disclosure a11y (drop role=menu, add focus mgmt).
- A5. Copy: "los rieles"; one canonical number set; reframe law banner (warning-tint bg + "early access" tone, promote the existing `note` line).
- A6. Hero CTAs → one primary + one secondary; add a one-line proof strip under them.

**Tier B — the hero rebuild (the big move):**
- B1. Two-column above-the-fold. Left: outcome eyebrow + H1 + plain definition of "sociedad automatizada" + dual CTA ("Empezá gratis" + "Ver la documentación") + proof strip + early-access note. Right: a product surface — the live diagram, a "generated society card" (id, date, agent roster, green compliant badge), or `DemoTerminal`.
- B2. Add the "the agent does the work" line. Add a "Setup for your agent" path (MCP/llms.txt).
- B3. Optional interactive hero (Atlas-style): a "¿Qué hace tu sociedad?" input that begins the generator.

**Tier C — structure & depth:**
- C1. Make El Auditor the visual peak (distinct, larger, signed-log mini-visual; Vanta/Drata framing + "siempre listo para auditoría").
- C2. Proof bar section (npm downloads, GitHub stars, "ar-agents corre como su propia sociedad"); AR-native builder logo wall when available.
- C3. "Qué incluye" checklist hiding the AFIP/CUIT/registro plumbing; name the rails' real counterparties (Bitso etc.).
- C4. One elegant code snippet for the dev section; docs as a recipe gallery ("Emití una factura AFIP", "Pagá un proveedor en USDC", "Cerrá el mes").
- C5. RSC + client islands (perf) — bigger refactor, do carefully per Next-16 `AGENTS.md`.

**Voice caveat:** steal Stripe's *structure and proof discipline*, not its punctuation — keep copy short, plain, **no em dashes**, AR Spanish for product.
