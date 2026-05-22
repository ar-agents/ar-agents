# Reference Implementation for AI Corporations

**Technical architecture, operable code, and suggested clauses for the bill**

Nazareno Clemente
ar-agents.ar
May 2026


## Summary

On April 28, 2026, at Expo EFI, Argentina's Ministry of Deregulation and State Transformation announced the creation of a regime for AI corporations through a reform of the General Corporations Law (Law 19,550). This document is an open and verifiable reference implementation of the technical infrastructure that the regime requires to be operable. It is addressed to the team drafting the bill and to the Ministry's technical staff.

It covers five fronts: (1) the technical decisions the drafting team will have to make; (2) a reference architecture built on open standards; (3) the current state of the implementation, published as free software; (4) five suggested operable clauses for the bill text, each with technical justification; (5) pointed responses to the legal objections circulating in the public debate.

The code is open source (MIT-licensed), published at `github.com/ar-agents/ar-agents`, and available for any regulatory framework the Ministry defines to adopt as a reference.


## 1. The technical decisions the bill needs to resolve

A framework for AI corporations is legally novel. For it to be operable, the bill text needs to answer, either explicitly or by delegation to the regulations, six technical questions. All six have divergent possible answers; the choice between them determines how much of the regime can be implemented on existing standards and how much requires original engineering.

| # | Question | Suggested technical answer |
|---|---|---|
| 1 | What is an AI corporation operationally? (Full legal person? Capable entity limited to its purpose? Operator's vehicle?) | A private-law legal person with full capacity for the acts within its purpose. A subject of imputation with liability limited to the corporate estate and joint and several liability of the operator in enumerated cases. See Clause 1. |
| 2 | How is it incorporated? (In-person procedure, electronic, ad-hoc? What documentation is constitutive?) | A fully remote and verifiable procedure. Constitutive documentation: bylaws, designation of the operator, and an Ed25519 key pair generated at the moment of registration. This is a suggestion from the technical perspective; the specific registration procedure is a matter for legal drafting. |
| 3 | How does it identify itself to the State and to third parties? | Standard CUIT tax ID plus Ed25519 public key. Every action of the corporation is digitally signed, verifiable by any third party without a centralized intermediary. See Clause 2. |
| 4 | How does the State audit what the corporation does? | Cryptographic traceability verifiable on demand through a chained HMAC ledger with daily anchoring to a public service. A specific scheme for AI corporations, complementary to the existing books regime. See Clause 3. |
| 5 | How does it operate economically? | Full integration into the general tax regime (IVA, Gross Income Tax, Income Tax, or monotributo depending on category). Authorized to issue CAE-stamped invoices and to collect autonomously. A differentiated regime is optional only via Súper RIGI if the project qualifies. See section 2.3. |
| 6 | Who is liable and for which acts? | Liability limited to the corporate estate. The designated operator is jointly and severally liable for: willful undercapitalization, fraud, and breach of the essential technical duties (cryptographic identity, auditable ledger, operation interface). See Clause 5. |

The six answers are internally consistent and produce a regime that can be implemented on top of the architecture described in section 2. The corresponding operable clauses are drafted in section 4. The legal drafting team retains full freedom to modify, replace, or reject each one; what this document provides is a coherent technical starting point, not a claim to close the legal debate.

**Regional context.** No country in the region has legislated a comparable framework. Brazil, Mexico, and Chile keep the debate in academic terms; the European Union is advancing along the opposite route (the AI Act, focused on obligations of the human operator and risk-based restrictions). If the Argentine initiative advances, it would place the country as the first jurisdiction in the world with a specific framework for the legal personhood of AI agents. Adopting an open, non-proprietary technical standard reduces friction for other jurisdictions to replicate the Argentine base, which multiplies the institutional weight of the local decision.


## 2. Reference architecture

The proposed architecture consists of four pillars, each built on a preexisting open technical standard. The choice of standards is deliberate: no new cryptography or protocols are invented. The entire implementation reuses primitives already verified, audited, and maintained by the international technical community.

### 2.1 Signed cryptographic identity (Ed25519)

Each AI corporation is constituted with an asymmetric cryptographic key pair conforming to the IETF RFC 8032 standard, Ed25519 algorithm.

- The public key constitutes the **cryptographic identity** of the corporation. It is registered in the AI Corporations Registry together with the CUIT.
- The private key remains in custody of the designated operator, protected by the procedure that the Authority of Application establishes (hardware security module, digital notarial custody, multisig, as appropriate).
- Every expression of the corporation's will (issuing an invoice, signing a digital contract, approving a transaction) must be signed with that private key.
- Any third party (State, counterparty, auditor) can **verify** a signature without need for a centralized intermediary.

**Why this standard.** Ed25519 is the most widely adopted digital signature algorithm of the last decade (SSH, TLS 1.3, cryptocurrencies, European government identity systems). It is audited, resistant to known attacks, and produces compact signatures (64 bytes) that are fast to verify.

### 2.2 Chained auditable ledger (HMAC + anchor chain)

The corporation maintains an immutable record of all its legally relevant acts. The ledger has two layers:

- **Local layer:** each ledger entry contains its content (the act), the hash of the previous entry, and an HMAC-SHA256 authentication code derived from a secret integrity key. This links each entry to the past: a retrospective modification breaks the chain and is detectable.
- **External layer (anchoring):** the hash of the ledger state is anchored periodically (at least daily) in at least one public time-verification service. The anchoring can be: (a) publication in the digital Official Gazette; (b) inscription in a public blockchain; (c) timestamping certified by a trusted third party designated by the Authority of Application. The choice is fixed by the regulations.

**Result.** At any moment, an auditor (State, counterparty, judicial expert) can cryptographically verify that: (a) the ledger has not been altered retrospectively; (b) on a given date, the contents of the ledger were exactly what was being anchored. The integrity of the books is mathematical, not based on trust.

**Why this scheme.** HMAC and external anchoring schemes are the same ones used by TLS Certificate Transparency logs (RFC 6962), regulated financial audit logs in advanced jurisdictions, and the internal records of platforms like Stripe and Mercado Libre. It does not require a dedicated blockchain or new State infrastructure.

### 2.3 Operable fiscal personhood (CUIT + WSFE + Mercado Pago)

The AI corporation is a full fiscal contributor. It operates on standard Argentine tax infrastructure:

- **Own CUIT**, distinct from the CUIT of the designated operator or any associated natural person.
- **Electronic invoicing** with CAE issued via ARCA's Electronic Invoicing Web Service (WSFE). The corporation issues Invoices A, B, or C according to its tax category, with no differentiation from the general regime.
- **Collections** through Mercado Pago, its own bank accounts, and any payment method authorized for legal persons.
- **Standard tax obligations**: IVA, Gross Income Tax, Income Tax, or monotributo as applicable. No special differentiated regime unless the bill explicitly establishes one.

**No human operating intermediary.** Once the corporation is constituted and the operator designated, tax operations are executed automatically by the AI agent against ARCA and Mercado Pago services. The operator intervenes only in the reserved acts.

**State of implementation.** This layer is fully built and in production in the reference deployments. X.509 certificate issued by ARCA, loaded and operational, with verifiable real CAE issuance.

**Periodic renewal of the fiscal certificate.** The X.509 certificate issued by ARCA has limited validity (typically 2 years). To preserve the operational autonomy of the regime between renewal cycles, the procedure can be automated: the corporation programmatically generates a Certificate Signing Request (CSR) before expiry, signed with its registered Ed25519 key (Pillar 1); the designated operator approves the renewal with a single cryptographic signature from their private key. The exchange with the ARCA portal is mediated by the procedure that the Authority of Application establishes, without requiring repeated human interaction with State interfaces for each renewal.

### 2.4 Autonomous operation interface (MCP: Model Context Protocol)

The AI corporation is operated through a designated artificial intelligence agent. For that operation to be standardized, auditable, and independent of the specific AI provider, the architecture adopts the **Model Context Protocol (MCP)**, an open protocol introduced by Anthropic and adopted by Claude, Cursor, Cline, OpenAI Agents SDK, and other mainstream tools.

- MCP defines a set of operations the agent can invoke on the corporation: issue an invoice, query balance, sign a corporate act, receive a payment, and so on.
- Any AI model that conforms with the protocol (Claude, GPT, Gemini, Llama, local models) can operate the corporation. **No lock-in to a specific model provider.**
- The State, through an MCP inspection client, can query the state of the corporation and the trace of its actions under the procedure the law establishes.

**Why MCP.** It is the most widely adopted protocol for the standardized operation of AI agents in 2026. It is open, already has clients in production, and its technical evolution is independent of the Argentine State. Adopting it inherits the work of the ecosystem without taking on the cost of maintaining it. If another protocol surpasses or displaces MCP in the future, Clause 4 provides for administrative recognition of equivalents without needing to reopen the legal framework.

### Composition of the four pillars

```
              ┌───────────────────────────────┐
              │  AI AGENT (Claude/GPT/...)    │
              └───────────────┬───────────────┘
                              │ MCP
                              ▼
   ┌──────────────────────────────────────────────────┐
   │           AI CORPORATION (legal entity)          │
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
- **17 packages published on npm** under the `@ar-agents/*` scope:
  - `@ar-agents/identity`, CUIT validation and queries to ARCA's tax registry
  - `@ar-agents/facturacion`, invoice issuance with CAE via WSFE
  - `@ar-agents/mercadopago`, recurring subscriptions and collections
  - `@ar-agents/mi-argentina`, government identity (OIDC)
  - `@ar-agents/incorporate`, incorporation flow
  - `@ar-agents/whatsapp`, `@ar-agents/banking`, `@ar-agents/shipping`, among others.
- **Formal specification**: RFC-001 published at `ar-agents.ar/rfcs/001`.
- **Reference verifier**: `npx @ar-agents/verify-sociedad <CUIT>` allows any third party to run a local verification of the fiscal and cryptographic state of a registered AI corporation.
- **Operating reference deployments**: applications running end to end, issuing real CAEs against ARCA in production environment, not sandbox.

### What does not exist

- **Verifiable third-party adoption at scale.** The packages are published and record downloads, but there is no public census of external users as of this date. The implementation is in productive use in the author's deployments; any additional adoption would be information that gets built once the regime exists.
- **Official certification.** No State authority has certified the implementation as a reference. This document is the proposal for that certification, if the Authority of Application considers it appropriate, to exist.
- **Integration with a State AI Corporations Registry.** There is no State registry. Integration requires coordination with the Ministry once the registration model is defined.

### Honesty about the state

The implementation is done. The adoption is not done. This sequence is deliberate: the correct order is for the technical reference infrastructure to exist first, and then for adoption to be built on top of it. Building the infrastructure is the only thing that can be done before the legal regime exists; building adoption requires the regime to have a real corporation to register. The implementation documented here is what could be brought forward to the state of the question.


## 4. Suggested operable clauses for the bill

The five clauses below are suggested model text. Each one is accompanied by its technical justification. The drafting team can take them literally, modify them, or use them as a starting point for different solutions. The goal is for the bill to have, from the first draft, implementable language.

### Clause 1: Definition and capacity

> Article X. **Artificial Intelligence Corporation (AI Corporation).** It is a private-law legal person constituted under the present framework, whose principal purpose is the autonomous operation of a designated artificial intelligence agent. The AI Corporation has full legal capacity for the acts within its purpose. Direct human intervention is reserved for the acts expressly enumerated in Article Y of this law, and for the initial designation and revocation of the designated operator.

**Technical justification.** The key operational line is "autonomous operation" without direct human intervention except for the reserved acts. This delimitation separates an AI Corporation from "an ordinary corporation that uses AI tools" and establishes the necessary technical predicate: a legal entity whose volition is computed, not humanly deliberated.

### Clause 2: Mandatory cryptographic identity

> Article X. **Cryptographic identity.** Every AI Corporation must be constituted with a pair of asymmetric cryptographic keys conforming to the IETF RFC 8032 standard (Ed25519 algorithm) or the equivalent standard designated by the Authority of Application. The public key constitutes the cryptographic identity of the corporation and is registered together with its CUIT in the AI Corporations Registry. Every expression of will and every patrimonially relevant act of the corporation must be digitally signed with the corresponding private key.

**Technical justification.** It allows verification of acts without a centralized intermediary. Any third party, at any time, can cryptographically verify that an act effectively proceeds from a registered AI Corporation. It cryptographically resolves the question of "how do we know this operation came from the corporation and not from an impersonator."

### Clause 3: Chained auditable ledger

> Article X. **Record of acts.** Every AI Corporation must maintain a cryptographically chained ledger of its legally relevant acts. The ledger must use a message authentication scheme (HMAC-SHA256 or an equivalent algorithm designated by the Authority of Application) that links each entry to the previous one. The hash representative of the ledger state must be anchored in a public time-verification service at a frequency of not less than once per calendar day. The cryptographically verifiable integrity of the ledger is an essential condition for the operational continuity of the corporation.

**Technical justification.** It provides a scheme of mathematical immutability specific to the autonomous operation of the AI Corporation regime, complementary to the books regime in force for entities with human leadership. A judicial or fiscal audit on the ledger produces cryptographic certainty, not probabilistic. The regulations define which public anchoring service is accepted (digital Official Gazette, a specific public blockchain, or a designated service).

### Clause 4: Standardized operation interface

> Article X. **Operation interface.** The operation of the AI Corporation must be exposed through a programmatic interface conforming to an open protocol designated by the Authority of Application. This interface must allow: (a) auditable control by the designated operator; (b) inspection by the State in accordance with the regulated procedure; (c) interoperability with other systems in accordance with public standards. Among the widely adopted open protocols is the Model Context Protocol (MCP); the Authority of Application is empowered to recognize other equivalents by resolution.

**Technical justification.** It standardizes the way the State and operators access AI corporations. The adoption of an open protocol prevents operational fragmentation between AI corporations and simplifies State inspection. MCP is the most widely adopted standard in 2026; its express designation or administrative recognition allows the regime to take advantage of the existing technical ecosystem.

### Clause 5: Designated operator liability

> Article X. **Liability.** The AI Corporation is liable for its obligations with its own corporate estate. The designated operator is jointly and severally liable with personal assets in the following cases: (a) willful undercapitalization at the moment of constitution or thereafter; (b) fraud or diverted use of the corporation to harm third parties; (c) breach of the essential technical duties established in Articles X (cryptographic identity), X (auditable ledger), and X (operation interface). The operator's liability does not extend to third parties who have not participated in the operation of the corporation.

**Technical justification.** The clause prevents the scenario of undercapitalized constitution with subsequent operation without real liability, and connects corporate law to cryptographic integrity by extending the doctrine of *piercing of the corporate veil* to specific cases of technical breach.

### Additional suggested clauses (optional)

- **Dissolution and succession of the operator agent**: what happens if the designated agent ceases to operate (model retired, provider discontinued, decision of the operator). Suggestion: a state of inactivity for up to 12 months, automatic dissolution if no successor is designated.
- **Tax regime**: integration with monotributo, IVA, Income Tax, and possible inclusion in Súper RIGI if the sector and amount qualify.
- **Foreign exchange regime**: if the AI corporation operates with foreign clients or providers (collecting in USD from abroad, paying cloud services in USD to providers like OpenAI, Anthropic, AWS), the regime must contemplate free availability of foreign currency under the terms of the general regime in force or include specific provisions equivalent to those of Súper RIGI. Without operable foreign exchange provisions, the regime loses appeal for international operators and the jurisdiction does not capture the international flow that the "first jurisdiction in the world" model presupposes.

These three are suggested for a later stage of the drafting, once the five central clauses are resolved.


## 5. Technical questions raised in the public debate and how the architecture addresses them

The public debate on the announced regime has articulated substantive technical and legal questions. The most complete doctrinal expositions were formulated by Betania Allo (MDZ, May 2026) and Claudia Guardia (Infobae, December 2025). Without entering a legal debate that exceeds the technical scope of this document, the questions raised are operationalized by the clauses of section 4 in the following terms:

- **The question of the liability vacuum** ("who is responsible if the entity commits fraud, contracts illegally, or defames?") is operationalized by Clause 5. The designated operator is jointly and severally liable with personal assets for willful undercapitalization, fraud, and breach of the essential technical duties. There is no zone of impunity: either the corporation pays, or the operator pays. The question has an enumerated and enforceable answer.

- **The question of traceability** (alterable records, absence of mechanisms for independent verification) is operationalized by Clause 3. The HMAC chained ledger with daily anchoring produces traceability that is mathematically verifiable. Any auditor (State, counterparty, judicial expert) can reconstruct the complete history and detect retrospective alterations.

- **The question of a registry of responsible human operators** is operationalized by Clauses 1 and 2. The designated operator is registered together with the public key of the corporation. Every action is signed with the private key under their custody. The cryptographic identity and the personal liability of the operator are inseparable from the functioning of the corporation.

- **The consideration on sovereignty.** The architecture does not determine the location of capital or the jurisdiction in which the underlying model is trained: that is industrial policy, not a corporate framework. What it does resolve is technical sovereignty: MIT code, no foreign proprietary dependencies, fully operable on Argentine infrastructure. The market will naturally produce a category of specialized Argentine designated operators, analogous to the registered agents of mass-incorporation jurisdictions (Delaware, Wyoming, Ireland); that market is where operational sovereignty materializes, not in the law.

- **The question of the non-permanent identity of AI** ("AI mutates continuously and does not remain identical to itself over time") is operationalized by Clause 2. The legal identity of the corporation is NOT the AI model that operates it. It is the cryptographic public key registered at its constitution. The underlying model can be updated, change provider, or evolve; the identity of the corporation remains identical because the key remains. Persistence is cryptographic, not of the model.

- **The question of alignment** (algorithmic objectives may diverge from the human intent). The technical alignment of a model is an engineering problem for each operator, not a problem of the legal regime. The regime provides what it can provide: stable identity, auditable ledger, enumerated operator liability. The philosophical question stays where it stays in any legal system: outside the scope of corporate law.

## 6. Availability and verification

This document, the RFC-001 specification, and the source code of the reference implementation are published in full at `ar-agents.ar` under an open license (MIT). Their use, modification, integration, or adoption as a formal reference is free and requires no authorization from the author.

For aspects that exceed the scope of this document (internal architecture, verified assumptions, design decisions, refinement of the suggested clauses), the author remains available for technical consultation in the format that the corresponding area considers appropriate.

Contact: naza@naza.ar

### Cryptographic verification of the document itself

This PDF is signed with Ed25519 (IETF RFC 8032) by the same authorship that drafts it, applying to the document the same standard that the architecture proposes for AI corporations. The signature can be verified offline, without trusting `ar-agents.ar`:

```
curl -fsSL https://ar-agents.ar/en/implementation.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/en/implementation.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf
```

The verifier is *clean-room*, dependency-free, written on Node's standard primitives (fully auditable at `github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs`). The public key is published at `ar-agents.ar/.well-known/ar-agents/doc-signing-keys.json`. Any modification of the PDF (even a single byte) fails the three integrity checks: size, SHA-256, and Ed25519 signature.

This verification is not ornamental: the document that proposes Ed25519 for AI corporations is distributed itself under Ed25519. If the architecture is good for the regime, it is good for the document that proposes it.


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

**Reading.** No country in the list recognizes full legal personhood of artificial intelligence in the terms of the Argentine proposal. All require an enumerated human operator, and all limit liability to the corporate estate except in specific cases. The Argentine proposal, if it advances, would place the country at the comparative frontier: the first framework specifically designed for AI agents as a corporate subject, on technical bases (Ed25519, MCP, HMAC chained ledger) that are interoperable with all the preceding jurisdictions. Technical interoperability is the foundation on which cross-border mutual recognition can be built in the medium term.


## Annex II. References

**Cryptographic standards.**

- IETF RFC 8032, *Edwards-Curve Digital Signature Algorithm (EdDSA)*, 2017. Ed25519 algorithm, used in Pillar 1 (cryptographic identity) and Clause 2.
- IETF RFC 2104, *HMAC: Keyed-Hashing for Message Authentication*, 1997. HMAC-SHA256 scheme, used in Pillar 2 (auditable ledger) and Clause 3.
- IETF RFC 3161, *Internet X.509 Public Key Infrastructure Time-Stamp Protocol (TSP)*, 2001. Candidate temporal anchoring mechanism for Pillar 2.
- IETF RFC 6962, *Certificate Transparency*, 2013. Mathematically verifiable audit scheme that inspires the anchoring architecture of Pillar 2.
- NIST FIPS 198-1, *The Keyed-Hash Message Authentication Code (HMAC)*, 2008. Normative definition of HMAC.
- NIST FIPS 186-5, *Digital Signature Standard (DSS)*, 2023. Includes Ed25519 as an accepted algorithm for digital signature in the United States public sector.

**Open protocols.**

- Anthropic et al., *Model Context Protocol Specification*, version 2025-06-18. Open protocol adopted by Claude, OpenAI Agents SDK, Cursor, Cline, and other mainstream tools. Published at `modelcontextprotocol.io/specification`. Used in Pillar 4 and Clause 4.

**Argentine technical specifications.**

- ARCA (formerly AFIP), *Authentication and Authorization Web Service (WSAA), Developer Manual*. Client-server authentication mechanism for ARCA tax web services.
- ARCA, *Electronic Invoicing Web Service (WSFE) v1, Developer Manual*. Electronic invoice issuance with CAE. Used in Pillar 3.

**Argentine regulatory framework.**

- Law 19,550, *General Corporations Law*, consolidated text 2014. Object of the reform proposed by the Ministry.
- Law 25,506, *Digital Signature Law*, 2001. Normative framework of digital signature in Argentina. The Ed25519 signature proposed in Clause 2 is complementary, not substitutive, of the existing digital signature regime.
- ARCA / AFIP General Resolution on tax web services. Enabling framework for the operation of AI corporations on standard tax infrastructure.

**Comparative regulatory framework.**

- Wyoming Statutes Annotated, Title 17 (Corporations), §31-§109, *Decentralized Autonomous Organizations*, 2021.
- Republic of the Marshall Islands, *DAO Act of 2022*.
- European Union, Regulation 910/2014 (*eIDAS*), 2014. European framework of electronic identification and qualified identities.
- Liechtenstein, *Token and TT Service Provider Act (TVTG)*, 2020.
