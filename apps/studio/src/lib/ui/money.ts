// Pure formatting helpers for the usage/billing numbers in docs/CONTRACT.md
// (`costMicroUsd`, `priceMicroUsd`, token counts). No I/O, unit-testable.

/** 1 USD = 1,000,000 micro-USD. */
export function microUsdToUsd(micro: number): number {
  return micro / 1_000_000;
}

/**
 * Formats a micro-USD amount as a USD string. Studio's free-tier amounts are
 * tiny (default cap is 0.50 USD of model cost), so anything under one cent
 * gets extra decimals instead of rounding away to "US$ 0.00".
 */
export function formatUsd(micro: number): string {
  const usd = microUsdToUsd(micro);
  const decimals = usd !== 0 && Math.abs(usd) < 0.01 ? 4 : 2;
  return `US$ ${usd.toFixed(decimals)}`;
}

/** es-AR thousands separators for a raw token count. */
export function formatTokenCount(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

/** ARS currency formatting for a society's capitalSocial, etc. */
export function formatArs(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}
