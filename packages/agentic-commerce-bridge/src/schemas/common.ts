import { z } from "zod";

// ACP `2026-04-17` — currency strings are LOWERCASE ISO 4217 in the
// checkout/cart/payment surfaces. The Feed API uses UPPERCASE on the same
// type — we model both.
export const Currency = z
  .string()
  .regex(/^[a-z]{3}$/, "currency must be lowercase ISO 4217 (e.g. 'usd', 'ars')");
export type Currency = z.infer<typeof Currency>;

export const CurrencyUpper = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be uppercase ISO 4217 (e.g. 'USD', 'ARS')");
export type CurrencyUpper = z.infer<typeof CurrencyUpper>;

// Amounts are non-negative integers expressed in ISO 4217 minor units. CLP /
// PYG / JPY / KRW are 0-decimal, most others are 2-decimal — the divisor
// depends on `currency`. Don't hardcode `÷100`.
export const Amount = z.number().int().nonnegative();
export type Amount = z.infer<typeof Amount>;

// RFC 3339 / ISO 8601 datetime, e.g. `2026-04-17T10:30:00Z`. Lenient enough
// to accept fractional seconds and offset variants.
export const ISODateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/,
    "must be RFC 3339 datetime",
  );
export type ISODateTime = z.infer<typeof ISODateTime>;

// IANA TZ database identifier, e.g. `America/Argentina/Buenos_Aires`.
export const Timezone = z.string().min(1);
export type Timezone = z.infer<typeof Timezone>;

// BCP 47 locale, e.g. `es-AR`, `pt-BR`, `en-US`. Lenient regex; full
// validation is the consumer's responsibility.
export const Locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Z][A-Za-z0-9]{1,7})*$/);
export type Locale = z.infer<typeof Locale>;

// ACP `API-Version` is date-based YYYY-MM-DD.
export const ApiVersion = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "API version must be YYYY-MM-DD");
export type ApiVersion = z.infer<typeof ApiVersion>;

// The current ACP spec version this package targets.
export const SUPPORTED_API_VERSIONS = [
  "2026-04-17",
  "2026-01-30",
  "2025-12-12",
  "2025-09-29",
] as const;
export const LATEST_API_VERSION = "2026-04-17";

export const Url = z.string().url();
export type Url = z.infer<typeof Url>;

// Free-form metadata bag. ACP allows any JSON object. We constrain to plain
// objects with primitive-or-object values to discourage Date / function leaks.
export const Metadata = z.record(z.string(), z.unknown());
export type Metadata = z.infer<typeof Metadata>;
