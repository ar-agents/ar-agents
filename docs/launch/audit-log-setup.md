# Production audit log — 2-minute Vercel KV + HMAC setup

The `/play` and `/api/auto-incorporate` endpoints write HMAC-signed audit entries to a session-scoped log. By default the log lives in-memory (per-Edge-instance); for the audit log to be **forensically meaningful end-to-end** you need:

1. A Vercel KV (Upstash REST) instance provisioned for the project
2. An `AUDIT_HMAC_SECRET` env var (32+ chars random)

Total time: ~2 minutes via the Vercel dashboard.

## 1 · Provision Vercel KV

1. Open [vercel.com/nazas-projects-045ec600/ar-agents/storage](https://vercel.com/nazas-projects-045ec600/ar-agents/storage).
2. Click **Create Database** → choose **KV** (Upstash Redis under the hood, Edge-compatible).
3. Region: `sa-east-1` (São Paulo) — closest to AR users + matches the existing `ar-agents-mp-hello` Upstash instance.
4. Click **Connect Project** → check `ar-agents` → **Production + Preview + Development**.

This auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the project's env vars. The audit lib reads both at runtime; if either is absent it transparently falls back to in-memory mode (no error, just degraded persistence).

## 2 · Set `AUDIT_HMAC_SECRET`

Generate a 32+ char secret locally:

```bash
openssl rand -hex 32
# or
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

Then in Vercel dashboard → ar-agents → Settings → Environment Variables → **Add**:

- Name: `AUDIT_HMAC_SECRET`
- Value: paste the hex string
- Environments: Production + Preview + Development
- Save

## 3 · Redeploy (or wait for next push)

```bash
cd apps/landing  # or root if vercel link is at root
mv .git .git-bak && npx vercel --prod --yes; mv ../../.git-bak ../../.git
```

(or just push another commit — git integration triggers a deploy)

## 4 · Verify

```bash
# 1. Hit auto-incorporate to write an entry
SESSION=$(curl -sS -X POST https://ar-agents.ar/api/auto-incorporate \
  -H "Content-Type: application/json" \
  -d '{"denominacion":"ACME-AI SAS","tipo":"SOCIEDAD-IA","capitalSocial":1,"objeto":"Operación de servicios digitales y desarrollo de software propio."}' \
  | jq -r '.audit.sessionId')

# 2. Read the audit log
curl -sS "https://ar-agents.ar/api/play/audit/${SESSION}?verify=1" | jq

# Expected:
# {
#   "sessionId": "...",
#   "backend": "vercel-kv",                  ← was "in-memory"
#   "count": 1,                              ← was 0
#   "entries": [{ ..., "hmac": "sha256:..." }],
#   "verification": {
#     "total": 1,
#     "verified": 1,                         ← all entries verified
#     "tampered": 0,
#     "hmacWired": true                      ← was false
#   }
# }
```

## 5 · Tampering test (optional but recommended)

Once KV is wired, you can prove the HMAC works:

```bash
# 1. Read an entry
curl -sS "https://ar-agents.ar/api/play/audit/${SESSION}" | jq '.entries[0]'

# 2. Use redis-cli to manually corrupt one (via Upstash console)
#    e.g., LSET play:audit:${SESSION} 0 '{"id":"...","tool":"FAKE","input":"...","hmac":"sha256:00000..."}'

# 3. Re-verify
curl -sS "https://ar-agents.ar/api/play/audit/${SESSION}?verify=1" | jq '.verification'

# Expected: { "total": 1, "verified": 0, "tampered": 1, "hmacWired": true }
```

This is the demo you want to show to a regulator: anyone can corrupt the log, but the corruption is mechanically detectable. RFC-001 § 9.2.

## TTL

Each session list expires automatically after **7 days** (configurable in `src/lib/audit.ts → ENTRY_TTL_SECONDS`). Old sessions don't accumulate cost in KV. For real production you'd archive long-term to S3 / Postgres before expiry — that's outside the demo scope.

## Cost

Upstash KV free tier on Vercel: 10K commands/day, 256 MB storage. The /play demo writes ~1 entry per tool call (avg 3-5 per session). 10K commands/day = ~2K demo sessions/day comfortably within free tier. If that becomes a constraint, the cheapest paid tier is ~$1/mo per 100K extra commands.

## Why this matters for the regulator pitch

Without KV + HMAC, the audit log is a UX feature ("look, every tool call is visible!"). With KV + HMAC, it's a **forensic primitive** an auditor can challenge. The difference is exactly what RFC-001 § 9.2 proposes turning into legal evidence under the sociedad-IA regime.
