// Multi-hop dSD-JWT chains for AP2 v0.2 delegated mandates.
//
// AP2 v0.2 §B.1 specifies a delegated SD-JWT (dSD-JWT) wire format where each
// "hop" is a full SD-JWT presentation chunk (own `~`-separated disclosures
// + own KB-JWT terminator), and chunks are joined with the canonical
// chain separator `~~`:
//
//     <root chunk>~~<KB-SD-JWT hop 1>~~ ... ~~<terminal KB-SD-JWT hop>
//
// The root chunk is a normal SD-JWT signed by the original issuer (e.g. the
// Trusted Agent Provider). Each subsequent hop is a Key Binding SD-JWT
// signed by the previous hop's `cnf.jwk` (RFC 7800 PoP). The terminal hop
// carries the closed mandate inside its `delegate_payload`.
//
// Verifier walk (per spec §C):
//   1. Parse the chain.
//   2. Verify hop[0] (root) with the trusted root issuer key.
//   3. Resolve disclosures, extract `delegate_payload[0]` = open mandate
//      (or chained `cnf.jwk` for delegate-only hops).
//   4. Compute `sd_hash` of hop[0]'s presentation.
//   5. For each subsequent hop[i]:
//        - Verify signature with hop[i-1]'s `cnf.jwk` PoP key.
//        - Validate `header.typ` ∈ `kb+sd-jwt` (terminal) or `kb+sd-jwt+kb`
//          (intermediate).
//        - Validate `sd_hash` claim equals the previous hop's `sd_hash`.
//        - On terminal: validate `aud`, `nonce`.
//        - Resolve disclosures, extract `delegate_payload[0]`.
//   6. The terminal hop's `delegate_payload[0]` is the closed mandate.
//      All non-terminal hops carry open mandates whose constraints MUST
//      be evaluated against the closed mandate.
//
// We use the term "chunk" for the wire-level segment between `~~`s, and
// "hop" for the parsed-and-verified result. They're 1:1.

import {
  importPublicJwk,
  verifyCompactJws,
  type JoseCryptoKey,
  type JWTPayload,
  type JWTHeaderParameters,
  type VerifyOptions as CryptoVerifyOptions,
} from "./crypto";
import {
  parseSdJwt,
  serializeSdJwt,
  computeSdHash,
  resolveDisclosures,
  SdJwtError,
  type ParsedSdJwt,
} from "./sd-jwt";
import {
  ClosedCheckoutMandate,
  OpenCheckoutMandate,
  type ClosedCheckoutMandate as TClosedCheckoutMandate,
  type OpenCheckoutMandate as TOpenCheckoutMandate,
} from "./schemas/checkout-mandate";
import {
  ClosedPaymentMandate,
  OpenPaymentMandate,
  type ClosedPaymentMandate as TClosedPaymentMandate,
  type OpenPaymentMandate as TOpenPaymentMandate,
} from "./schemas/payment-mandate";
import { Jwk, type Jwk as TJwk, type Cnf } from "./schemas/jwk";

// ---------------------------------------------------------------------------
// Constants + type aliases
// ---------------------------------------------------------------------------

/** Wire-level separator between hops. */
export const CHAIN_SEPARATOR = "~~";

const TERMINAL_TYP = ["kb+sd-jwt", "kb-sd-jwt"] as const;
const INTERMEDIATE_TYP = ["kb+sd-jwt+kb", "kb-sd-jwt+kb"] as const;

export type AnyOpenMandate = TOpenCheckoutMandate | TOpenPaymentMandate;
export type AnyClosedMandate = TClosedCheckoutMandate | TClosedPaymentMandate;

// ---------------------------------------------------------------------------
// Parsed chain shape
// ---------------------------------------------------------------------------

export interface DsdJwtChain {
  /** Original compact serialization. */
  presentation: string;
  /**
   * Parsed hops in order — `hops[0]` is the root issuer SD-JWT, the last
   * element is the terminal KB-SD-JWT carrying the closed mandate.
   */
  hops: ParsedSdJwt[];
}

/**
 * Parse a dSD-JWT chain into its constituent hops. Each hop's KB-JWT (if
 * present) ends up in `hops[i].kbJwt` per the underlying single-hop parser.
 *
 * NOTE: AP2 chains use `~~` between SD-JWTs, where each chunk independently
 * uses `~` for disclosures. We split on the literal `~~` substring; this
 * is unambiguous because a single hop's wire format ends in EITHER a
 * KB-JWT or a single trailing `~`, never two — and `<jws>~~<jws>` is
 * always a chain boundary.
 */
export function parseDsdJwtChain(presentation: string): DsdJwtChain {
  if (!presentation.includes(CHAIN_SEPARATOR)) {
    // Single-hop chain (degenerate case — equivalent to a regular SD-JWT).
    return { presentation, hops: [parseSdJwt(presentation)] };
  }
  const rawChunks = presentation.split(CHAIN_SEPARATOR);
  const hops: ParsedSdJwt[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let chunk = rawChunks[i];
    if (chunk === undefined || chunk.length === 0) {
      throw new SdJwtError(
        `dSD-JWT chain hop ${i} is empty (split on '${CHAIN_SEPARATOR}' produced an empty chunk)`,
      );
    }
    // Each chunk on the wire is an SD-JWT presentation. RFC 9901 requires a
    // trailing `~` on standalone SD-JWTs; when chunks are joined with the
    // chain separator `~~`, that yields three tildes between hops. After
    // splitting on `~~`, every non-first chunk starts with an extra `~`
    // (the trailing tilde from the previous chunk's standalone form).
    // Strip a single leading `~` to make `parseSdJwt` happy.
    if (i > 0 && chunk.startsWith("~")) {
      chunk = chunk.slice(1);
    }
    // Ensure the chunk ends with the RFC 9901 trailing `~` UNLESS its last
    // segment is a KB-JWT (3-part `header.payload.signature`). Chunks that
    // were chain-joined typically lack the trailing tilde because it was
    // consumed by the `~~` separator on the next chunk.
    if (!chunk.endsWith("~")) {
      const segments = chunk.split("~");
      const last = segments[segments.length - 1] ?? "";
      const lastIsJws = last.split(".").length === 3;
      if (!lastIsJws) {
        chunk = `${chunk}~`;
      }
    }
    try {
      hops.push(parseSdJwt(chunk));
    } catch (err) {
      throw new SdJwtError(
        `Failed to parse hop ${i}: ${(err as Error).message}`,
      );
    }
  }
  return { presentation, hops };
}

/** Serialize a parsed chain back to compact form. */
export function serializeDsdJwtChain(chain: DsdJwtChain): string {
  return chain.hops.map(serializeSdJwt).join(CHAIN_SEPARATOR);
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

export interface ChainVerifyOptions {
  /** Trusted issuer key for the root hop (hop[0]). */
  rootIssuerKey: TJwk | JoseCryptoKey;
  /** Algorithm of root issuer key. Default ES256. */
  rootIssuerAlg?: string;
  /** Algorithms accepted on hop signatures. Default `[ES256, ES384, ES512, RS256, EdDSA]`. */
  hopAlgs?: string[];
  /** Audience the terminal hop binds to. */
  expectedAudience: string;
  /** Verifier-issued nonce — must equal terminal hop's `nonce`. */
  expectedNonce: string;
  /** Optional `iss` constraint on the root JWS. */
  expectedRootIssuer?: string;
  /** Clock tolerance for `iat` / `exp`. Default 30s. */
  clockTolerance?: number;
  /** Override "now" for tests. */
  currentDate?: Date;
}

export interface ChainHopVerification {
  /** Position in the chain (0 = root). */
  index: number;
  /** Decoded protected header. */
  header: JWTHeaderParameters;
  /** Decoded full JWS payload. */
  payload: JWTPayload;
  /**
   * Resolved `delegate_payload` items — the things this hop is "delegating".
   * For an open-mandate hop: a single open-mandate object.
   * For an intermediate cnf-binding-only hop: a single object with `cnf.jwk`.
   * For the terminal hop: the closed mandate.
   */
  delegatePayload: unknown[];
  /** sd_hash of this hop's presentation. */
  sdHash: string;
  /** PoP key for the next hop, when this hop is not terminal. */
  nextCnfJwk: TJwk | undefined;
  /** True if this hop's typ is `kb+sd-jwt` (terminal-only hop). */
  isTerminal: boolean;
  /** True if this hop's typ is `kb+sd-jwt+kb` (intermediate hop). */
  isIntermediate: boolean;
}

export type ChainVerificationOutcome =
  | {
      ok: true;
      hops: ChainHopVerification[];
      /** Open mandates extracted from non-terminal hops. */
      openMandates: AnyOpenMandate[];
      /** Closed mandate from the terminal hop. */
      closedMandate: AnyClosedMandate;
      /** sd_hash of the terminal hop — receipt `reference`. */
      terminalSdHash: string;
    }
  | {
      ok: false;
      hops: ChainHopVerification[];
      code: "invalid_credential" | "invalid_mandate" | "unresolved_constraint";
      reason: string;
    };

export async function verifyDsdJwtChain(
  presentation: string,
  options: ChainVerifyOptions,
): Promise<ChainVerificationOutcome> {
  const hopAlgs = options.hopAlgs ?? ["ES256", "ES384", "ES512", "RS256", "EdDSA"];

  let chain: DsdJwtChain;
  try {
    chain = parseDsdJwtChain(presentation);
  } catch (err) {
    return failure([], "invalid_credential", (err as Error).message);
  }
  if (chain.hops.length === 0) {
    return failure([], "invalid_credential", "Chain has no hops");
  }

  const verifications: ChainHopVerification[] = [];
  let currentVerifyKey = await resolveKey(
    options.rootIssuerKey,
    options.rootIssuerAlg ?? "ES256",
  );
  let prevSdHash: string | undefined;

  for (let i = 0; i < chain.hops.length; i++) {
    const hop = chain.hops[i]!;
    const isLast = i === chain.hops.length - 1;
    const isRoot = i === 0;

    // 1. Verify issuer JWS signature.
    const verifyOpts: CryptoVerifyOptions = {
      algorithms: hopAlgs,
      ...(options.clockTolerance !== undefined
        ? { clockTolerance: options.clockTolerance }
        : {}),
      ...(options.currentDate !== undefined
        ? { currentDate: options.currentDate }
        : {}),
      ...(isRoot && options.expectedRootIssuer !== undefined
        ? { issuer: options.expectedRootIssuer }
        : {}),
    };
    let issuerResult;
    try {
      issuerResult = await verifyCompactJws(hop.issuerJwt, currentVerifyKey, verifyOpts);
    } catch (err) {
      return failure(
        verifications,
        "invalid_credential",
        `Hop ${i} signature verification failed: ${(err as Error).message}`,
      );
    }
    const header = issuerResult.protectedHeader;
    const payload = issuerResult.payload;

    // 2. Validate hop typ for chained delegation:
    //   - Root hop is normal SD-JWT (any typ; commonly `example+sd-jwt` or `dc+sd-jwt`)
    //   - Intermediate hops MUST use `kb+sd-jwt+kb` (carry forward cnf)
    //   - Terminal hop MUST use `kb+sd-jwt`
    if (!isRoot) {
      const typ = header.typ;
      const expected: readonly string[] = isLast ? TERMINAL_TYP : INTERMEDIATE_TYP;
      if (typeof typ !== "string" || !expected.includes(typ)) {
        return failure(
          verifications,
          "invalid_credential",
          `Hop ${i} has typ='${typ}', expected one of [${expected.join(", ")}]`,
        );
      }
    }

    // 3. Validate sd_hash chain (each non-root hop's payload.sd_hash must
    //    equal the previous hop's computed sd_hash).
    if (!isRoot) {
      const claimed = (payload as { sd_hash?: unknown }).sd_hash;
      if (typeof claimed !== "string") {
        return failure(
          verifications,
          "invalid_credential",
          `Hop ${i} is missing sd_hash claim`,
        );
      }
      if (claimed !== prevSdHash) {
        return failure(
          verifications,
          "invalid_credential",
          `Hop ${i} sd_hash mismatch: claimed='${claimed}', expected='${prevSdHash}'`,
        );
      }
    }

    // 4. On terminal hop, validate aud + nonce.
    if (isLast && !isRoot) {
      const aud = (payload as { aud?: unknown }).aud;
      if (aud !== options.expectedAudience) {
        return failure(
          verifications,
          "invalid_credential",
          `Terminal hop aud mismatch: payload='${String(aud)}', expected='${options.expectedAudience}'`,
        );
      }
      const nonce = (payload as { nonce?: unknown }).nonce;
      if (nonce !== options.expectedNonce) {
        return failure(
          verifications,
          "invalid_credential",
          `Terminal hop nonce mismatch`,
        );
      }
    }

    // 5. Resolve disclosures into the issuer payload.
    let resolved: Record<string, unknown>;
    try {
      resolved = await resolveDisclosures(
        payload as Record<string, unknown>,
        hop.disclosures,
      );
    } catch (err) {
      return failure(
        verifications,
        "invalid_credential",
        `Hop ${i} disclosure resolution failed: ${(err as Error).message}`,
      );
    }

    // 6. Extract delegate_payload (canonical AP2 structure).
    const delegatePayload = resolved["delegate_payload"];
    if (!Array.isArray(delegatePayload) || delegatePayload.length === 0) {
      return failure(
        verifications,
        "invalid_credential",
        `Hop ${i} has no delegate_payload (or it's not an array)`,
      );
    }

    // 7. Compute this hop's sd_hash for the next iteration.
    const sdHash = await computeSdHash({
      issuerJwt: hop.issuerJwt,
      disclosures: hop.disclosures,
    });

    // 8. Extract cnf.jwk for next hop, if not terminal.
    let nextCnfJwk: TJwk | undefined;
    if (!isLast) {
      const item = delegatePayload[0] as { cnf?: Cnf } | null;
      const cnfJwk = item?.cnf?.jwk;
      if (!cnfJwk) {
        return failure(
          verifications,
          "invalid_credential",
          `Hop ${i} delegate_payload[0] has no cnf.jwk for next hop`,
        );
      }
      // Validate the JWK shape.
      const validated = Jwk.safeParse(cnfJwk);
      if (!validated.success) {
        return failure(
          verifications,
          "invalid_credential",
          `Hop ${i} cnf.jwk is invalid: ${validated.error.issues[0]?.message ?? "unknown"}`,
        );
      }
      nextCnfJwk = validated.data;
      try {
        currentVerifyKey = await importPublicJwk(validated.data, "ES256");
      } catch (err) {
        return failure(
          verifications,
          "invalid_credential",
          `Failed to import hop ${i} cnf.jwk: ${(err as Error).message}`,
        );
      }
    }

    verifications.push({
      index: i,
      header,
      payload,
      delegatePayload,
      sdHash,
      nextCnfJwk,
      isTerminal: isLast && !isRoot,
      isIntermediate: !isRoot && !isLast,
    });

    prevSdHash = sdHash;
  }

  // Extract open mandates from non-terminal hops + closed mandate from terminal.
  const openMandates: AnyOpenMandate[] = [];
  let closedMandate: AnyClosedMandate | undefined;
  for (let i = 0; i < verifications.length; i++) {
    const v = verifications[i]!;
    const item = v.delegatePayload[0];
    if (i === verifications.length - 1) {
      // Terminal: closed mandate.
      const c1 = ClosedCheckoutMandate.safeParse(item);
      if (c1.success) {
        closedMandate = c1.data;
        continue;
      }
      const c2 = ClosedPaymentMandate.safeParse(item);
      if (c2.success) {
        closedMandate = c2.data;
        continue;
      }
      return failure(
        verifications,
        "invalid_credential",
        `Terminal hop delegate_payload[0] is not a known closed mandate type`,
      );
    } else {
      // Non-terminal: open mandate (or pure cnf-binding hop, which is also OK).
      const o1 = OpenCheckoutMandate.safeParse(item);
      if (o1.success) {
        openMandates.push(o1.data);
        continue;
      }
      const o2 = OpenPaymentMandate.safeParse(item);
      if (o2.success) {
        openMandates.push(o2.data);
        continue;
      }
      // Pure cnf-binding hop — no mandate to extract, just key delegation.
      // This is allowed in the spec for relay/forwarding hops.
    }
  }

  if (!closedMandate) {
    return failure(
      verifications,
      "invalid_credential",
      "No closed mandate extracted from terminal hop",
    );
  }

  return {
    ok: true,
    hops: verifications,
    openMandates,
    closedMandate,
    terminalSdHash: verifications[verifications.length - 1]!.sdHash,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveKey(
  keyOrJwk: TJwk | JoseCryptoKey,
  alg: string,
): Promise<JoseCryptoKey> {
  if ("kty" in keyOrJwk) return importPublicJwk(keyOrJwk, alg);
  return keyOrJwk;
}

function failure(
  hops: ChainHopVerification[],
  code: "invalid_credential" | "invalid_mandate" | "unresolved_constraint",
  reason: string,
): ChainVerificationOutcome {
  return { ok: false, hops, code, reason };
}
