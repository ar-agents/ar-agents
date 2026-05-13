// Seller reputation — `/users/{id}/seller_reputation`.
//
// Plus a lightweight monitor pattern that polls the reputation snapshot
// and emits typed alerts when metrics cross configurable thresholds.
// MELI demotes sellers when claim_rate, late_handling, or cancel_rate
// exceed silent thresholds; this monitor catches them BEFORE the
// thermometer drops.

import type { MeliClient } from "./client";
import { MeliAuthError, MeliValidationError } from "./errors";
import {
  ReputationAlert,
  SellerReputation,
  type ReputationAlert as TReputationAlert,
  type SellerReputation as TSellerReputation,
} from "./schemas/reputation";

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export async function getSellerReputation(
  client: MeliClient,
  sellerId: number,
): Promise<TSellerReputation> {
  // The endpoint returns the reputation envelope directly — `/users/{id}`
  // is the parent shape, but we expose a cleaner client by hitting the
  // dedicated subresource that MELI serves.
  return client.fetch<TSellerReputation>({
    method: "GET",
    path: `/users/${sellerId}/seller_reputation`,
    responseSchema: SellerReputation,
  });
}

// ---------------------------------------------------------------------------
// Threshold-based alert generator
// ---------------------------------------------------------------------------

export interface ReputationThresholds {
  /** Fire `warning` when claim rate >= warningClaimRate. Default 0.04. */
  warningClaimRate?: number;
  /** Fire `critical` when claim rate >= criticalClaimRate. Default 0.07. */
  criticalClaimRate?: number;
  /** Same for delayed handling time. Defaults 0.03 / 0.06. */
  warningDelayedHandlingRate?: number;
  criticalDelayedHandlingRate?: number;
  /** Cancellation rate. Defaults 0.02 / 0.05. */
  warningCancellationRate?: number;
  criticalCancellationRate?: number;
}

const DEFAULTS: Required<ReputationThresholds> = {
  warningClaimRate: 0.04,
  criticalClaimRate: 0.07,
  warningDelayedHandlingRate: 0.03,
  criticalDelayedHandlingRate: 0.06,
  warningCancellationRate: 0.02,
  criticalCancellationRate: 0.05,
};

export function evaluateReputationAlerts(
  reputation: TSellerReputation,
  thresholds: ReputationThresholds = {},
): TReputationAlert[] {
  const t = { ...DEFAULTS, ...thresholds };
  const alerts: TReputationAlert[] = [];

  // Helper that pushes a typed alert.
  const push = (
    severity: "info" | "warning" | "critical",
    title: string,
    detail: string,
    metric: string,
    current_value: number | undefined,
    threshold: number,
  ) => {
    const a: Record<string, unknown> = {
      severity,
      title,
      detail,
      metric,
      threshold,
    };
    if (current_value !== undefined) a["current_value"] = current_value;
    alerts.push(ReputationAlert.parse(a));
  };

  // Level alert (thermometer color).
  if (reputation.level_id === "3_yellow") {
    push(
      "warning",
      "Reputation thermometer is YELLOW",
      "Listing cap may already have been reduced. Resolve open claims and improve handling time to recover.",
      "level_id",
      undefined,
      0,
    );
  } else if (
    reputation.level_id === "2_orange" ||
    reputation.level_id === "1_red"
  ) {
    push(
      "critical",
      `Reputation thermometer is ${reputation.level_id.toUpperCase()}`,
      "Listings will be heavily restricted. Pause non-critical operations and run a save-play on the most-recent reclamos.",
      "level_id",
      undefined,
      0,
    );
  }

  // Claim rate.
  const claimRate = reputation.metrics?.claims?.rate;
  if (typeof claimRate === "number") {
    if (claimRate >= t.criticalClaimRate) {
      push(
        "critical",
        `Claim rate is ${(claimRate * 100).toFixed(2)}%`,
        `Above critical threshold (${t.criticalClaimRate * 100}%). Demotion likely imminent.`,
        "claims.rate",
        claimRate,
        t.criticalClaimRate,
      );
    } else if (claimRate >= t.warningClaimRate) {
      push(
        "warning",
        `Claim rate is ${(claimRate * 100).toFixed(2)}%`,
        `Above warning threshold (${t.warningClaimRate * 100}%). Trigger a defense pass on open claims.`,
        "claims.rate",
        claimRate,
        t.warningClaimRate,
      );
    }
  }

  // Delayed handling rate.
  const delayedRate = reputation.metrics?.delayed_handling_time?.rate;
  if (typeof delayedRate === "number") {
    if (delayedRate >= t.criticalDelayedHandlingRate) {
      push(
        "critical",
        `Late dispatch rate is ${(delayedRate * 100).toFixed(2)}%`,
        "Mercado Envíos Flex de-listing risk is high.",
        "delayed_handling_time.rate",
        delayedRate,
        t.criticalDelayedHandlingRate,
      );
    } else if (delayedRate >= t.warningDelayedHandlingRate) {
      push(
        "warning",
        `Late dispatch rate is ${(delayedRate * 100).toFixed(2)}%`,
        "Catch up on shipping cutoffs to avoid de-listing.",
        "delayed_handling_time.rate",
        delayedRate,
        t.warningDelayedHandlingRate,
      );
    }
  }

  // Cancellation rate.
  const cancelRate = reputation.metrics?.cancellations?.rate;
  if (typeof cancelRate === "number") {
    if (cancelRate >= t.criticalCancellationRate) {
      push(
        "critical",
        `Cancellation rate is ${(cancelRate * 100).toFixed(2)}%`,
        "Suspension risk; review stock-out cases and inventory sync.",
        "cancellations.rate",
        cancelRate,
        t.criticalCancellationRate,
      );
    } else if (cancelRate >= t.warningCancellationRate) {
      push(
        "warning",
        `Cancellation rate is ${(cancelRate * 100).toFixed(2)}%`,
        "Investigate stock desync between channels.",
        "cancellations.rate",
        cancelRate,
        t.warningCancellationRate,
      );
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Polling monitor (returns an AsyncIterable for streaming alerts)
// ---------------------------------------------------------------------------

export interface MonitorReputationOptions {
  /** Poll interval in milliseconds. Default 5 minutes. */
  intervalMs?: number;
  thresholds?: ReputationThresholds;
  /** AbortSignal to stop the monitor. */
  signal?: AbortSignal;
  /** Callback fired when a transient (recoverable) error is swallowed. Use
   *  this to wire your telemetry/Sentry without breaking the polling loop. */
  onTransientError?: (error: unknown) => void;
}

/**
 * Yields `{ snapshot, alerts }` on every poll.
 *
 * Error handling:
 *   - **`MeliAuthError`** (revoked seller, banned app, OAuth refresh dead) →
 *     RE-THROWN. The connection is permanently broken; the caller needs to
 *     stop polling and surface this to the human.
 *   - **`MeliValidationError`** (programmer error — schema drift) →
 *     RE-THROWN. Bugs should fail loud, not silently.
 *   - **`MeliApiError`** with 5xx, **`MeliNetworkError`**, anything else →
 *     swallowed and reported via `onTransientError`. The loop keeps polling
 *     because transient failures are normal.
 */
export async function* monitorReputation(
  client: MeliClient,
  sellerId: number,
  options: MonitorReputationOptions = {},
): AsyncGenerator<
  { snapshot: TSellerReputation | null; alerts: TReputationAlert[] },
  void,
  void
> {
  const interval = options.intervalMs ?? 5 * 60 * 1000;
  while (!options.signal?.aborted) {
    let snapshot: TSellerReputation | null = null;
    let alerts: TReputationAlert[] = [];
    try {
      snapshot = await getSellerReputation(client, sellerId);
      alerts = evaluateReputationAlerts(snapshot, options.thresholds);
    } catch (err) {
      // Permanent errors must surface — never silently retry forever.
      if (
        err instanceof MeliAuthError ||
        err instanceof MeliValidationError
      ) {
        throw err;
      }
      options.onTransientError?.(err);
    }
    yield { snapshot, alerts };
    if (options.signal?.aborted) return;
    await sleep(interval, options.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
