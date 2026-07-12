# Day one: filing AR Agents Operaciones Sociedad Automatizada

ROADMAP.md M2-3. This is the runbook for the day the Argentine sociedad
automatizada regime (anteproyecto art. 14/102 of the draft Ley General de
Sociedades) is enacted. Goal: go from "law is live" to "filed" in hours, not
weeks, for the dogfood society, **AR Agents Operaciones Sociedad Automatizada**
(registry id `ar-agents-operaciones-sociedad-automatiz`), constituted through
ar-agents' own product (ROADMAP.md M0-8).

Everything in this directory is pre-staged from the existing Formation Pack
generator (`apps/landing/src/lib/formation-pack.ts`), so nothing here is
invented: it is the same deterministic renderer the product uses for every
constitution, run once against this society's real public data (see "Data
provenance" below). Every document still carries the pack's own
`BORRADOR NO VALIDADO` disclaimer and `validated: false`: a matriculated
escribano/abogado must review before anything is actually filed. That review
is one of the human steps below, not a formality to skip.

## Data provenance (what is public vs. placeholder)

Verified live against the public good-standing oracle on 2026-07-12
(`GET https://ar-agents.ar/api/registry/good-standing?id=ar-agents-operaciones-sociedad-automatiz`)
and the public registry list (`GET https://ar-agents.ar/api/registro`):

| Field | Value | Public? |
|---|---|---|
| `denominacion` | AR Agents Operaciones Sociedad Automatizada | yes, `record.name` |
| `id` | ar-agents-operaciones-sociedad-automatiz | yes, `record.id` |
| `jurisdiction` | AR | yes, `record.jurisdiction` |
| `operator` (representante) | Nazareno Clemente | yes, `record.operator` |
| `status` | forming | yes, `record.status` |
| `publicUrl` | "-" (none set) | yes, `record.publicUrl` |
| CUIT of the representante | not resolvable: `?cuit=<Naza's CUIT>` returns `found: false` | **NOT public** |
| `objeto`, `capitalSocial`, full sidecar | admin-gated (`GET /api/formation/pack` requires `REGISTRY_ADMIN_TOKEN`; the route's own comment says the sidecar carries the representante's self-declared name+CUIT, "so it is NOT public") | **NOT public, not fetched** |

Consequence: the CUIT, `objeto`, and `capitalSocial` in this staged pack are
placeholders, not the real filed values, because pulling the real ones would
mean reading admin-gated PII. The placeholder `objeto` describes what the
entity actually, publicly does (operates ar-agents.ar and the `@ar-agents/*`
packages); the placeholder `capitalSocial` (ARS 1) is the code's own
`SOCIEDAD-IA` minimum (`MIN_CAPITAL` in `apps/landing/src/lib/incorporate.ts`),
not a real integration amount. Both are marked "a confirmar" below. No real
CUIT, address, or other personal data was added beyond what the public oracle
already returns, per the repo's public-posture rule (this is a PUBLIC repo).

## Files in this pack

- `sidecar.json`: the machine-readable `FormationSidecar` (single source of
  truth; a content hash of this exact JSON is `pack-hash.txt`).
- `estatuto.txt`: draft bylaws (BORRADOR) for the escribano.
- `igj-guia.txt`: IGJ inscription guide with prefilled fields + the 5-step
  sequence.
- `afip-guia.txt`: AFIP/ARCA alta guide with prefilled fields.
- `checklist.json`: the same founder-facing checklist studio shows on
  constitution (`generateChecklist`), so this pack matches the product exactly.
- `pack-hash.txt`: SHA-256 of the canonical sidecar, the same hash the signed
  incorporation audit binds when a real (re-)run happens.

Regeneration: these files are generated, not hand-authored. To regenerate
after editing the placeholder input (e.g. once the founder confirms the real
objeto/capital), call `buildFormationPack` from
`apps/landing/src/lib/formation-pack.ts` with the updated `IncorporateInput`
and overwrite the four files above; do not hand-edit the drafts, since the
whole point of the sidecar/renderer split is that the drafts can never drift
from the machine record.

## The switch: exactly what flips, in what order

`NEXT_PUBLIC_LAW_STATUS` is a Next.js `NEXT_PUBLIC_*` var, inlined at build
time, so it takes one redeploy of `apps/landing` per environment. The full
consumer matrix and its drift guard live in
`apps/landing/src/app/law-status.ts` (COVERAGE comment) and
`apps/landing/test/law-status-switch.test.ts`. Steps:

1. Confirm the branch is on `main`, pulled fresh, in a clean worktree with
   `apps/landing` already linked to its Vercel project (see the repo's
   existing deploy docs for how that project is linked; do not create a new
   project).
2. Set the env var on Vercel (Production environment) and redeploy:
   ```bash
   cd apps/landing
   vercel env add NEXT_PUBLIC_LAW_STATUS production
   # value: live
   vercel --prod
   ```
3. Verify, do not assume:
   - `curl -s https://ar-agents.ar/ | grep -c "Registro abierto"` (or the EN
     string "Registration open") should find it; the anteproyecto banner
     string should be gone.
   - `curl -s https://ar-agents.ar/ley` should read "Estado: vigente." (or
     "Status: in force.").
   - Re-run `apps/landing/test/law-status-switch.test.ts` locally with
     `NEXT_PUBLIC_LAW_STATUS=live` to double check the pure-copy assertions
     still hold for the exact strings now live (they are the same strings;
     this is a sanity check, not a new behavior).
4. Nothing else on the site changes from this one env flip. That is the
   entire point of the drift guard: if a new file starts branching on
   `LAW_STATUS`/`lawIsLive` without a test, `pnpm test` fails in
   `apps/landing` before it ships.

This flip does NOT touch: `packages/core`'s `ar.ts` jurisdiction `status`
field, the coach corpus text, the `incorporate.ts`/`wizard.tsx` "not
sanctioned yet" warnings, or the `/api/jurisdictions` comparison table. Those
are separate, currently-unwired manual edits, listed under "Code gaps for
law-day" below.

## Filing sequence (organismo, form, order)

This is the real-world sequence a matriculated escribano/abogado executes,
using this pack's drafts as the starting point. Steps marked (agent) are
already automatable through `@ar-agents/igj` / `@ar-agents/identity` /
`@ar-agents/facturacion`; steps marked (manual, no gov API) are blocked on
Argentina not exposing a documented write API for that step today (see
`apps/landing/src/app/sociedades-ia/content.tsx`'s own 16/17 coverage table:
step 2, filed deed, and step 17, TAD escritura, are both "partial").

1. **IGJ, denomination reservation.** Verify no homonymy (agent: `@ar-agents/igj`
   reads the public CKAN dataset at datos.jus.gob.ar; the actual reservation
   filing is manual, no public write API).
2. **Escribano, otorgamiento del estatuto.** The escribano reviews
   `estatuto.txt`, incorporates the final objeto/capital/socios, and executes
   the deed (manual, this is the legal-review gate the whole pack is
   BORRADOR for).
3. **Capital integration.** Deposit and obtain the comprobante (manual,
   founder + bank).
4. **IGJ, inscription via TAD (Trámites a Distancia).** Submit the escritura +
   documentation (manual, no gov API for TAD escritura yet, tracked as RFC-001
   §3.4 / the repo's own "piece 17" gap). Before submitting, run the
   `validate_igj_inscription` tool (agent, exists today in `@ar-agents/igj`)
   to catch the ~30% mechanical-rejection class the guide already warns about.
5. **AFIP/ARCA, CUIT + alta.** Once IGJ-inscribed: obtain the CUIT, associate
   the `wsfe` (facturación electrónica) and `ws_sr_constancia_inscripcion`
   web services via Clave Fiscal > Administrador de Relaciones, generate the
   X.509 cert (agent-assisted: `@ar-agents/identity` verifies the padrón once
   issued; the ARCA-side association itself is manual, requires Clave Fiscal
   login).
6. **Tax regime.** Define monotributo vs. responsable inscripto with a
   contador (manual).
7. **Studio: deploy + credentials.** From ar-agents studio: one-click deploy
   of the society's agent app (already automated, M1-6), then load Mercado
   Pago / AFIP cert / WhatsApp credentials through the Credentials panel
   (already automated + validated, M3-1). No manual Vercel console work.
8. **Verify operation.** Confirm the deployed society's `/api/status` reads
   wired for the configured integrations and the agent can run one real task,
   the same proof M3-4 already did once for this exact society.

## Human steps, with owners

| Step | Owner | Notes |
|---|---|---|
| Flip `NEXT_PUBLIC_LAW_STATUS=live`, redeploy `apps/landing`, verify | Claude (agent) | Section above; a few minutes. |
| Confirm/finalize the real `objeto` and `capitalSocial`, regenerate the pack | Founder (Nazareno Clemente) | Placeholders in this pack are honest stand-ins, not the filed values. |
| Hire/confirm an escribano; review and sign the `estatuto.txt` draft (otorgamiento) | Founder | Legal-review gate; the pack is BORRADOR NO VALIDADO until this happens. |
| Integrate capital, get the comprobante | Founder | Bank step. |
| Submit the IGJ inscription via TAD | Founder (or escribano with poder) | No gov write API; genuinely manual today. |
| Run `validate_igj_inscription` before submitting | Claude (agent) | Existing tool, catches mechanical rejections. |
| Obtain CUIT, associate `wsfe` + `ws_sr_constancia_inscripcion` in ARCA Clave Fiscal | Founder | Needs the founder's own Clave Fiscal nivel 3 (already held). |
| Define tax regime (monotributo/RI) with a contador | Founder | |
| One-click deploy the society's agent app from studio | Founder (studio UI) or Claude if asked to drive it | Already automated (M1-6). |
| Load Mercado Pago / AFIP cert / WhatsApp credentials via studio's Credentials panel | Founder | Already automated + validated (M3-1); never paste secrets into chat or commit them. |
| Verify the deployed society operates (status + one real tool call) | Claude (agent) | Same proof shape as M3-4. |
| Flip `packages/core`'s `ar.ts` jurisdiction `status` to `"operational"`, version-bump, publish | Claude (agent) | See "code gaps" below; needs a changeset + the existing npm publish flow. |
| Update the coach corpus (`apps/studio/src/coach/corpus.ts` + `corpus/argentina.md`) to drop the hardcoded "LAW_STATUS=pre / simulación" framing | Claude (agent), founder reviews the copy | See "code gaps" below. |
| Fix `incorporate.ts`/`wizard.tsx`'s `sociedad_ia_pending_law` warning to check `lawIsLive` instead of always firing on `tipo === "SOCIEDAD-IA"` | Claude (agent) | See "code gaps" below; real code change, not attempted in this run. |
| Update `/api/jurisdictions` + `/jurisdicciones` editorial content (Argentina rows currently hardcoded `"proposal"`) and `registro/`, `precios/` (byte-identical pre vs live today) | Claude (agent), founder reviews | Content, not urgent for the filing itself, but part of "truly site-wide" per law-status.ts's own COVERAGE comment. |

## "A confirmar" (unknown/unverifiable facts, never fabricated)

| Item | Why unconfirmed | Source to check on law-day |
|---|---|---|
| IGJ inscription fee ("tasa retributiva de servicios") | Not in this repo; fee schedules change | igj.gob.ar tasas/aranceles page (Inspección General de Justicia) |
| TAD form number/availability for the sociedad automatizada inscription | The regime does not exist yet; no form can exist until it is enacted and IGJ publishes the procedure | tramitesadistancia.gob.ar + igj.gob.ar once the law is enacted |
| Minimum capital for a SAS/sociedad automatizada | The repo's `MIN_CAPITAL` constants (`apps/landing/src/lib/incorporate.ts`) are static numbers that may be stale; real minimums for some AR entity types are indexed to salario mínimo vigente | igj.gob.ar or a contador, as of the actual filing date |
| Escribano fee for otorgamiento | Varies by escribano; the repo's own `/api/jurisdictions` cost row ("~USD 200-500") is an editorial estimate, not a quote | Direct quote from the hired escribano |
| Representante's CUIT for the sidecar | Not public (verified above); the founder's real CUIT exists but entering it here would add PII beyond what the public registry shows | Founder fills in directly when regenerating the pack for actual filing, not committed to this public repo |

## Code gaps for law-day (found, not fixed in this run)

Per instructions, these are consumers whose LIVE behavior is unimplemented or
wrong; they are documented here and as ROADMAP follow-ups, not silently
patched:

1. **`sociedad_ia_pending_law` never checks the switch.** Both
   `apps/landing/src/lib/incorporate.ts`'s `validate()` and its client-side
   duplicate in `apps/landing/src/app/incorporar/wizard.tsx` emit a hardcoded
   "el régimen sociedad-IA aún no está sancionado" warning whenever
   `tipo === "SOCIEDAD-IA"`, unconditionally. `generateChecklist` in the same
   file has the identical hardcoded branch for its last checklist line. None
   of the three read `lawIsLive`. Left as-is: on law-day, minting a
   `SOCIEDAD-IA` entity (including re-running this pack's own generator)
   will keep warning "not sanctioned yet" and keep telling the founder the
   code runs under plain SAS, even after the law is live.
2. **The coach's background knowledge is hardcoded to pre-law.**
   `apps/studio/src/coach/corpus.ts` (compiled from `corpus/argentina.md`)
   states literally "LAW_STATUS=pre" and "cualquier constitucion en este
   producto es una simulacion" as fixed prose fed into the coach's system
   prompt every turn, not derived from the actual env var. On law-day the
   coach keeps telling users it is simulating even when it is not, unless
   this text is edited (or, better, made conditional).
3. **`packages/core/src/jurisdictions/ar.ts`'s `status: "proposal"` is a
   second, unwired switch.** It is metadata only (nothing in the repo reads
   `Jurisdiction.status` to gate behavior), but it is presented to API
   consumers of `createArJurisdiction` as the jurisdiction's enacted/proposal
   state and needs its own manual flip to `"operational"` plus a package
   version bump/publish, independent of `NEXT_PUBLIC_LAW_STATUS`.
4. **`/api/jurisdictions` (+ `/jurisdicciones`) and `registro`/`precios` are
   not wired to the switch at all**, confirmed still true as of this run
   (matches `law-status.ts`'s own long-standing COVERAGE comment). The
   jurisdictions comparison table hardcodes Argentina's row `status` per
   layer (several `"proposal"`) and needs manual editorial updates, not a
   code branch, since it is a static comparison table, not live-derived copy.

Follow-up ROADMAP item M2-4 tracks fixing gap 1 (the only one that is an
actual functional bug, not just editorial lag): see ROADMAP.md.

## Test coverage added this run

`apps/landing/test/law-status-switch.test.ts` (12 tests):
- `LAW_STATUS`/`lawIsLive` resolve correctly from `NEXT_PUBLIC_LAW_STATUS`
  (default to `pre` on anything but the exact string `"live"`).
- `homeLawCopy` and `leyEstado` (the two pure functions extracted from
  `page.tsx`/`ley/page.tsx` so their pre/live copy is unit-testable) return
  the exact pre vs. live strings in both languages.
- A drift guard that scans `apps/landing/src`, `apps/landing/test`,
  `apps/studio/src`, `apps/sociedad-ia-starter/src`, and `packages/core/src`
  for the identifiers `LAW_STATUS`/`lawIsLive` and asserts the matching file
  set is EXACTLY the `KNOWN_CONSUMERS` list (fails both ways: a new
  undocumented consumer, or a stale entry for a consumer that no longer
  references the switch).
