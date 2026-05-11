/**
 * Recipe 29 — Publish your sociedad-IA's Ed25519 public key (RFC-005 § 4).
 *
 * # Pattern
 *
 * Real operators rotate keys, custody privates in secrets managers, and
 * publish public keys at /.well-known/sociedad-ia/keys. Recipe 29 is the
 * one-time bootstrap + the recurring rotation flow:
 *
 *   1. Generate an Ed25519 keypair locally (Web Crypto OR Node crypto).
 *   2. Convert public key → SPKI base64url (RFC-005 § 4 wire format).
 *   3. Print the public key JSON the operator can copy into
 *      apps/.../public/.well-known/sociedad-ia/keys.json.
 *   4. Print the private key as base64url PKCS8 — to paste into the
 *      operator's secrets manager (Vercel env `AUDIT_ED25519_PRIVATE_KEY`,
 *      1Password, AWS Secrets Manager, etc.). NEVER commit to a repo.
 *
 * The same keyId can stay valid indefinitely. Rotation is additive:
 * generate a new keypair, append to the published keys list with a
 * later validFrom + null validUntil. Set validUntil on the previous
 * key. Old entries signed with the rotated-out key remain verifiable
 * because the public key stays in the published list.
 *
 * # When to use
 *
 *   - First-time setup: right after deploying your sociedad-IA. Generate
 *     once, paste public key into your repo, paste private key into
 *     your secrets manager.
 *   - Scheduled rotation: at 6- or 12-month cadence.
 *   - Incident response: if you suspect the private key was compromised.
 *
 * # No Web app needed
 *
 * Recipe 29 is a pure CLI script. Outputs the JSON snippets the
 * operator pastes into their own infrastructure.
 *
 * # Edge / Node compatibility
 *
 * Web Crypto Ed25519 stable in Node 22+ and Vercel Edge. The script
 * uses Web Crypto throughout so it runs anywhere.
 */

declare const process: { argv: string[]; exit: (n: number) => void; stdout: { write: (s: string) => void } } | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface GeneratedKeypair {
  keyId: string;
  alg: "ed25519";
  /** base64url SPKI (DER-encoded SubjectPublicKeyInfo). */
  publicKey: string;
  /** Raw 32-byte Ed25519 point as hex. */
  publicKeyRaw: string;
  /** base64url PKCS8 (DER-encoded PrivateKeyInfo). DO NOT publish. */
  privateKey: string;
  validFrom: string;
  validUntil: null;
}

/**
 * Generate a fresh Ed25519 keypair + return both the public and private
 * parts in the wire formats RFC-005 § 4 expects.
 */
export async function generateKeypair(keyId: string): Promise<GeneratedKeypair> {
  const kp = await crypto.subtle.generateKey(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    true,
    ["sign", "verify"],
  );
  const pubSpki = await crypto.subtle.exportKey("spki", (kp as CryptoKeyPair).publicKey);
  const privPkcs8 = await crypto.subtle.exportKey("pkcs8", (kp as CryptoKeyPair).privateKey);
  const pubSpkiBytes = new Uint8Array(pubSpki);
  // SPKI for Ed25519 = 0x30 0x2a 0x30 0x05 0x06 0x03 0x2b 0x65 0x70 0x03 0x21 0x00 || 32-byte point
  const pubRaw = pubSpkiBytes.slice(-32);
  return {
    keyId,
    alg: "ed25519",
    publicKey: b64urlEncode(pubSpkiBytes),
    publicKeyRaw: hexEncode(pubRaw),
    privateKey: b64urlEncode(new Uint8Array(privPkcs8)),
    validFrom: new Date().toISOString(),
    validUntil: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatting
// ─────────────────────────────────────────────────────────────────────────────

interface PublishedKeysFile {
  $schema: string;
  spec: string;
  issuer: {
    jurisdiction: string;
    entityId: string;
    denominacion: string;
  };
  keys: Array<{
    keyId: string;
    alg: "ed25519";
    publicKey: string;
    publicKeyRaw: string;
    validFrom: string;
    validUntil: string | null;
  }>;
  note: string;
}

export function publishedKeysFromKeypair(
  kp: GeneratedKeypair,
  issuer: { jurisdiction: string; entityId: string; denominacion: string },
): PublishedKeysFile {
  return {
    $schema: "https://ar-agents.vercel.app/schemas/keys.v1.json",
    spec: "https://ar-agents.vercel.app/rfcs/005",
    issuer,
    keys: [
      {
        keyId: kp.keyId,
        alg: kp.alg,
        publicKey: kp.publicKey,
        publicKeyRaw: kp.publicKeyRaw,
        validFrom: kp.validFrom,
        validUntil: kp.validUntil,
      },
    ],
    note: "Ed25519 public key for this sociedad-IA's RFC-004/005 audit-log signatures. Private key custody lives in the operator's secrets manager.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: tsx 29-publish-your-keys.ts <keyId> [<cuit>] [<denominacion>]
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (typeof process === "undefined") return;
  const [, , keyIdArg, cuit, denominacionArg] = process.argv;
  const keyId = keyIdArg ?? `${defaultKeyIdPrefix()}-${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const jurisdiction = "AR";
  const entityId = cuit ? `ar-sociedad:${cuit}` : "ar-sociedad:replace-with-your-cuit";
  const denominacion = denominacionArg ?? "(replace with your sociedad's denominación)";

  const kp = await generateKeypair(keyId);
  const published = publishedKeysFromKeypair(kp, { jurisdiction, entityId, denominacion });

  const writeLn = (s: string) => process!.stdout.write(`${s}\n`);
  writeLn("# ════════════════════════════════════════════════════════════════════════");
  writeLn("# 1. Public key — drop this into:");
  writeLn(`#    apps/<your-sociedad-app>/public/.well-known/sociedad-ia/keys.json`);
  writeLn("# ════════════════════════════════════════════════════════════════════════");
  writeLn(JSON.stringify(published, null, 2));
  writeLn("");
  writeLn("# ════════════════════════════════════════════════════════════════════════");
  writeLn("# 2. Private key — paste into your operator's secrets manager:");
  writeLn("#    Vercel env var: AUDIT_ED25519_PRIVATE_KEY (recommended)");
  writeLn("#    DO NOT commit this to a repo. DO NOT publish.");
  writeLn("# ════════════════════════════════════════════════════════════════════════");
  writeLn(kp.privateKey);
  writeLn("");
  writeLn("# ════════════════════════════════════════════════════════════════════════");
  writeLn("# 3. Verify with curl:");
  writeLn("#    curl https://your-sociedad.example/.well-known/sociedad-ia/keys.json | jq .keys[0].publicKey");
  writeLn("#    Should match the publicKey field in section 1 above.");
  writeLn("# ════════════════════════════════════════════════════════════════════════");
}

function defaultKeyIdPrefix(): string {
  return "sociedad-ia-key";
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  });
}
