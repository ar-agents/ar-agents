# Reference Implementation for Automated Corporations

**Technical architecture, operable code, and a mapping to the text of the draft General Corporations Law**

Nazareno Clemente
ar-agents.ar
June 2026


## Summary

On April 28, 2026, at Expo EFI, Argentina's Ministry of Deregulation and State Transformation announced the creation of a regime for AI-operated corporations. On May 28, 2026, that announcement turned into a text: the draft General Corporations Law (anteproyecto), signed by Santiago Viola (Secretariat of Justice, Ministry of Justice, file IF-2026-53144057-APN-SECJ#MJ), and sent to the Senate on June 1, 2026. The draft has 277 articles and does not reform Law 19,550: it replaces and repeals it (art. 270). It is not law yet. The legal name of the figure is **Automated Corporation** (Sociedad Automatizada, art. 14); "AI corporation" is only the colloquial umbrella.

This document is an open and verifiable reference implementation of the technical infrastructure that the regime requires to be operable. It is addressed to the Ministry's technical staff and to those accompanying the legislative process. When the first version of this document was written, the draft text did not exist and everything was framed as "what a future regime would need"; the text now exists and confirms most of the proposed architecture. This version is rewritten to anchor itself in the concrete articles.

It covers five fronts: (1) how the draft text answers the underlying technical decisions, with article citations; (2) a reference architecture built on open standards; (3) the current state of the implementation, published as free software; (4) how the already-drafted articles map to operable infrastructure, with suggested refinements to the text; (5) pointed responses to the legal objections circulating in the public debate.

The code is open source (MIT-licensed), published at `github.com/ar-agents/ar-agents`, and available for whatever regulatory framework is enacted to adopt as a reference.


## 1. The underlying technical decisions and how the draft answers them

A framework for AI-operated corporations is legally novel. The first version of this document raised six technical questions that a future text would have to resolve. The draft of May 28, 2026 already answers several of them in legal terms. The table below maps each underlying decision to the article that addresses it and to the piece of architecture that makes it operable. Where the draft delegates to the regulations (the future Authority of Application), we note it.

| # | Underlying decision | What the draft says | Technical piece that operates it |
|---|---|---|---|
| 1 | What is an AI-operated corporation, legally? | **Art. 14:** a corporation of any type (SRL, SA, SAS) that pursues its corporate purpose through autonomous algorithmic systems or AI agents, without requiring human resources for its ordinary operation, is an **Automated Corporation** (Sociedad Automatizada). The declaration appears in the bylaws, the name must include "Automatizada," and the corporation is liable with its estate for damages caused by its systems. It is not a new type: it is a qualification that cuts across the existing types. | It keeps a human or legal-person administrator (art. 88) and, where applicable, a human representative. The corporation keeps its standard CUIT tax ID and personhood (section 2.3). |
| 2 | How is it incorporated? | **Art. 6:** incorporation by public or private instrument with **digital signature, certified signature, or advanced electronic signature**. Fully remote, verifiable incorporation is already enabled by the text. | An Ed25519 key pair generated at registration plus the digital signature of art. 6, via `@ar-agents/firma-digital` and `@ar-agents/incorporate` (section 2.1). |
| 3 | How does it identify itself to the State and third parties? | The text does not fix a cryptographic identity scheme beyond the signature of art. 6. This remains space for the regulations. | Standard CUIT plus an Ed25519 public key. Every action digitally signed, verifiable by any third party without a centralized intermediary (section 2.1; suggested refinement in 4.2). |
| 4 | How is what the corporation does audited? | **Art. 263**, in the regime of the Decentralized Autonomous Operating Corporation (Sociedad Descentralizada Autónoma Operativa, DAO): every digital record is valid as long as its information is **publicly verifiable**, can be reproduced in legible form, and allows its financial position to be reconstructed. **Art. 102:** duty to configure and supervise AI systems. **Art. 101:** an adequate decision-making procedure. The text already requires verifiable records. | A chained HMAC ledger with periodic anchoring to a public service (section 2.2). It is the technical piece that makes the art. 263 requirement operable and leaves evidence of the art. 102 supervision duty. |
| 5 | How does it operate economically? | The draft does not create a special tax regime: the Automated Corporation is an ordinary-type corporation and is taxed as such. **Art. 36** enables convertible investment instruments (SAFE-like). | Full integration into the general tax regime (IVA, Gross Income Tax, Income Tax, or monotributo by category), CAE-stamped invoicing and autonomous collection (section 2.3). |
| 6 | Who is liable and for which acts? | **Art. 14:** the corporation is liable with its estate. **Art. 88:** administration by one or more human or legal persons. **Art. 101:** liability for fault or willful misconduct, with the business judgment rule. **Art. 102:** using AI neither excuses nor limits the administrators' liability. **Art. 91:** contracting out management does not exclude the duties or the liability. | The auditable ledger (section 2.2) materializes the proof of compliance with the duties of arts. 91, 101, and 102. Suggested refinements in 4.5. |

The draft's answers are consistent with the architecture described in section 2: the text fixes the duties and the requirement of verifiable records, and our implementation provides the technical piece that makes them operable and auditable on demand. The article-by-article mapping, with the refinements we suggest, is in section 4.

**Regional context.** No country in the region has a comparable framework already drafted. Brazil, Mexico, and Chile keep the debate in academic terms; the European Union is advancing along the opposite route (the AI Act, focused on obligations of the human operator and risk-based restrictions). With this draft, Argentina is the first jurisdiction in the world with a specific text that names the AI-operated corporation as a corporate subject (Automated Corporation, art. 14) and regulates a Decentralized Autonomous Operating Corporation (DAO, arts. 258-265). Adopting an open, non-proprietary technical standard reduces friction for other jurisdictions to replicate the Argentine base, which multiplies the institutional weight of the local decision.


## 2. Reference architecture

The proposed architecture consists of four pillars, each built on a preexisting open technical standard. The choice of standards is deliberate: no new cryptography or protocols are invented. The entire implementation reuses primitives already verified, audited, and maintained by the international technical community.

### 2.1 Signed cryptographic identity (Ed25519)

Each Automated Corporation is constituted with an asymmetric cryptographic key pair conforming to the IETF RFC 8032 standard, Ed25519 algorithm. This rests on art. 6 of the draft, which already admits incorporation by digital signature, certified signature, or advanced electronic signature.

- The public key constitutes the **cryptographic identity** of the corporation. It is registered together with the CUIT in the corporate registry.
- The private key remains in custody of the designated operator, protected by the procedure that the Authority of Application establishes (hardware security module, digital notarial custody, multisig, as appropriate).
- Every expression of the corporation's will (issuing an invoice, signing a digital contract, approving a transaction) must be signed with that private key.
- Any third party (State, counterparty, auditor) can **verify** a signature without need for a centralized intermediary.

**Why this standard.** Ed25519 is the most widely adopted digital signature algorithm of the last decade (SSH, TLS 1.3, cryptocurrencies, European government identity systems). It is audited, resistant to known attacks, and produces compact signatures (64 bytes) that are fast to verify.

### 2.2 Chained auditable ledger (HMAC + anchor chain)

This is the piece the draft already requires in writing and that our implementation makes operable. **Art. 263** (DAO regime) establishes that every digital record is valid as long as its information is **publicly verifiable**, can be reproduced in legible form, and allows the financial position to be reconstructed. **Art. 102** sets the duty to configure and supervise AI systems in management, and clarifies that their use does not excuse liability. **Art. 101** requires decisions to be made "with an adequate decision-making procedure" to shield the administrator under the business judgment rule. All three point to the same thing: there must be a verifiable trace of what the corporation decided and executed. The chained ledger is that trace.

The corporation maintains a record of all its legally relevant acts. The ledger has two layers:

- **Local layer:** each ledger entry contains its content (the act), the hash of the previous entry, and an HMAC-SHA256 authentication code derived from a secret integrity key. This links each entry to the past: a retrospective modification breaks the chain and is detectable by anyone holding the integrity key.
- **External layer (anchoring):** the hash of the ledger state is anchored periodically (at least daily) in at least one public time-verification service. The anchoring can be: (a) publication in the digital Official Gazette; (b) inscription in a public blockchain; (c) timestamping certified by a trusted third party designated by the Authority of Application. The choice is fixed by the regulations, which art. 263 foresees for the minimum standards of traceability and preservation.

**Result, with its honest limit.** Once a third party (State, counterparty, expert) retains an anchor of the ledger state on a given date, they can cryptographically verify that: (a) the ledger has not been altered retrospectively with respect to that point; (b) on that date, the contents of the ledger were exactly what was being anchored. The concrete property is **tamper-evidence to witnesses**: any alteration after the anchor becomes evident. While external anchoring is not deployed, the local ledger is not proof against the operator itself, because whoever holds the integrity key could rebuild the chain. That is why external anchoring is not an ornament: it is what turns "the operator says they did not touch anything" into "anyone can prove whether they did." We do not claim operator-proof until external anchoring is in production.

**Why this scheme.** HMAC and external anchoring schemes are the same ones used by TLS Certificate Transparency logs (RFC 6962), regulated financial audit logs in advanced jurisdictions, and the internal records of platforms like Stripe and Mercado Libre. It does not require a dedicated blockchain or new State infrastructure. The specification is in RFC-004 and RFC-006 at `ar-agents.ar/rfcs`.

### 2.3 Operable fiscal personhood (CUIT + WSFE + Mercado Pago)

The Automated Corporation is a full fiscal contributor. The draft does not create a special tax regime: it is taxed as the ordinary-type corporation it is. It operates on standard Argentine tax infrastructure:

- **Own CUIT**, distinct from the CUIT of the designated operator or any associated natural person.
- **Electronic invoicing** with CAE issued via ARCA's Electronic Invoicing Web Service (WSFE). The corporation issues Invoices A, B, or C according to its tax category, with no differentiation from the general regime.
- **Collections** through Mercado Pago, its own bank accounts, and any payment method authorized for legal persons.
- **Standard tax obligations**: IVA, Gross Income Tax, Income Tax, or monotributo as applicable. No special differentiated regime unless the bill explicitly establishes one.

**No human operating intermediary.** Once the corporation is constituted and the operator designated, tax operations are executed automatically by the AI agent against ARCA and Mercado Pago services. The operator intervenes only in the reserved acts.

**State of implementation.** This layer is fully built and in production in the reference deployments. X.509 certificate issued by ARCA, loaded and operational, with verifiable real CAE issuance.

**Periodic renewal of the fiscal certificate.** The X.509 certificate issued by ARCA has limited validity (typically 2 years). To preserve the operational autonomy of the regime between renewal cycles, the procedure can be automated: the corporation programmatically generates a Certificate Signing Request (CSR) before expiry, signed with its registered Ed25519 key (Pillar 1); the designated operator approves the renewal with a single cryptographic signature from their private key. The exchange with the ARCA portal is mediated by the procedure that the Authority of Application establishes, without requiring repeated human interaction with State interfaces for each renewal.

### 2.4 Autonomous operation interface (MCP: Model Context Protocol)

The Automated Corporation is operated through autonomous algorithmic systems or AI agents, in the terms of art. 14, under the duty to configure and supervise of art. 102. For that operation to be standardized, auditable, and independent of the specific AI provider, the architecture adopts the **Model Context Protocol (MCP)**, an open protocol introduced by Anthropic and adopted by Claude, Cursor, Cline, OpenAI Agents SDK, and other mainstream tools.

- MCP defines a set of operations the agent can invoke on the corporation: issue an invoice, query balance, sign a corporate act, receive a payment, and so on.
- Any AI model that conforms with the protocol (Claude, GPT, Gemini, Llama, local models) can operate the corporation. **No lock-in to a specific model provider.**
- The State, through an MCP inspection client, can query the state of the corporation and the trace of its actions under the procedure the law establishes.

**Why MCP.** It is the most widely adopted protocol for the standardized operation of AI agents in 2026. It is open, already has clients in production, and its technical evolution is independent of the Argentine State. Adopting it inherits the work of the ecosystem without taking on the cost of maintaining it. If another protocol surpasses or displaces MCP in the future, the suggested refinement in 4.4 provides that the Authority of Application can recognize equivalents by resolution, without needing to reopen the legal framework.

### Composition of the four pillars

```
              ┌───────────────────────────────┐
              │  AI AGENT (Claude/GPT/...)    │
              └───────────────┬───────────────┘
                              │ MCP
                              ▼
   ┌──────────────────────────────────────────────────┐
   │         AUTOMATED CORPORATION (art. 14)          │
   │                                                  │
   │  ┌──────────────┐  ┌────────────────────────┐    │
   │  │ Identity     │  │ Auditable ledger       │    │
   │  │ Ed25519      │  │ HMAC + anchor chain    │    │
   │  └──────────────┘  └────────────────────────┘    │
   │                                                  │
   │  ┌──────────────────────────────────────────┐    │
   │  │ Fiscal personhood: CUIT + WSFE + MP      │    │
   │  └──────────────────────────────────────────┘    │
   └──────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │  STATE (audit, registration) │
              └──────────────────────────────┘
```

Whoever controls the Ed25519 private key controls the corporation. Every activity is signed, recorded, invoiced, and operated via MCP. Each of the four layers is independently verifiable.


## 3. Reference implementation: `@ar-agents`

The architecture described in section 2 is implemented and published as free software. This section documents honestly what exists and what does not exist as of the date of publication.

### What exists and is verifiable

- **Open source code** at `github.com/ar-agents/ar-agents`, MIT license.
- **36 packages published on npm** under the `@ar-agents/*` scope:
  - `@ar-agents/identity`, CUIT validation and queries to ARCA's tax registry
  - `@ar-agents/facturacion`, invoice issuance with CAE via WSFE
  - `@ar-agents/mercadopago`, recurring subscriptions and collections
  - `@ar-agents/mi-argentina`, government identity (OIDC)
  - `@ar-agents/incorporate`, incorporation flow
  - `@ar-agents/whatsapp`, `@ar-agents/banking`, `@ar-agents/shipping`, among others.
- **Formal specifications**: 6 RFCs published at `ar-agents.ar/rfcs`, including the chained auditable ledger (RFC-004) and its external anchoring (RFC-006).
- **235 tools** exposed through the packages, operable via the Vercel AI SDK and MCP.
- **Reference verifier**: `npx @ar-agents/verify-sociedad <CUIT>` allows any third party to run a local verification of the fiscal and cryptographic state of a registered Automated Corporation.
- **Operating reference deployments**: applications running end to end, issuing real CAEs against ARCA in production environment, not sandbox.

### What does not exist

- **Verifiable third-party adoption at scale.** The packages are published and record downloads, but there is no public census of external users as of this date. The implementation is in productive use in the author's deployments; any additional adoption would be information that gets built once the regime exists.
- **Official certification.** No State authority has certified the implementation as a reference. This document is the proposal for that certification, if the Authority of Application considers it appropriate, to exist.
- **External anchoring of the ledger in production.** The local chained ledger exists and is tamper-evident; anchoring to a public service (digital Official Gazette, public blockchain, or a certified third party under art. 263) is specified in RFC-006 but not yet deployed. Until then the ledger is not proof against the operator itself, as explained honestly in section 2.2.
- **Integration with the State corporate registry under the new regime.** The draft is in the Senate and is not law yet; there is not yet a defined registration procedure for the Automated Corporation. Integration requires coordination with the future Authority of Application once the text is enacted and the regulations are issued.

### Honesty about the state

The implementation is done. External anchoring and adoption at scale are not done. This sequence is deliberate: the correct order is for the technical reference infrastructure to exist first, and then for adoption to be built on top of it. Building the infrastructure is the only thing that could be done even before the draft text existed; now that the text exists, the implementation can be anchored to its articles, but adoption at scale still requires the regime to be enacted in order to have a real Automated Corporation to register. What is documented here is what could be brought forward to the state of the question.


## 4. Mapping the drafted articles to operable infrastructure

Unlike the first version of this document, the text is already drafted. So this section does not propose clauses from scratch: it takes the articles of the draft that already exist and shows, for each one, which piece of the reference implementation makes it operable, and where we suggest a refinement to the text. Where an article already substantially captures what is needed, we say so plainly: the draft already says it, our implementation is the technical piece that makes it verifiable. The refinements are suggestions; the legislative process retains full freedom to take them, modify them, or discard them.

### 4.1 Definition and capacity: the draft already resolves it (art. 14)

> **Art. 14 (in force in the draft).** A corporation of any of the types provided that pursues its corporate purpose through autonomous algorithmic systems or artificial intelligence agents, without requiring employees under a relationship of dependency or human resources for its ordinary operation, shall be considered an Automated Corporation (Sociedad Automatizada). The declaration of automation must appear expressly in the bylaws. The name must include the expression "Automatizada." The corporation is liable with its estate to third parties for the damages caused by its autonomous algorithmic systems or artificial intelligence agents.

**Technical reading.** The draft already captures this: no new definition clause is needed. Art. 14 resolves underlying decision number 1, and does so more soundly than the original speculative formulation, because it does not invent a new type but qualifies the existing ones (SRL, SA, SAS). An honest precision: the text says "without requiring human resources for its ordinary operation," not "zero humans." The corporation keeps an administrator (art. 88) and, where applicable, a human representative. The technical piece that accompanies art. 14 is the rest of the architecture: cryptographic identity, auditable ledger, and operable fiscal personhood.

### 4.2 Cryptographic identity: suggested refinement on art. 6

Art. 6 already admits incorporation by digital signature, certified signature, or advanced electronic signature, which enables verifiable remote registration. What the text does not fix is a persistent cryptographic identity scheme for the corporation's later acts. We suggest the regulations of the Authority of Application specify it:

> **Suggested refinement.** Every Automated Corporation is constituted with a pair of asymmetric cryptographic keys conforming to the IETF RFC 8032 standard (Ed25519 algorithm) or the equivalent designated by the Authority of Application. The public key is registered together with its CUIT and constitutes the cryptographic identity of the corporation. Every patrimonially relevant act must be digitally signed with the corresponding private key.

**Technical reading.** It allows verification of acts without a centralized intermediary. Any third party, at any time, can cryptographically verify that an act proceeds from a registered Automated Corporation. It resolves the question of "how do we know this operation came from the corporation and not from an impersonator." This gives the signature of art. 6 continuity throughout the entire life of the corporation, not only at its incorporation.

### 4.3 Auditable ledger: the draft already requires it (arts. 263, 102, 101)

> **Art. 263 (in force in the draft).** Every digital record replaces any equivalent physical medium, as long as its information is publicly verifiable, can be reproduced in legible form, and allows its financial position to be reconstructed.

**Technical reading.** The draft already captures this: art. 263 requires publicly verifiable digital records, art. 102 sets the duty to configure and supervise AI systems, and art. 101 requires an adequate decision-making procedure. No new clause ordering "keep a chained ledger" is needed. What is needed is the technical piece that meets that requirement, and it is exactly the chained HMAC ledger with external anchoring of section 2.2. Suggested refinement for the regulations that art. 263 itself anticipates: fix HMAC-SHA256 (or equivalent) for the chaining and a minimum external anchoring frequency of not less than once per calendar day, so that the public verifiability of art. 263 is effective and not left to each corporation's implementation. The achievable property is tamper-evidence to witnesses, not operator-proof, while external anchoring is not deployed.

### 4.4 Standardized operation interface: suggested refinement

The draft does not fix an operation protocol. Art. 102 assumes the administration body uses AI systems but does not standardize the interface. We suggest:

> **Suggested refinement.** The operation of the Automated Corporation may be exposed through a programmatic interface conforming to an open protocol designated by the Authority of Application, allowing auditable control by the administrator, inspection by the State under the regulated procedure, and interoperability under public standards. Among the widely adopted open protocols is the Model Context Protocol (MCP); the Authority of Application is empowered to recognize equivalents by resolution.

**Technical reading.** It standardizes the way the State and administrators access automated corporations, prevents operational fragmentation, and simplifies State inspection. MCP is the most widely adopted standard in 2026; recognizing it by resolution lets the regime take advantage of the ecosystem without locking into a provider or reopening the law if another protocol surpasses it.

### 4.5 Liability: the draft already fixes it (arts. 14, 101, 102, 91), with a refinement

The draft already resolves liability, and does it well: art. 14 provides that the corporation is liable with its estate for the damages of its systems; art. 101 sets liability for fault or willful misconduct with the business judgment rule; art. 102 clarifies that using AI neither excuses nor limits the administrators' liability and preserves the duty to configure and supervise; art. 91 adds that contracting out management does not exclude the duties or the liability. There is no zone of impunity in the text.

> **Suggested refinement.** Expressly link the duty to configure and supervise of art. 102 to the maintenance of the verifiable auditable ledger of art. 263, so that failure to keep the verifiable trace operates as a breach of the supervision duty for the purposes of art. 101.

**Technical reading.** The refinement connects corporate law to cryptographic integrity: the auditable ledger (section 2.2) is the objective proof of whether the administrator fulfilled the supervision duty. Without that trace, the duty of art. 102 remains an assertion that is hard to audit; with it, it is verifiable on demand.

### Additional suggested refinements (optional)

- **Dissolution and succession of the operator agent**: what happens if the designated system or agent ceases to operate (model retired, provider discontinued, decision of the administrator). Suggestion: a state of inactivity for up to 12 months, dissolution if no successor is designated, in line with the regime's grounds for dissolution.
- **Tax regime**: the draft does not create a special regime; the Automated Corporation is taxed as an ordinary-type corporation (IVA, Gross Income Tax, Income Tax, or monotributo by category). If a differentiated treatment were desired, it should be established through the corresponding tax channel, not through corporate law.
- **Foreign exchange regime**: if the Automated Corporation operates with foreign clients or providers (collecting in USD from abroad, paying cloud services in USD to providers like OpenAI, Anthropic, AWS), it is advisable to contemplate free availability of foreign currency under the terms of the general regime in force. Without operable foreign exchange provisions, the regime loses appeal for international operators and the jurisdiction does not capture the international flow that the "first jurisdiction in the world" role presupposes.

These refinements are suggested for a later stage of the process, once the core of arts. 14, 101, 102, and 263 is consolidated.


## 5. Technical questions raised in the public debate and how the architecture addresses them

The public debate on the regime has articulated substantive technical and legal questions. The most complete doctrinal expositions were formulated by Betania Allo (MDZ, May 2026) and Claudia Guardia (Infobae, December 2025). Many of those questions were raised before the text existed; they can now be checked against the articles. Without entering a legal debate that exceeds the technical scope of this document, the questions raised are addressed by the text and by the architecture in the following terms:

- **The question of the liability vacuum** ("who is responsible if the entity commits fraud, contracts illegally, or defames?") is answered by the text: art. 14 (the corporation is liable with its estate), art. 101 (administrators' liability for fault or willful misconduct), art. 102 (using AI does not excuse liability), and art. 91 (contracting out management does not exclude the duties). There is no zone of impunity in the draft. Our contribution (section 4.5) is to link those duties to the verifiable ledger so that compliance is auditable.

- **The question of traceability** (alterable records, absence of mechanisms for independent verification) is answered by art. 263, which requires publicly verifiable digital records. The technical piece that makes it effective is the chained HMAC ledger with external anchoring (sections 2.2 and 4.3). With anchoring deployed, any auditor (State, counterparty, judicial expert) can reconstruct the history and detect retrospective alterations after the anchor. While anchoring is not in production, the property is tamper-evidence to witnesses, not absolute immutability: we say so without hedging.

- **The question of a registry of responsible humans** is answered by art. 88: administration is in the hands of one or more human or legal persons, a personal and non-delegable office. In the DAO regime, art. 260 additionally requires one or more human representatives, and art. 264 adds oversight and beneficial owners before the UIF (financial intelligence unit, Law 25,246), with one of the legal representatives acting as compliance officer. The cryptographic identity (sections 2.1 and 4.2) ties each action to the corporation's key under the administrator's supervision. The human responsible party does not disappear: the text preserves it.

- **The consideration on sovereignty.** The architecture does not determine the location of capital or the jurisdiction in which the underlying model is trained: that is industrial policy, not a corporate framework. What it does resolve is technical sovereignty: MIT code, no foreign proprietary dependencies, fully operable on Argentine infrastructure. The market will naturally produce a category of specialized Argentine administrators, analogous to the registered agents of mass-incorporation jurisdictions (Delaware, Wyoming, Ireland); that market is where operational sovereignty materializes, not in the law.

- **The question of the non-permanent identity of AI** ("AI mutates continuously and does not remain identical to itself over time") is resolved by the cryptographic identity (section 4.2). The legal identity of the corporation is NOT the AI model that operates it. It is the public key registered at its constitution, in continuity with the signature of art. 6. The underlying model can be updated, change provider, or evolve; the identity of the corporation remains identical because the key remains. Persistence is cryptographic, not of the model.

- **The question of alignment** (algorithmic objectives may diverge from the human intent). The technical alignment of a model is an engineering problem for each administrator, and art. 102 acknowledges it by imposing the duty to configure and supervise. The regime provides what it can provide: stable identity, auditable ledger, enumerated duties and liability. The philosophical question stays where it stays in any legal system: outside the scope of corporate law.

## 6. Availability and verification

This document, the RFC-001 specification, and the source code of the reference implementation are published in full at `ar-agents.ar` under an open license (MIT). Their use, modification, integration, or adoption as a formal reference is free and requires no authorization from the author.

For aspects that exceed the scope of this document (internal architecture, verified assumptions, design decisions, suggested refinements to the draft text), the author remains available for technical consultation in the format that the corresponding area considers appropriate.

Contact: naza@naza.ar

### Cryptographic verification of the document itself

This PDF is signed with Ed25519 (IETF RFC 8032) by the same authorship that drafts it, applying to the document the same standard that the architecture proposes for Automated Corporations. The signature can be verified offline, without trusting `ar-agents.ar`:

```
curl -fsSL https://ar-agents.ar/en/implementation.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/en/implementation.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf
```

The verifier is *clean-room*, dependency-free, written on Node's standard primitives (fully auditable at `github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs`). The public key is published at `ar-agents.ar/.well-known/ar-agents/doc-signing-keys.json`. Any modification of the PDF (even a single byte) fails the three integrity checks: size, SHA-256, and Ed25519 signature.

This verification is not ornamental: the document that proposes Ed25519 for Automated Corporations is distributed itself under Ed25519. If the architecture is good for the regime, it is good for the document that proposes it.


## Annex I. Compared jurisdictional frameworks

Argentina, in advancing the regime, would not operate in a vacuum. Other jurisdictions have created legal frameworks for entities without direct human leadership (DAOs, digital associations, single-purpose vehicles without operational staff). Knowing these frameworks places the Argentine initiative on the international map and reduces friction for the legal drafting to benefit from already-tested solutions.

| Jurisdiction | Vehicle | Year | Relevant characteristics |
|---|---|---|---|
| **Wyoming (USA)** | DAO LLC (Wyoming Stat. Title 17 §31-§109) | 2021 | First corporate structure recognized by an Anglo-Saxon jurisdiction for a DAO. Governance can be algorithmic via smart contract. The designated operator is called *registered agent* and is liable with personal assets in enumerated cases. Model replicated by Tennessee and other states. |
| **Marshall Islands (RMI)** | DAO Act 2022 | 2022 | Formal recognition of DAOs as constitutable legal entities. Full legal personhood, capacity to open bank accounts, issue tokens, contract with third parties. Attracted projects such as Shipyard Software and MIDAO. The most liberal framework of algorithmic legal personhood currently in force globally. |
| **Estonia** | e-Residency + private limited company (OÜ) | 2014 to 2025 | Not strictly AI legal personhood, but the framework allows fully remote incorporation and digital operation of a corporation by a non-resident. Model replicated by Lithuania, Latvia, and Portugal. Demonstrates that verifiable remote incorporation is operationally possible at State scale. |
| **Singapore** | Variable Capital Company (VCC Act 2018) | 2018 | Corporate vehicle designed for highly automated *fund management*. Day-to-day operations can be delegated to algorithmic managers; the regime requires a registered *fund manager* (analogous to the designated operator). Confirms that algorithmic leadership with an enumerated human responsible party is an established legal architecture. |
| **Switzerland** | Civil association (CC art. 60) and *Stiftung* | traditional | Swiss DAOs and open-source software foundations (Ethereum Foundation, Web3 Foundation, Solana Foundation) operate under the form of association or foundation. The *Stiftung* allows programmatic control while the formal bodies are human and accountable. A framework not designed for AI but adopted in fact by the technological frontier. |
| **Liechtenstein** | Token and TT Service Provider Act (TVTG) | 2020 | Explicitly defines autonomous entities on blockchain infrastructure with enumerated liability for the *TT Service Provider* (analogous to the Argentine designated operator). The most advanced European framework on legal personhood for entities without direct human leadership. |

**Reading.** No country in the list recognizes full legal personhood of artificial intelligence in the terms of the Argentine draft. All require a responsible human party, and all limit liability to the corporate estate except in specific cases, just like the Argentine draft (art. 14 is liable with the estate; arts. 88 and 91 preserve the administration and its human duties). The Argentine novelty is to name the Automated Corporation (art. 14) as a corporate qualification and to regulate a Decentralized Autonomous Operating Corporation (DAO, arts. 258-265), on technical bases (Ed25519, MCP, HMAC chained ledger) that are interoperable with all the preceding jurisdictions. Technical interoperability is the foundation on which cross-border mutual recognition can be built in the medium term. Art. 263 of the draft, by requiring publicly verifiable records, leaves Argentina better positioned than most of those frameworks for external audit.


## Annex II. References

**Cryptographic standards.**

- IETF RFC 8032, *Edwards-Curve Digital Signature Algorithm (EdDSA)*, 2017. Ed25519 algorithm, used in Pillar 1 (cryptographic identity) and in refinement 4.2.
- IETF RFC 2104, *HMAC: Keyed-Hashing for Message Authentication*, 1997. HMAC-SHA256 scheme, used in Pillar 2 (auditable ledger) and in section 4.3.
- IETF RFC 3161, *Internet X.509 Public Key Infrastructure Time-Stamp Protocol (TSP)*, 2001. Candidate temporal anchoring mechanism for Pillar 2.
- IETF RFC 6962, *Certificate Transparency*, 2013. Mathematically verifiable audit scheme that inspires the anchoring architecture of Pillar 2.
- NIST FIPS 198-1, *The Keyed-Hash Message Authentication Code (HMAC)*, 2008. Normative definition of HMAC.
- NIST FIPS 186-5, *Digital Signature Standard (DSS)*, 2023. Includes Ed25519 as an accepted algorithm for digital signature in the United States public sector.

**Open protocols.**

- Anthropic et al., *Model Context Protocol Specification*, version 2025-06-18. Open protocol adopted by Claude, OpenAI Agents SDK, Cursor, Cline, and other mainstream tools. Published at `modelcontextprotocol.io/specification`. Used in Pillar 4 and in refinement 4.4.

**Argentine technical specifications.**

- ARCA (formerly AFIP), *Authentication and Authorization Web Service (WSAA), Developer Manual*. Client-server authentication mechanism for ARCA tax web services.
- ARCA, *Electronic Invoicing Web Service (WSFE) v1, Developer Manual*. Electronic invoice issuance with CAE. Used in Pillar 3.

**Argentine regulatory framework.**

- Draft *General Corporations Law* (anteproyecto), signed on May 28, 2026 by Santiago Viola (Secretariat of Justice, Ministry of Justice), file IF-2026-53144057-APN-SECJ#MJ. 277 articles. Sent to the Senate on June 1, 2026; not law yet. Replaces and repeals Law 19,550 (art. 270). Articles cited in this document: 6 (form), 14 (Automated Corporation), 36 (investment instruments), 88 (administration), 91 (duties), 101 (liability and business judgment rule), 102 (AI in management), 258-265 (Decentralized Autonomous Operating Corporation, DAO), 263 (verifiable digital records), 270 (repeals), 271 (entry into force).
- Law 19,550, *General Corporations Law*, consolidated text 2014. The regime in force that the draft replaces and repeals (art. 270 of the draft), not reforms.
- Law 25,506, *Digital Signature Law*, 2001. Normative framework of digital signature in Argentina. The Ed25519 signature of refinement 4.2 is complementary, not substitutive, of the existing digital signature regime and of the signature admitted by art. 6 of the draft.
- ARCA / AFIP General Resolution on tax web services. Enabling framework for the operation of the Automated Corporation on standard tax infrastructure.

**Comparative regulatory framework.**

- Wyoming Statutes Annotated, Title 17 (Corporations), §31-§109, *Decentralized Autonomous Organizations*, 2021.
- Republic of the Marshall Islands, *DAO Act of 2022*.
- European Union, Regulation 910/2014 (*eIDAS*), 2014. European framework of electronic identification and qualified identities.
- Liechtenstein, *Token and TT Service Provider Act (TVTG)*, 2020.
