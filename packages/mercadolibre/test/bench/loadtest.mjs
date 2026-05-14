// Quick load test against the live bridge-hello deployment.
// Measures p50/p95/p99 for the 4 hot endpoints.

const BASE = "https://ar-agents-bridge-hello.vercel.app";
const RUNS_PER_ENDPOINT = 50;
const CONCURRENCY = 10;

const ENDPOINTS = [
  { name: "GET /.well-known/acp.json", path: "/.well-known/acp.json", method: "GET" },
  { name: "GET /.well-known/agentic-feed.json", path: "/.well-known/agentic-feed.json", method: "GET" },
  {
    name: "GET /api/feed/products (opt-in)",
    path: "/api/feed/products?limit=10",
    method: "GET",
    headers: { "Opt-In": "agentic-commerce-feed/2026-04-17" },
  },
  {
    name: "POST /api/acp/checkout_sessions",
    path: "/api/acp/checkout_sessions",
    method: "POST",
    headers: { "Content-Type": "application/json", "API-Version": "2026-04-17" },
    body: JSON.stringify({
      currency: "ars",
      line_items: [{ id: "yerba_amanda", quantity: 1 }],
      buyer: { email: "load-test@example.invalid" },
    }),
  },
];

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor((p / 100) * sorted.length)];
}

async function runEndpoint(ep) {
  const latencies = [];
  let errors = 0;
  let queued = 0;
  async function worker() {
    while (queued < RUNS_PER_ENDPOINT) {
      queued++;
      const id = queued;
      const headers = { ...(ep.headers ?? {}) };
      if (ep.method === "POST")
        headers["Idempotency-Key"] = `loadtest-${Date.now()}-${id}`;
      const t0 = performance.now();
      try {
        const init = { method: ep.method, headers };
        if (ep.body) init.body = ep.body;
        const r = await fetch(`${BASE}${ep.path}`, init);
        await r.text();
        latencies.push(performance.now() - t0);
        if (!r.ok && r.status !== 304) errors++;
      } catch {
        errors++;
      }
    }
  }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );
  return {
    name: ep.name,
    n: latencies.length,
    errors,
    p50: pct(latencies, 50),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
    max: Math.max(...latencies),
  };
}

console.log(`Load test: ${RUNS_PER_ENDPOINT} runs per endpoint, ${CONCURRENCY} concurrent`);
console.log(`Target: ${BASE}\n`);

for (const ep of ENDPOINTS) {
  const r = await runEndpoint(ep);
  console.log(
    `${r.name.padEnd(50)}  n=${r.n}  err=${r.errors}  p50=${r.p50.toFixed(0)}ms  p95=${r.p95.toFixed(0)}ms  p99=${r.p99.toFixed(0)}ms  max=${r.max.toFixed(0)}ms`,
  );
}
