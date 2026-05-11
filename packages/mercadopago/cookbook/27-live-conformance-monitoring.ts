/**
 * Recipe 27 — Live conformance monitoring with time-series + alerting.
 *
 * # Pattern
 *
 * Many sociedades-IA operate in production. They want to know: am I
 * still conformant? If my score drops, when did it drop? Can I be
 * notified before the regulator sees it?
 *
 * Recipe 27 is the monitoring loop:
 *
 *   1. Every N minutes (cron), POST /api/conformance-history?url=YOUR_URL
 *      to the public ar-agents.vercel.app endpoint. This re-runs the
 *      certifier + appends the new point to a 365-entry time-series.
 *
 *   2. Compare the latest point against a sliding-window baseline
 *      (default: median of last 24 points = ~1 day at 1h intervals).
 *      If the new score is N% below baseline, fire an alert.
 *
 *   3. Optional Slack / email / webhook destinations.
 *
 * Properties:
 *   - The history endpoint already does the storage + capping. Recipe
 *     27 is just the orchestration + alert logic.
 *   - Designed to run on Vercel cron, GitHub Actions schedule, or any
 *     other scheduler. Idempotent: re-running it appends another point.
 *   - Threshold is a flat percentage drop, not a fancy CUSUM. Easy to
 *     reason about; tune to taste.
 *   - Reports drift, not just regression: if score IMPROVED unexpectedly,
 *     that's interesting too (operator made a change worth noting in
 *     the audit log).
 *
 * # When to use
 *
 *   - In production. The day after you deploy your sociedad-IA.
 *   - For regulator-facing reporting: "I monitored continuously, here
 *     are the 90 days of scores, here's when drift was detected and
 *     how it was remediated."
 *   - For multi-tenant marketplaces (recipe 20): run for each tenant
 *     sociedad-IA in parallel.
 *
 * # Edge Runtime
 *
 * Pure fetch + JSON shaping. Runs anywhere Node 18+ / Edge / browser
 * has `fetch`. No filesystem.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Point {
  ts: string;
  score: number;
  rating: "A" | "B" | "C" | "D" | "F" | "N/A";
}

interface HistoryResponse {
  target: { baseUrl: string };
  points: Point[];
  latest?: Point;
}

interface MonitorResult {
  url: string;
  latest: Point | null;
  baseline: number | null;
  baselineWindow: number;
  drift: "regression" | "improvement" | "stable" | "no-baseline" | "no-data";
  driftPct: number | null;
  threshold: number;
  totalPoints: number;
  alertFired: boolean;
  alertMessage: string | null;
}

interface MonitorOptions {
  /** Public ar-agents endpoint (allow override for self-hosted). */
  apiBaseUrl?: string;
  /** How many recent points form the baseline. Default 24. */
  baselineWindow?: number;
  /** Percent drop that triggers an alert. Default 10. */
  threshold?: number;
  /** Override fetch impl (testing). */
  fetchImpl?: typeof fetch;
  /** Optional alert destination URLs. Slack-style webhook expected. */
  alertWebhooks?: string[];
}

const DEFAULT_API_BASE = "https://ar-agents.vercel.app";
const DEFAULT_BASELINE_WINDOW = 24;
const DEFAULT_THRESHOLD_PCT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Core monitoring loop
// ─────────────────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

export async function monitorConformance(
  url: string,
  options: MonitorOptions = {},
): Promise<MonitorResult> {
  const api = options.apiBaseUrl ?? DEFAULT_API_BASE;
  const baselineWindow = options.baselineWindow ?? DEFAULT_BASELINE_WINDOW;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD_PCT;
  const fetchImpl = options.fetchImpl ?? fetch;

  // 1. Append a new point + read the full history.
  const postUrl = `${api}/api/conformance-history?url=${encodeURIComponent(url)}`;
  let history: HistoryResponse | null = null;
  try {
    const r = await fetchImpl(postUrl, {
      method: "POST",
      headers: { "user-agent": "ar-agents-recipe-27-monitor" },
    });
    if (r.ok) history = (await r.json()) as HistoryResponse;
  } catch {
    // fall through
  }
  if (!history) {
    return {
      url,
      latest: null,
      baseline: null,
      baselineWindow,
      drift: "no-data",
      driftPct: null,
      threshold,
      totalPoints: 0,
      alertFired: false,
      alertMessage: null,
    };
  }

  const points = history.points;
  const latest = history.latest ?? points[points.length - 1] ?? null;
  if (!latest) {
    return {
      url,
      latest: null,
      baseline: null,
      baselineWindow,
      drift: "no-data",
      driftPct: null,
      threshold,
      totalPoints: 0,
      alertFired: false,
      alertMessage: null,
    };
  }

  // 2. Compute baseline (excluding the latest point so it's "before").
  const beforeLatest = points.slice(0, -1);
  const baselineSlice = beforeLatest.slice(-baselineWindow);
  if (baselineSlice.length === 0) {
    return {
      url,
      latest,
      baseline: null,
      baselineWindow,
      drift: "no-baseline",
      driftPct: null,
      threshold,
      totalPoints: points.length,
      alertFired: false,
      alertMessage: null,
    };
  }

  const baseline = median(baselineSlice.map((p) => p.score));
  const driftPct = baseline > 0 ? ((latest.score - baseline) / baseline) * 100 : 0;

  let drift: MonitorResult["drift"];
  if (Math.abs(driftPct) < threshold / 2) drift = "stable";
  else if (driftPct < 0) drift = "regression";
  else drift = "improvement";

  // 3. Alert if regression exceeded threshold.
  const alertFired = drift === "regression" && Math.abs(driftPct) >= threshold;
  let alertMessage: string | null = null;
  if (alertFired) {
    alertMessage = `RFC conformance regression: ${url} dropped ${driftPct.toFixed(1)}% (from baseline ${baseline.toFixed(1)} to ${latest.score}/${latest.rating}). Baseline window: ${baselineSlice.length} points.`;

    // Fire webhooks in parallel; don't fail the function if a webhook fails.
    if (options.alertWebhooks && options.alertWebhooks.length > 0) {
      await Promise.allSettled(
        options.alertWebhooks.map((hook) =>
          fetchImpl(hook, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: alertMessage }),
          }),
        ),
      );
    }
  }

  return {
    url,
    latest,
    baseline,
    baselineWindow,
    drift,
    driftPct,
    threshold,
    totalPoints: points.length,
    alertFired,
    alertMessage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: tsx 27-live-conformance-monitoring.ts <url> [--threshold=N] [--webhook=URL ...]
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { argv: string[]; env: Record<string, string | undefined> } | undefined;

async function main() {
  if (typeof process === "undefined") return;
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  if (!url) {
    console.error("usage: tsx 27-live-conformance-monitoring.ts <url> [--threshold=N] [--webhook=URL]");
    return;
  }
  const threshold = (() => {
    const arg = args.find((a) => a.startsWith("--threshold="));
    return arg ? parseFloat(arg.split("=")[1]) : DEFAULT_THRESHOLD_PCT;
  })();
  const alertWebhooks = args.filter((a) => a.startsWith("--webhook=")).map((a) => a.split("=")[1]);

  const result = await monitorConformance(url, {
    threshold,
    alertWebhooks,
  });

  console.log(JSON.stringify(result, null, 2));

  if (typeof process !== "undefined" && "exit" in process) {
    (process as unknown as { exit: (code: number) => void }).exit(
      result.alertFired ? 1 : 0,
    );
  }
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
