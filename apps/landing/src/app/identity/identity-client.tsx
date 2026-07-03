"use client";

/**
 * /identity, the self-serve "verify your agent" UI.
 *
 * Two modes, both one step for the adopter:
 *   - Hosted: paste your origin. We fetch /.well-known/agents.json + verify.
 *   - Sign it: fill a short form, get the exact statement to sign, sign with
 *     your own key, paste the signature back.
 *
 * On success: a public profile URL, an embeddable badge, and a listing in the
 * open discovery format. We never hold a key. Copy is English (global agent
 * devs), plain, no em dashes.
 */

import { useState } from "react";
import Link from "next/link";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Scheme = "evm-secp256k1" | "ed25519";
type Mode = "hosted" | "sign";

interface VerifyOk {
  verified: true;
  id: string;
  scheme: string;
  profileUrl: string;
  badgeUrl: string;
  persisted: boolean;
  persistNote: string | null;
  recoveredAddress?: string;
}
interface VerifyErr {
  verified: false;
  reason?: string | null;
}

export function IdentityClient() {
  const [mode, setMode] = useState<Mode>("hosted");

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "48px 24px 96px",
        color: "var(--text-body)",
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <p style={eyebrowStyle}>identity · live · trust-minimized</p>
        <h1
          style={{
            fontSize: 32,
            lineHeight: 1.15,
            fontWeight: 500,
            color: "var(--text-strong)",
            marginBottom: 12,
            letterSpacing: "-0.01em",
          }}
        >
          Verify your agent.
        </h1>
        <p style={{ fontSize: 16 }}>
          When an autonomous agent transacts, nobody can check who it is or who
          runs it. Publish one signed identity and fix that. You get a public
          profile, a verified badge, and a listing any counterparty can check.
          We never hold your key: verification is signatures only, so we cannot
          forge or fake a claim.
        </p>
      </header>

      {/* Mode switch */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <ModeTab active={mode === "hosted"} onClick={() => setMode("hosted")}>
          Publish at your origin
        </ModeTab>
        <ModeTab active={mode === "sign"} onClick={() => setMode("sign")}>
          Sign it yourself
        </ModeTab>
      </div>

      {mode === "hosted" ? <HostedMode /> : <SignMode />}

      <FooterNotes />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hosted mode
// ─────────────────────────────────────────────────────────────────────────────

function HostedMode() {
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyOk | null>(null);

  async function run() {
    if (!origin.trim()) {
      setError("Paste your origin first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/identity/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: origin.trim() }),
      });
      const data = (await r.json()) as VerifyOk | VerifyErr;
      if (!data.verified) {
        throw new Error(data.reason || "verification failed");
      }
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section style={cardStyle}>
        <p style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>
          Serve a signed identity doc at{" "}
          <code style={codeInline}>/.well-known/agents.json</code> on your
          origin, then paste the origin below. See the{" "}
          <Link href="/rfcs/002" style={linkStyle}>
            RFC-002
          </Link>{" "}
          shape and the drop-in snippet in the docs.
        </p>
        <label style={labelStyle}>
          Your origin
          <input
            type="url"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://youragent.example"
            style={inputStyle}
          />
        </label>
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={run} disabled={loading} style={primaryBtn(loading)}>
            {loading ? "Fetching + verifying…" : "Verify"}
          </button>
        </div>
      </section>
      {error && <ErrorBox>{error}</ErrorBox>}
      {result && <ResultBox result={result} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-it-yourself mode
// ─────────────────────────────────────────────────────────────────────────────

function SignMode() {
  const [scheme, setScheme] = useState<Scheme>("evm-secp256k1");
  const [address, setAddress] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [chainId, setChainId] = useState("8453");
  const [accountType, setAccountType] = useState<"eoa" | "erc1271">("eoa");
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [homepage, setHomepage] = useState("");
  const [issuedAt, setIssuedAt] = useState("");

  const [prepared, setPrepared] = useState<{ statement: string; docHash: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyOk | null>(null);

  // Build the exact doc we send to both /prepare and /verify. Kept identical so
  // the recomputed hash matches. issuedAt defaults to now if left blank.
  function buildDoc(): Record<string, unknown> {
    const agent: Record<string, string> = {};
    if (name.trim()) agent.name = name.trim();
    if (operator.trim()) agent.operator = operator.trim();
    if (homepage.trim()) agent.homepage = homepage.trim();
    const identity: Record<string, unknown> =
      scheme === "evm-secp256k1"
        ? {
            scheme,
            chainId: Number(chainId) || 8453,
            address: address.trim(),
            accountType,
          }
        : { scheme, publicKey: publicKey.trim() };
    return {
      $schema: "https://ar-agents.ar/schemas/agents.v1.json",
      spec: "https://ar-agents.ar/rfcs/002",
      ...(Object.keys(agent).length ? { agent } : {}),
      identity,
      binding: null,
      issuedAt: issuedAt.trim() || new Date().toISOString(),
    };
  }

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);

  async function prepare() {
    setError(null);
    setResult(null);
    setSignature("");
    if (scheme === "evm-secp256k1" && !address.trim()) {
      setError("Enter your address.");
      return;
    }
    if (scheme === "ed25519" && !publicKey.trim()) {
      setError("Enter your public key (hex).");
      return;
    }
    setLoading(true);
    try {
      const built = buildDoc();
      const r = await fetch("/api/identity/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc: built }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.note || data.error || `HTTP ${r.status}`);
      setDoc(built);
      setPrepared({ statement: data.statement, docHash: data.docHash });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!doc || !prepared) return;
    if (!signature.trim()) {
      setError("Paste your signature.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const signedDoc = {
        ...doc,
        binding: {
          scheme: scheme === "evm-secp256k1" ? "eip-191" : "ed25519",
          statement: prepared.statement,
          signature: signature.trim(),
          docHash: prepared.docHash,
        },
      };
      const r = await fetch("/api/identity/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc: signedDoc }),
      });
      const data = (await r.json()) as VerifyOk | VerifyErr;
      if (!data.verified) throw new Error(data.reason || "verification failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const snippet =
    scheme === "evm-secp256k1"
      ? `// viem\nconst signature = await walletClient.signMessage({ account, message: statement })\n// or ethers\nconst signature = await wallet.signMessage(statement)`
      : `// Ed25519 (Web Crypto)\nconst sig = await crypto.subtle.sign("Ed25519", privateKey,\n  new TextEncoder().encode(statement))\n// hex-encode sig for binding.signature`;

  return (
    <>
      <section style={cardStyle}>
        <label style={labelStyle}>
          Key scheme
          <select
            value={scheme}
            onChange={(e) => {
              setScheme(e.target.value as Scheme);
              setPrepared(null);
            }}
            style={inputStyle}
          >
            <option value="evm-secp256k1">EVM secp256k1 (Base / Ethereum)</option>
            <option value="ed25519">Ed25519</option>
          </select>
        </label>

        {scheme === "evm-secp256k1" ? (
          <>
            <label style={labelStyle}>
              Address
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, flex: 1, minWidth: 140 }}>
                Chain id
                <input
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                  placeholder="8453"
                  style={inputStyle}
                />
              </label>
              <label style={{ ...labelStyle, flex: 1, minWidth: 140 }}>
                Account type
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as "eoa" | "erc1271")}
                  style={inputStyle}
                >
                  <option value="eoa">EOA (ecrecover)</option>
                  <option value="erc1271">Contract (EIP-1271)</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <label style={labelStyle}>
            Public key (raw 32-byte hex)
            <input
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="91b0b1…"
              style={inputStyle}
            />
          </label>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
            Optional: name, operator, homepage (self-declared)
          </summary>
          <label style={labelStyle}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Operator
            <input value={operator} onChange={(e) => setOperator(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Homepage
            <input value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://…" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            issuedAt (ISO 8601, blank = now)
            <input value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} placeholder="2026-07-03T00:00:00Z" style={inputStyle} />
          </label>
        </details>

        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={prepare} disabled={loading} style={primaryBtn(loading)}>
            {loading && !prepared ? "Preparing…" : "1. Get statement to sign"}
          </button>
        </div>
      </section>

      {prepared && (
        <section style={cardStyle}>
          <p style={{ marginTop: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Sign these exact bytes with your key, then paste the signature.
          </p>
          <pre style={preStyle}>{prepared.statement}</pre>
          <pre style={{ ...preStyle, color: "var(--text-muted)" }}>{snippet}</pre>
          <label style={labelStyle}>
            2. Signature
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={scheme === "evm-secp256k1" ? "0x…" : "hex or base64url"}
              style={inputStyle}
            />
          </label>
          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={verify} disabled={loading} style={primaryBtn(loading)}>
              {loading ? "Verifying…" : "3. Verify"}
            </button>
          </div>
        </section>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {result && <ResultBox result={result} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared result UI
// ─────────────────────────────────────────────────────────────────────────────

function ResultBox({ result }: { result: VerifyOk }) {
  const badgeMd = `[![agent](${result.badgeUrl})](${result.profileUrl})`;
  return (
    <section
      style={{
        padding: 20,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        marginBottom: 24,
        borderLeft: "3px solid #10b981",
      }}
    >
      <p style={{ margin: 0, fontSize: 16, color: "var(--text-strong)", fontWeight: 500 }}>
        Verified. Your agent is live in the registry.
      </p>
      <p style={{ fontSize: 14, marginTop: 10 }}>
        Public profile:{" "}
        <Link href={`/agent/${result.id}`} style={linkStyle}>
          /agent/{result.id}
        </Link>
      </p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
        Machine record:{" "}
        <a href={`/api/identity/${result.id}`} style={linkStyle}>
          /api/identity/{result.id}
        </a>
        {" · "}listed in{" "}
        <a href="/api/agents" style={linkStyle}>
          /api/agents
        </a>
      </p>
      <p style={{ ...labelStyle, marginTop: 16 }}>Embed your badge</p>
      <pre style={preStyle}>{badgeMd}</pre>
      <p style={{ margin: "10px 0 0" }}>
        <img src={result.badgeUrl} alt="agent verified badge" style={{ height: 20 }} />
      </p>
      {!result.persisted && result.persistNote && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
          {result.persistNote}
        </p>
      )}
    </section>
  );
}

function FooterNotes() {
  return (
    <section style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
      <p>
        What is verified: that your key controls the doc, and the doc is intact.
        Name, operator and evidence links are self-declared and shown as such.
        There is no score. Browse who is verified in the{" "}
        <Link href="/registro" style={linkStyle}>
          registry
        </Link>
        .
      </p>
    </section>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 16,
        background: "#ef444422",
        color: "#ef4444",
        borderRadius: 8,
        marginBottom: 24,
        fontSize: 14,
      }}
    >
      {children}
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "1px solid var(--border-subtle)",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--bg)" : "var(--text-body)",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
};

const cardStyle: React.CSSProperties = {
  padding: 20,
  background: "var(--bg-tint)",
  borderRadius: 8,
  boxShadow: "var(--card-shadow)",
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-strong)",
  marginBottom: 6,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "10px 12px",
  background: "var(--bg)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  color: "var(--text-body)",
  fontSize: 14,
  fontFamily: FONT_MONO,
};

const preStyle: React.CSSProperties = {
  background: "var(--bg)",
  padding: 14,
  borderRadius: 6,
  fontSize: 12.5,
  lineHeight: 1.5,
  fontFamily: FONT_MONO,
  color: "var(--text-body)",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  border: "1px solid var(--border-subtle)",
};

const codeInline: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  background: "var(--bg)",
  padding: "1px 5px",
  borderRadius: 4,
};

const linkStyle: React.CSSProperties = { color: "var(--accent)" };

function primaryBtn(loading: boolean): React.CSSProperties {
  return {
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    padding: "10px 20px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.6 : 1,
  };
}
