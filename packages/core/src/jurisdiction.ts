// The jurisdiction seam.
//
// Why this exists: @ar-agents started AR-first, but the architecture is
// global-first (CAPTURE-TRANSFORMATION.md:22, 124-126). An autonomous company
// is "in good standing" in some jurisdiction; it settles fiat in some currency
// through some rail; it owes tax under some rule; and a registry-of-record
// vouches for it. Today all of that is hardcoded to Argentina. These four pure
// interfaces — Jurisdiction / FiatRail / Registry / TaxRule — name the seam so
// AR becomes jurisdiction #1 (in ./jurisdictions/ar) rather than the only one,
// WITHOUT pulling any runtime dependency into core: the host injects the real
// IGJ lookup and the treasury off-ramp. Pure types + pure helpers only.

/** ISO 3166-1 alpha-2 country code, optionally with a subdivision (ISO 3166-2). AR is jurisdiction #1, not the only one. */
export type CountryCode = string; // "AR", "US", "EE", "MH", "SG"
/** ISO 3166-2 subdivision code — an optional refinement of a country. */
export type SubdivisionCode = string; // "US-WY", "AR-C" — optional refinement
/** ISO 4217 currency code the jurisdiction settles fiat in. */
export type CurrencyCode = string; // "ARS", "USD", "EUR"

/** A legal jurisdiction in which an autonomous company can be in good standing. The composition root that ties a Registry, its FiatRail(s) and TaxRule(s) together. */
export interface Jurisdiction {
  /** ISO 3166-1 alpha-2. */
  readonly country: CountryCode;
  /** Optional subdivision (e.g. "US-WY" Wyoming, "AR-C" CABA). */
  readonly subdivision?: SubdivisionCode | undefined;
  /** Human label, e.g. "Argentina", "Wyoming DAO LLC". */
  readonly name: string;
  /** Default settlement currency. Rails (FiatRail.currency) and tax (TaxOwed.currency) carry their own; this is only the jurisdiction's primary. */
  readonly defaultCurrency: CurrencyCode;
  /** The registry-of-record for good-standing in this jurisdiction. */
  readonly registry: Registry;
  /** Fiat off/on-ramps available here (first = preferred). May be empty pre-integration. */
  readonly fiatRails: ReadonlyArray<FiatRail>;
  /** Tax rules that apply to an entity's acts here. */
  readonly taxRules: ReadonlyArray<TaxRule>;
  /** Whether this jurisdiction's autonomous-company regime is enacted law or proposed. Drives the LAW_STATUS pre/live switch on the site. */
  readonly status: "operational" | "proposal";
}

/** A fiat settlement rail (off-ramp / on-ramp), jurisdiction-agnostic generalization of treasury's OffRampAdapter. Crypto<->fiat. Async, idempotent, gateable. */
export interface FiatRail {
  /** Stable id, e.g. "manteca", "bitso", "bridge-us". */
  readonly id: string;
  /** Country this rail settles into. */
  readonly country: CountryCode;
  /** Fiat currency this rail pays out. */
  readonly currency: CurrencyCode;
  /** Direction(s) supported. */
  readonly direction: "off-ramp" | "on-ramp" | "both";
  /** Quote a crypto->fiat (or fiat->crypto) conversion. No side effects. amount in the SOURCE asset's minor-agnostic units. */
  quote(input: { amount: number; fromAsset: string; toAsset: string }): Promise<FiatRailQuote>;
  /**
   * Execute the conversion + payout. IRREVERSIBLE: callers MUST gate behind the art.102 approval (enforceRiskPolicy / toolApprovalFromRisk).
   * externalId is a REQUIRED idempotency key (same key on retry => same receipt, never double-spend).
   */
  settle(input: {
    amount: number;
    fromAsset: string;
    toAsset: string;
    externalId: string;
  }): Promise<FiatRailReceipt>;
  /** Poll async settlement. Optional (in-memory rails settle instantly). */
  getStatus?(txId: string): Promise<FiatRailStatusReport>;
}
export interface FiatRailQuote {
  amount: number;
  out: number;
  rate: number;
  spread: number;
}
export interface FiatRailReceipt {
  amount: number;
  received: number;
  rate: number;
  txId: string;
  depositAddress?: string | undefined;
}
export type FiatRailStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN";
export interface FiatRailStatusReport {
  txId: string;
  status: FiatRailStatus;
  settled?: number | undefined;
  raw?: string | undefined;
}

/** The registry-of-record / good-standing ORACLE for a jurisdiction. The moat surface: trust-minimized, publicly verifiable (no ar-agents key required to verify). Sprint 2 makes the AR impl writable+queryable; this interface is the contract counterparties consult. */
export interface Registry {
  /** Stable id, e.g. "ar-igj", "us-wy-sos". */
  readonly id: string;
  readonly country: CountryCode;
  /** Human label, e.g. "IGJ (Argentina)". */
  readonly name: string;
  /** Look up a company's good-standing by its registry id. Read-only; what a bank/marketplace/agent-framework calls before transacting (the demand side, CAPTURE-TRANSFORMATION.md:66-73). Returns null if unknown. */
  lookup(entityId: string): Promise<GoodStandingRecord | null>;
  /** Verify a signed attestation WITHOUT trusting any ar-agents private key, by checking the public anchor (transparency log / L2 / OpenTimestamps). A conformant impl MUST set trustMinimized:true ONLY when the verdict was reached solely via the PublicAnchor, never via an operator-held key (thesis #2). */
  verifyAttestation(attestation: GoodStandingAttestation): Promise<AttestationVerification>;
}
export interface GoodStandingRecord {
  /** Registry-native entity id. */
  readonly entityId: string;
  readonly jurisdiction: CountryCode;
  /** Legal name on record. */
  readonly name: string;
  /** Current standing. "suspended" = good-standing administratively paused by the registry (in AR, the art.102 kill-switch state). */
  readonly status: "good-standing" | "suspended" | "revoked" | "unknown";
  /** ISO-8601 of last status change. */
  readonly asOf: string;
}
export interface GoodStandingAttestation {
  readonly record: GoodStandingRecord;
  /** Signature of convenience (NOT the root of trust per thesis #2). */
  readonly signature?: string | undefined;
  /** Public anchor proving the record was committed at a point in time without trusting our key (e.g. OpenTimestamps proof, L2 tx hash, CT entry). */
  readonly anchor?: PublicAnchor | undefined;
}
export interface PublicAnchor {
  readonly type: "opentimestamps" | "l2-tx" | "ct-log" | string;
  readonly proof: string;
  readonly anchoredAt?: string | undefined;
}
export interface AttestationVerification {
  readonly valid: boolean;
  /** True ONLY if `valid` was established without any operator-held key, i.e. solely from the PublicAnchor. A black-box (key-only) verdict MUST set this false. */
  readonly trustMinimized: boolean;
  readonly reason?: string | undefined;
}

/** A tax/fiscal rule for a jurisdiction: a PURE calculator of what is owed. Jurisdiction-neutral by design — it carries NO risk taxonomy, so a non-AR jurisdiction is never forced into Argentina's art.102 vocabulary. Each jurisdiction maps its own filings onto its own approval regime; AR refines this as `ArTaxRule` (with a RiskLevel) in ./jurisdictions/ar. Generalizes AR's cedular/monotributo/IIBB so non-AR jurisdictions slot in. */
export interface TaxRule {
  /** Stable id, e.g. "ar-cedular", "ar-monotributo", "us-wy-annual". */
  readonly id: string;
  readonly country: CountryCode;
  /** Human label. */
  readonly label: string;
  /** Pure calculator: tax owed for a taxable event. No side effects. */
  computeOwed(event: TaxableEvent): TaxOwed;
}
export interface TaxableEvent {
  readonly kind: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly meta?: Record<string, unknown> | undefined;
}
export interface TaxOwed {
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly ruleId: string;
}

/** Registry of installed jurisdictions, keyed by CountryCode (+optional subdivision). Pure, no I/O. Lets a host resolve "AR" -> the AR Jurisdiction, and later "US-WY" etc. */
export interface JurisdictionRegistry {
  get(country: CountryCode, subdivision?: SubdivisionCode): Jurisdiction | undefined;
  list(): ReadonlyArray<Jurisdiction>;
}

/** Build a pure {@link JurisdictionRegistry}. No I/O. Each jurisdiction is keyed by `${country}` and, when it has a subdivision, ALSO by `${country}/${subdivision}` so callers can resolve either granularity. */
export function createJurisdictionRegistry(
  jurisdictions: ReadonlyArray<Jurisdiction>,
): JurisdictionRegistry {
  const byKey = new Map<string, Jurisdiction>();
  for (const j of jurisdictions) {
    byKey.set(j.country, j);
    if (j.subdivision !== undefined) {
      byKey.set(`${j.country}/${j.subdivision}`, j);
    }
  }
  return {
    get(country: CountryCode, subdivision?: SubdivisionCode): Jurisdiction | undefined {
      if (subdivision !== undefined) {
        // noUncheckedIndexedAccess: Map.get already returns `T | undefined`;
        // prefer the more specific key, fall back to the country-level one.
        return byKey.get(`${country}/${subdivision}`) ?? byKey.get(country);
      }
      return byKey.get(country);
    },
    list(): ReadonlyArray<Jurisdiction> {
      return jurisdictions;
    },
  };
}
