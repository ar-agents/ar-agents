import { z } from "zod";

// JSON Web Key (JWK) — RFC 7517. We support EC (ECDSA P-256 / P-384 / P-512)
// + RSA + OKP shapes that AP2's `cnf.jwk` may carry. ES256 (P-256) is the
// reference impl's default and the recommended algorithm.
//
// **Critical AP2 rule:** the inner `checkout_jwt` MUST use a non-deterministic
// signature scheme (ECDSA family). Ed25519 (OKP curve `Ed25519`) is FORBIDDEN
// for `checkout_jwt` because the protocol relies on signature entropy to
// defeat rainbow-table preimage attacks against `checkout_hash`. Ed25519 keys
// MAY appear in `cnf.jwk` for KB-JWT signing where rainbow attacks don't apply.

const Base64UrlString = z
  .string()
  .regex(/^[A-Za-z0-9_-]*$/, "must be base64url");

export const JwkEc = z.object({
  kty: z.literal("EC"),
  crv: z.enum(["P-256", "P-384", "P-521"]),
  x: Base64UrlString,
  y: Base64UrlString,
  d: Base64UrlString.optional(), // private key component
  alg: z.string().optional(),
  kid: z.string().optional(),
  use: z.enum(["sig", "enc"]).optional(),
  key_ops: z.array(z.string()).optional(),
});
export type JwkEc = z.infer<typeof JwkEc>;

export const JwkOkp = z.object({
  kty: z.literal("OKP"),
  crv: z.enum(["Ed25519", "Ed448"]),
  x: Base64UrlString,
  d: Base64UrlString.optional(),
  alg: z.string().optional(),
  kid: z.string().optional(),
  use: z.enum(["sig", "enc"]).optional(),
  key_ops: z.array(z.string()).optional(),
});
export type JwkOkp = z.infer<typeof JwkOkp>;

export const JwkRsa = z.object({
  kty: z.literal("RSA"),
  n: Base64UrlString,
  e: Base64UrlString,
  d: Base64UrlString.optional(),
  p: Base64UrlString.optional(),
  q: Base64UrlString.optional(),
  dp: Base64UrlString.optional(),
  dq: Base64UrlString.optional(),
  qi: Base64UrlString.optional(),
  alg: z.string().optional(),
  kid: z.string().optional(),
  use: z.enum(["sig", "enc"]).optional(),
  key_ops: z.array(z.string()).optional(),
});
export type JwkRsa = z.infer<typeof JwkRsa>;

export const Jwk = z.discriminatedUnion("kty", [JwkEc, JwkOkp, JwkRsa]);
export type Jwk = z.infer<typeof Jwk>;

// RFC 7800 — `cnf` (confirmation) claim. AP2 carries `cnf.jwk` to bind the
// next signer in a chain (Proof-of-Possession key).
export const Cnf = z.object({
  jwk: Jwk,
});
export type Cnf = z.infer<typeof Cnf>;
