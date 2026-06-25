import type { AttestAdapter } from "./base";
import { AttestAdapterError } from "../errors";
import { randomToken } from "./base";
import type { VerificationSubject } from "../types";

/**
 * Verifies identity via Magic.link's passwordless auth (DIDToken validation).
 *
 * Different from `EmailMagicLinkAdapter` (which sends a magic link via your
 * own SMTP/Resend). MagicLinkSdk delegates the entire verification flow to
 * Magic.link's hosted service:
 *
 * 1. Client-side: app renders Magic's Bricks / Login component.
 * 2. User completes auth (email OTP, SMS OTP, OAuth, WalletConnect).
 * 3. Magic returns a DIDToken to the client.
 * 4. Client posts DIDToken to your backend.
 * 5. Adapter validates server-side via @magic-sdk/admin.
 *
 * # Trust level
 *
 * **0.7** — same as Auth0. Passwordless control of email/phone via a real
 * provider with built-in anti-bot + crypto signature verification.
 *
 * # Why optional peer dep
 *
 * `@magic-sdk/admin` is an optional peer dep — install it ONLY if you wire
 * this adapter. Saves bundle size for users who don't use Magic.
 *
 * ```bash
 * pnpm add @magic-sdk/admin
 * ```
 */

export interface MagicLinkSdkAdapterOptions {
  /** Magic secret key (sk_live_... or sk_test_...). Required. */
  secretKey: string;
}

interface MagicAdmin {
  token: {
    validate: (token: string) => void; // throws on bad sig / expired
    getIssuer: (token: string) => string;
  };
  users: {
    getMetadataByToken: (token: string) => Promise<{
      issuer: string;
      email?: string | null;
      phoneNumber?: string | null;
      publicAddress?: string | null;
      oauthProvider?: string | null;
    }>;
  };
}

export class MagicLinkSdkAdapter implements AttestAdapter {
  readonly id = "magic_link_sdk";
  readonly trustLevel = 0.7;

  private readonly secretKey: string;
  private magicInstance: MagicAdmin | null = null;

  constructor(options: MagicLinkSdkAdapterOptions) {
    this.secretKey = options.secretKey;
  }

  /** Lazy-load `@magic-sdk/admin` so users without it don't pay cold-start cost. */
  private async getMagic(): Promise<MagicAdmin> {
    if (this.magicInstance) return this.magicInstance;
    let mod: { Magic: new (key: string) => MagicAdmin };
    try {
      mod = (await import("@magic-sdk/admin")) as never;
    } catch {
      throw new AttestAdapterError(
        this.id,
        "@magic-sdk/admin is not installed. Add it as an optional peer dep: `pnpm add @magic-sdk/admin`",
      );
    }
    this.magicInstance = new mod.Magic(this.secretKey);
    return this.magicInstance;
  }

  /**
   * No URL — Magic's flow is fully client-side rendered. The agent's UI
   * needs to render Magic's Login component and POST the resulting
   * DIDToken back to the agent's callback. We generate a random nonce as
   * the "secret" so the lib's expiry/attempt machinery still works.
   */
  generateSecret(): string {
    return randomToken(16);
  }

  buildVerificationUrl(): string | null {
    return null; // Magic is client-rendered; no hosted URL
  }

  async deliverChallenge(): Promise<void> {
    // No-op: agent's frontend handles delivery via Magic's components.
  }

  async verify(params: {
    submitted: { token?: string };
    subject: VerificationSubject;
  }): Promise<
    | {
        verified: true;
        claims?: Record<string, unknown>;
        verifiedSubject?: VerificationSubject;
      }
    | { verified: false; reason: string }
  > {
    const didToken = params.submitted.token;
    if (!didToken) {
      return { verified: false, reason: "Missing DIDToken (pass via submitted.token)" };
    }

    const magic = await this.getMagic();
    try {
      magic.token.validate(didToken);
    } catch (err) {
      return {
        verified: false,
        reason: `Magic DIDToken invalid: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let metadata: Awaited<ReturnType<MagicAdmin["users"]["getMetadataByToken"]>>;
    try {
      metadata = await magic.users.getMetadataByToken(didToken);
    } catch (err) {
      throw new AttestAdapterError(
        this.id,
        `Magic users.getMetadataByToken failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    return {
      verified: true,
      claims: {
        sub: metadata.issuer, // did:ethr:0x... — stable across sessions
        email: metadata.email ?? null,
        phone: metadata.phoneNumber ?? null,
        public_address: metadata.publicAddress ?? null,
        oauth_provider: metadata.oauthProvider ?? null,
      },
      // Bind to what the DIDToken's metadata actually proves, keyed to the
      // requested type. A valid token for the holder's OWN account can no longer
      // satisfy a request created for a different subject. Missing field → empty
      // value → fail-closed mismatch in the client.
      verifiedSubject: magicVerifiedSubject(params.subject.type, metadata),
    };
  }
}

/**
 * Build the subject a Magic.link DIDToken can authoritatively prove, keyed to
 * the requested subject type. Empty/absent → fail-closed mismatch.
 */
function magicVerifiedSubject(
  requestedType: VerificationSubject["type"],
  metadata: {
    issuer?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  },
): VerificationSubject {
  if (requestedType === "email") {
    return { type: "email", value: metadata.email ?? "" };
  }
  if (requestedType === "phone") {
    return { type: "phone", value: metadata.phoneNumber ?? "" };
  }
  if (requestedType === "oauth") {
    return { type: "oauth", value: metadata.issuer ?? "" };
  }
  // dni / cuit / custom — Magic metadata can't prove these; force a mismatch.
  return { type: requestedType, value: "" };
}
