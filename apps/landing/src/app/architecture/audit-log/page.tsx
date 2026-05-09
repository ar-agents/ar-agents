import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";

export const metadata: Metadata = {
  title: "/architecture/audit-log · the HMAC + KV + verify lifecycle",
  description:
    "Deep-dive on the forensic primitive that makes RFC-001 § 9.2's 'legally probative' claim mechanically true. Canonical-JSON, HMAC-SHA256, Vercel KV, write/read/verify lifecycle, why each design choice is the way it is.",
  alternates: {
    canonical: "https://ar-agents.vercel.app/architecture/audit-log",
  },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

export default function AuditLogArchitecturePage() {
  return (
    <DocShell
      eyebrow="/arg · architecture · deep-dive"
      title="The audit log lifecycle."
      subtitle="The forensic primitive that lets RFC-001 § 9.2 claim 'legally probative'. Canonical-JSON serialization → HMAC-SHA256 signature → Vercel KV append-only storage → public read with server-side re-verify. Every design choice traced to a concrete failure mode it prevents."
    >
      <DocBlock>
        <DocP>
          The audit log is the single most-load-bearing primitive in the
          ar-agents stack. The whole regulator pitch — "this isn&apos;t
          just a UI, it&apos;s mechanically forensic" — collapses if any
          of the four steps fails:
        </DocP>
        <ol style={listStyle}>
          <Li>
            <strong>Canonical serialization</strong> must be deterministic
            and stable across writes + reads (or the same entry would
            sign differently each time).
          </Li>
          <Li>
            <strong>HMAC-SHA256</strong> must be computed identically on
            sign and verify (or every signed entry would falsely appear
            tampered).
          </Li>
          <Li>
            <strong>Storage</strong> must persist append-only across
            Edge instances (or reads from a different instance would see
            an empty log).
          </Li>
          <Li>
            <strong>Public re-verification</strong> must be available to
            any third party (or the "anyone can verify" claim is
            theoretical).
          </Li>
        </ol>
        <DocP>
          This page is the line-by-line walkthrough of how each step is
          implemented, why it&apos;s implemented that way, and what
          would break if it weren&apos;t.
        </DocP>
      </DocBlock>

      <DocH2>1 · The data shape</DocH2>
      <DocP>
        Every entry is a flat object with these fields. The shape is
        defined in <DocCode>src/lib/audit.ts</DocCode>:
      </DocP>
      <CodeBlock>{`interface AuditEntry {
  id: string;                    // ISO timestamp + 8-char random suffix
  sessionId: string;             // 8-64 char [A-Za-z0-9_-]
  ts: string;                    // ISO 8601 UTC
  tool: string;                  // "validate_cuit" | "crear_factura" | etc.
  governance: AuditGovernance;   // RFC-001 governance class
  input: unknown;                // canonical-JSON-serializable
  output?: unknown;              // optional, omitted on errored
  errored?: boolean;
  durationMs?: number;
  hmac: string | null;           // "sha256:<hex>" — null only when secret not wired
}`}</CodeBlock>
      <DocP>
        Why this exact shape: the HMAC needs a fixed input space, so
        all fields are explicit, none are inferred at read time. The{" "}
        <DocCode>id</DocCode> is ISO-prefixed so the natural string
        sort matches chronological order — useful when a downstream
        consumer wants to merge entries from multiple sources without
        timestamp parsing. <DocCode>sessionId</DocCode> validates
        against a strict regex (<DocCode>{"/^[A-Za-z0-9_-]{8,64}$/"}</DocCode>)
        — short enough to be UUIDs, long enough to be opaque tokens, no
        characters that need URL-encoding.
      </DocP>

      <DocH2>2 · Canonical-JSON serialization</DocH2>
      <DocP>
        The HMAC is computed over a canonical JSON serialization of the
        entry, with object keys sorted alphabetically. Without this,
        two entries with the same data but different key insertion
        order would sign differently — and JavaScript&apos;s default{" "}
        <DocCode>JSON.stringify</DocCode> uses insertion order, not
        alphabetical.
      </DocP>
      <CodeBlock>{`function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return \`[\${value.map(canonical).join(",")}]\`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return \`{\${keys.map((k) => \`\${JSON.stringify(k)}:\${canonical(obj[k])}\`).join(",")}}\`;
}`}</CodeBlock>
      <DocP>
        Two invariants that took a real bug to find:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Sign and verify must omit the same fields</strong>. The
          <DocCode>hmac</DocCode> field obviously can&apos;t be in the
          serialization (it doesn&apos;t exist yet at sign time, and
          verify would loop on itself). The original implementation
          had a subtle bug: <DocCode>signEntry</DocCode> received an
          object with <DocCode>hmac: null</DocCode> already set,{" "}
          <DocCode>verifyEntry</DocCode> destructured <DocCode>hmac</DocCode>{" "}
          out before serializing. Result: every signed entry appeared
          tampered on verify. Fixed in commit{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/commit/184a424"
            style={{ color: "var(--accent)" }}
          >
            184a424
          </a>{" "}
          — both functions now strip <DocCode>hmac</DocCode> at runtime
          before serializing. Caught by the unit tests in{" "}
          <DocCode>apps/landing/test/audit.test.ts</DocCode>.
        </Li>
        <Li>
          <strong>Stable across object construction</strong>. A test
          asserts that{" "}
          <DocCode>{`canonical({a:1, b:2})`}</DocCode> ==={" "}
          <DocCode>{`canonical({b:2, a:1})`}</DocCode>. If a downstream
          refactor breaks this (e.g., switching to{" "}
          <DocCode>Map</DocCode> internally), the test fires.
        </Li>
      </ul>

      <DocH2>3 · HMAC-SHA256 via Web Crypto</DocH2>
      <DocP>
        The signature uses Web Crypto&apos;s{" "}
        <DocCode>crypto.subtle.sign</DocCode> + <DocCode>verify</DocCode>
        . Web Crypto-only is a hard requirement of the Edge Runtime
        contract (see <a href="/architecture" style={{ color: "var(--accent)" }}>/architecture</a>);{" "}
        <DocCode>node:crypto</DocCode> isn&apos;t available there. The
        secret is a 64-char hex string from <DocCode>openssl rand -hex
        32</DocCode>, lives in <DocCode>AUDIT_HMAC_SECRET</DocCode>{" "}
        env var, and is imported into a <DocCode>CryptoKey</DocCode>{" "}
        once per process and cached.
      </DocP>
      <CodeBlock>{`async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) return null;
  if (cachedKey.key && cachedKey.secret === secret) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,        // not extractable — can't be exported back
    ["sign", "verify"],
  );
  cachedKey.key = key;
  cachedKey.secret = secret;
  return key;
}`}</CodeBlock>
      <DocP>
        Why <DocCode>extractable: false</DocCode>: even though the secret
        already lives in process env, marking the key non-extractable
        prevents accidental serialization (e.g., via debugger tools or
        a downstream library that introspects keys). Defense in depth
        for ~2 lines of additional safety.
      </DocP>
      <DocP>
        Verification uses <DocCode>crypto.subtle.verify</DocCode>{" "}
        directly — Web Crypto&apos;s implementation is constant-time on
        the byte comparison (per WebCrypto spec § 18). A naive{" "}
        <DocCode>===</DocCode> on hex strings would be timing-attack
        vulnerable. We never roll our own.
      </DocP>

      <DocH2>4 · Storage: Vercel KV (Upstash) with in-memory fallback</DocH2>
      <DocP>
        Entries land in a Vercel KV (Upstash Redis) list keyed by{" "}
        <DocCode>play:audit:{`{sessionId}`}</DocCode>. Append via{" "}
        <DocCode>RPUSH</DocCode>, read via <DocCode>LRANGE 0 -1</DocCode>,
        TTL via <DocCode>EXPIRE</DocCode> at 7 days. The TTL bounds
        cost — KV free tier has finite storage — and the 7-day window
        is long enough to span a forensic challenge cycle while short
        enough to let demo sessions naturally expire.
      </DocP>
      <CodeBlock>{`if (isKvWired()) {
  try {
    await kv.rpush(key(sessionId), entry);
    await kv.expire(key(sessionId), ENTRY_TTL_SECONDS);
  } catch {
    // KV down — fall through to in-memory so the demo doesn't break.
    const arr = memStore.get(sessionId) ?? [];
    arr.push(entry);
    memStore.set(sessionId, arr);
  }
} else {
  // No KV — in-memory only. Per-instance, no cross-Edge persistence.
  // Accepted degradation for PR previews + local dev without secrets.
  ...
}`}</CodeBlock>
      <DocP>
        Why <em>both</em> a KV path and an in-memory fallback: PR
        previews and local dev don&apos;t have KV credentials, but the
        demo still has to work for a maintainer testing a feature. The
        fallback is per-instance (Edge functions don&apos;t share
        memory across cold starts), so cross-instance reads return
        empty — but every smoke-test in CI hits the same instance once
        and verifies the round-trip works. Production-mode (KV) is
        verified end-to-end via the live{" "}
        <a href="/api/play/audit/4f50ebf2-94ec-4c75-b94a-6e8e1f54f5bc?verify=1" style={{ color: "var(--accent)" }}>
          probe session
        </a>{" "}
        from earlier deploys.
      </DocP>

      <DocH2>5 · Read + verify lifecycle</DocH2>
      <DocP>
        The read endpoint (<DocCode>GET /api/play/audit/{`{sessionId}`}</DocCode>)
        returns all entries. The query param{" "}
        <DocCode>?verify=1</DocCode> additionally re-runs HMAC
        verification per entry and returns aggregate stats:
      </DocP>
      <CodeBlock>{`{
  "sessionId": "...",
  "backend": "vercel-kv",
  "count": 5,
  "entries": [...],
  "verification": {            // only when ?verify=1
    "total": 5,
    "verified": 5,
    "tampered": 0,
    "hmacWired": true
  }
}`}</CodeBlock>
      <DocP>
        The verification re-imports the same{" "}
        <DocCode>AUDIT_HMAC_SECRET</DocCode>, walks each entry, strips
        the <DocCode>hmac</DocCode> field, recomputes the canonical
        serialization, and compares the recomputed signature to the
        stored one via constant-time <DocCode>crypto.subtle.verify</DocCode>.
        Any mismatch increments <DocCode>tampered</DocCode>.
      </DocP>
      <DocP>
        The endpoint is intentionally{" "}
        <strong>unauthenticated</strong>. Session ids are opaque
        enough that enumeration is not a meaningful attack (UUIDs +
        the 8-64 char regex make brute-force impractical), and the
        public-readability is a feature: anyone can ask "is this
        log clean?" without coordinating with the operator. RFC-001
        § 9.2 hinges on this.
      </DocP>

      <DocH2>6 · Streaming reads via SSE</DocH2>
      <DocP>
        For consumers that want real-time updates (e.g., the{" "}
        <a href="/dashboard/4f50ebf2-94ec-4c75-b94a-6e8e1f54f5bc" style={{ color: "var(--accent)" }}>
          live /dashboard view
        </a>{" "}
        or a compliance ops tool watching tenants),{" "}
        <DocCode>GET /api/play/audit-stream/{`{sessionId}`}</DocCode>{" "}
        returns Server-Sent Events. Initial snapshot + delta-emit on a
        2s tick + 15s keep-alive ping + 5min uptime cap. EventSource
        clients auto-reconnect.
      </DocP>
      <DocP>
        Why polling KV every 2s rather than Redis pub/sub: the audit
        write is already a KV operation. Adding a separate pub/sub
        channel doubles the failure modes (entry lands in KV but
        pub/sub message lost). Polling against the same KV is simpler
        + idempotent — duplicate ticks read the same state and emit no
        events. The 2s tick is well under what KV can sustain on the
        free tier.
      </DocP>

      <DocH2>7 · The badge endpoint</DocH2>
      <DocP>
        <DocCode>GET /api/badge/{`{sessionId}`}</DocCode> returns a
        24px shields.io-style SVG that updates with the verification
        state: blue "verified · N/M" when clean, red "tampered · N"
        when at least one signature mismatches, gray "no-hmac" or "no
        entries" otherwise. 60-second cache.
      </DocP>
      <DocP>
        This is the surface that propagates the forensic claim
        virally. An operator embeds the badge in their landing page;
        any visitor sees a recomputable verification status without
        knowing what HMAC means. The badge link itself can be shared
        in WhatsApp / Slack / Twitter — preview cards render the SVG
        directly.
      </DocP>

      <DocH2>8 · Probative-value reasoning (RFC-001 § 9.2)</DocH2>
      <DocP>
        For the audit log to be legally probative, three things must
        hold:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>The signature must be reproducible by a third
          party</strong>. Anyone with the public-readable entry +
          knowledge of the canonical-JSON algorithm + the operator&apos;s
          server-held secret can recompute. The endpoint exposes the
          <DocCode>?verify=1</DocCode> path so the third party
          doesn&apos;t need the secret to ask "is it clean?".
        </Li>
        <Li>
          <strong>Tampering must leave a mechanical trail</strong>.
          Editing any field of a signed entry breaks the HMAC. The
          forgery path requires either (a) the secret, or (b) a
          collision in HMAC-SHA256, which is computationally
          infeasible.
        </Li>
        <Li>
          <strong>The operator must commit to retaining the secret</strong>.
          If the operator rotates <DocCode>AUDIT_HMAC_SECRET</DocCode>{" "}
          mid-session, prior entries become un-verifiable. Production
          deployments should treat secret rotation as a forensic event
          itself: rotate, re-sign all entries with the new secret,
          publish the rotation event in a public log.
        </Li>
      </ul>
      <DocP>
        The full{" "}
        <a href="/rfcs/001#9" style={{ color: "var(--accent)" }}>
          RFC-001 § 9
        </a>{" "}
        text covers the legal-framework arguments. This page is the
        engineering side of the same contract.
      </DocP>

      <DocH2>9 · How a regulator audits this in practice</DocH2>
      <ol style={listStyle}>
        <Li>
          Open <a href="/play" style={{ color: "var(--accent)" }}>/play</a>{" "}
          in a browser tab. Note the per-page-load{" "}
          <DocCode>sessionId</DocCode> shown in the audit pane.
        </Li>
        <Li>
          Run any scenario. Tool calls land in the audit pane, each
          with an HMAC suffix.
        </Li>
        <Li>
          Open{" "}
          <DocCode>/api/play/audit/{`{sessionId}`}?verify=1</DocCode>{" "}
          in a new tab. Confirm the JSON shows{" "}
          <DocCode>verification.verified</DocCode> equal to{" "}
          <DocCode>verification.total</DocCode> and{" "}
          <DocCode>tampered: 0</DocCode>.
        </Li>
        <Li>
          (Optional) attempt to demonstrate tampering: hit{" "}
          <DocCode>POST /api/play/tamper-demo</DocCode> and confirm the
          response shows the original entry verifies, the mutated
          entry does not. The demo is read-only — it doesn&apos;t
          touch the live log — but it proves the algorithm catches
          edits mechanically.
        </Li>
        <Li>
          (Optional) verify with your own toolkit: pull the same
          <DocCode>?verify=1</DocCode> JSON, recompute HMAC-SHA256
          using a server-side helper of your choice (the
          canonical-JSON algorithm is published above + in{" "}
          <DocCode>src/lib/audit.ts</DocCode>), compare to the stored
          signature.
        </Li>
      </ol>

      <DocH2>10 · Tests as the proof contract</DocH2>
      <DocP>
        The audit primitives have 16 unit tests in{" "}
        <DocCode>apps/landing/test/audit.test.ts</DocCode>. Each test
        is a clause of the proof contract:
      </DocP>
      <ul style={listStyle}>
        <Li>Sign + verify must agree on the input space (the bug-fix test).</Li>
        <Li>Tampering on input or tool name must be detected.</Li>
        <Li>Malformed HMAC strings must be rejected (no parse-side oracle).</Li>
        <Li>Object-key reordering must produce the same signature (canonical-JSON stability).</Li>
        <Li>
          The backend autodetects from env (<DocCode>vercel-kv</DocCode>{" "}
          when KV vars present, else <DocCode>in-memory</DocCode>).
        </Li>
        <Li>
          Append + read order is preserved across both backends.
        </Li>
      </ul>
      <DocP>
        Plus 18 SSE primitive tests, 17 badge tests, 34 incorporate
        client tests = 85 TS tests. Plus 22 Python tests on the SDK
        port. Total: 107.
      </DocP>

      <DocH2>11 · Open questions</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>Long-term retention</strong>: KV TTL is 7 days. For
          regulated workloads that need year-scale retention, the
          recommended pattern is a nightly cron that mirrors entries
          to S3 with object lock. The toolkit doesn&apos;t ship this
          yet — operators wire it.
        </Li>
        <Li>
          <strong>Multi-region replication</strong>: KV is currently
          sa-east-1 (São Paulo). Cross-region reads work via Upstash
          replication but add latency. Worth the trade-off for AR-side
          sociedades; might not be for global multi-tenant workloads.
        </Li>
        <Li>
          <strong>Threshold-based key rotation</strong>: a future
          iteration could split signing into "current" + "previous"
          keys to support rolling rotation without invalidating
          existing entries.
        </Li>
      </ul>

      <DocH2>References</DocH2>
      <ul style={listStyle}>
        <Li>
          <a
            href="https://github.com/ar-agents/ar-agents/blob/main/apps/landing/src/lib/audit.ts"
            style={{ color: "var(--accent)" }}
          >
            src/lib/audit.ts
          </a>{" "}
          — primary implementation.
        </Li>
        <Li>
          <a
            href="https://github.com/ar-agents/ar-agents/blob/main/apps/landing/test/audit.test.ts"
            style={{ color: "var(--accent)" }}
          >
            test/audit.test.ts
          </a>{" "}
          — 16 unit tests.
        </Li>
        <Li>
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001 § 9
          </a>{" "}
          — legal framework.
        </Li>
        <Li>
          <a href="/verify" style={{ color: "var(--accent)" }}>
            /verify
          </a>{" "}
          — the public re-verification UI.
        </Li>
        <Li>
          <a href="/dashboard" style={{ color: "var(--accent)" }}>
            /dashboard/{`{sessionId}`}
          </a>{" "}
          — the live forensic timeline.
        </Li>
        <Li>
          <a
            href="https://w3c.github.io/webcrypto/#hmac-operations"
            style={{ color: "var(--accent)" }}
          >
            W3C WebCrypto §HMAC operations
          </a>{" "}
          — the spec we depend on.
        </Li>
        <Li>
          <a
            href="https://datatracker.ietf.org/doc/html/rfc8785"
            style={{ color: "var(--accent)" }}
          >
            RFC 8785 — JSON Canonicalization Scheme
          </a>{" "}
          — the spec our canonicalization is heavily inspired by
          (we ship a subset, not full JCS).
        </Li>
      </ul>
    </DocShell>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "var(--bg-tint)",
        padding: 16,
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: FONT_MONO,
        color: "var(--text-body)",
        overflow: "auto",
        boxShadow: SHADOW_BORDER,
        marginBottom: 16,
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 6, lineHeight: 1.55, color: "var(--text-body)" }}>
      {children}
    </li>
  );
}

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  marginBottom: 16,
};
