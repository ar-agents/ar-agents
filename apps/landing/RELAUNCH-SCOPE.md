# ar-agents site relaunch — structure scope

Status: **IA / structure proposal. Copy deferred** (Naza does a copy pass later, per his style notes — short, plain, no em dashes, AR Spanish for product / English for dev).
Date: 2026-06-26.
Owner decision locked: positioning **B (action-led, law-ready)**.

## 1. The promise (the one thing the site is about)

> When the law passes, a person **or an agent** can **register** their autonomous company — or **create** a new one from scratch — end-to-end, on ar-agents.

Everything orients around that single action: **create / register an autonomous company (sociedad autónoma) in Argentina, run by AI, on ar-agents.**

- The open-source toolkit = the free rails it runs on (payments, identity, invoicing, banking, off-ramp).
- El Auditor = the paid trust layer that keeps the human legally covered (art. 102).
- The law = context (why now), not the lede.

We are building the site for the **law-ready end-state**, with one honest switch for the interim (section 2).

## 2. The law-timing switch (build once, flip once)

Single source of truth: `LAW_STATUS: 'pre' | 'live'` (env var or one constant, read site-wide).

| Surface | `pre` (today) | `live` (law passed) |
|---|---|---|
| Hero primary CTA | "Preparate / sumate a la lista" → waitlist + generate-your-repo preview | "Registrá tu sociedad" / "Creá tu sociedad" → real flow |
| Status banner | "El anteproyecto está en el Senado. Cuando sea ley, registrás en 1 clic." | hidden, or "Ley N.º … vigente." |
| `/incorporar` wizard | generates the repo/config + legal checklist, marks registration as "pendiente de ley" | completes real registration |
| `/registro` | "sociedades en preparación" + waitlist count | live public registry |
| Pricing | El Auditor live; incorporation "disponible cuando pase la ley" | all live |

This keeps the deployed site **sincere now** and **instant-on** at law-day. No second build.

## 3. New information architecture

**Primary CTA (button, in nav + hero):** `Crear sociedad` (pre-law label: `Empezar`).

**Top nav (5 + CTA + language toggle):**
`Cómo funciona` · `Demo` · `Precios` · `Docs` · `La ley`

- Kill the entire `/en/*` route tree. The ES/EN `LangProvider` toggle already exists — use it. (~15 pages removed.)
- Footer holds everything secondary (press, changelog, status, legal, registry, citations).

### Page tiers (target ~20–25 pages, down from ~79)

**TIER 1 — main path (rework):**
- `/` — focused product home (section 4)
- `/como-funciona` — the journey: crear → operar (rails) → El Auditor lo prueba (absorbs `sociedades-ia`)
- `/incorporar` — the create/register flow (primary CTA target; gated by `LAW_STATUS`)
- `/precios` — pricing (El Auditor live; Cloud waitlist; incorporation law-gated)
- `/demo` — live agent (today `/play`)
- `/auditor` — El Auditor product page; entry to the working tools
- `/registro` — public registry of autonomous companies (social proof; prominent post-law)

**TIER 2 — consolidated hubs:**
- `/docs` — single developer + agent hub. Absorbs `sdk`, `getting-started`, `examples`, `codegen`, `glossary`, `operator-quickstart`, `templates`, `playbook`. Keep `/reference` as a machine-readable index (SEO + agent discovery) linked from here.
- `/docs/arquitectura` + `/docs/seguridad` — the trust deep-dives (`architecture/*`, `security`, `test-vectors`, `audit-log`).
- `/ley` — one law/context page. Absorbs `manifiesto` (vision), `legislacion` + `implementacion` (merge — the synthesis), `jurisdicciones` (credibility). RFCs live at `/ley/spec` (001–004 normative; 005–006 marked advanced). `cite` = a tool at the bottom of `/ley`.
- Product tools grouped under `/auditor`: `verify`, `certifier`, `dashboard`, `dashboard/[id]`, `audit-explorer/[id]`.

**TIER 3 — footer / press / meta (keep, off main nav):**
`press-kit`, `highlights`, `timeline`, `notes` + `notes/*`, `data-room`, `video`, `status`, `changelog`, `privacy`.

**TIER 4 — cut or hard-merge:**
- All `/en/*` (×15) → language toggle.
- `/es/playbook` + `/playbook` → one (toggle). `/reference` + `/refs` → one.
- `/vs` + `/vs-on-chain` → one `/comparacion`, or cut `vs-on-chain` (on-chain rival positioning is advocacy).
- `/eve` → a `/docs` example, or cut (eve-framework launch content).
- `/al-ministro`, `/gobierno`, `/economia-del-regimen` → demote to `/ley/gobierno` sub-pages or archive (government-facing, time-bound).
- `/co-firmar` + `/en/co-sign` → a footer "contribuir" link or cut from main.
- `/share`, `/embed` → footer/press utilities.

## 4. Homepage structure (sections only — copy later)

1. **Hero** — the promise (create/register an autonomous company, run by AI, on ar-agents) + `LAW_STATUS` badge + primary CTA (`Crear sociedad` / `Empezar`) + secondary (`Ver demo`).
2. **How it works, 3 steps** — Creá → Opera sobre las rieles abiertas → El Auditor lo prueba.
3. **Proof it's real** — live demo, "nos constituimos a nosotros mismos" (`caso-ar-agents`), registry count.
4. **The rails** — the open-source toolkit, condensed to a few tiles → link to `/docs`. (Not the current 16-package wall.)
5. **El Auditor** — the paid trust layer (art. 102 defense) → `/precios`.
6. **The law** — status + what it enables → `/ley`.
7. **For developers & agents** — build on it; agents can register too → `/docs`.
8. **Footer** — the tier-3 links.

Replaces the current ~1,500-line single-file homepage (manifesto + open-core + MercadoPago SDK deep-dive + comparison + quickstart + FAQ all in one).

## 5. Build sequencing

- **P1.** Remove `/en/*`; route all language switching through the existing toggle. (Fast, high-impact.)
- **P2.** Add `LAW_STATUS` flag + status banner + CTA state machine.
- **P3.** Consolidate `/docs` (merge the dev pages; keep `/reference` as machine index).
- **P4.** Consolidate `/ley` (merge advocacy + spec; demote government pages).
- **P5.** Rewrite `/` + nav around the promise.
- **P6.** Group product tools under `/auditor`; move meta to footer.
- **P7.** Copy pass (Naza's notes).

## Appendix: full route disposition

Source audit: 4 parallel readers over all ~79 routes (2026-06-26). Dispositions above are derived from it. Notable facts:
- Only **El Auditor ($199/mo)** is a live paid product today; Cloud tiers are waitlist; incorporation is law-gated.
- The dev pages are fragmented but individually good — the fix is one human `/docs` hub over them, while preserving machine surfaces (`llms.txt`, `/reference`, `/.well-known`) for SEO/agent discovery.
- The policy cluster is ~40% of nav weight; its essential core is `legislacion` + RFC-001..004 + `cite`. The rest is advocacy → demote.
