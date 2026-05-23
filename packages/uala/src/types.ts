/**
 * Shared request/response types used across the Ualá adapter contract and
 * the tool layer. Types are deliberately conservative: the adapter
 * promises ONLY the fields named here. Future fields go via `extras`
 * (Record<string, unknown>) on the response, never silently in the typed
 * surface — so a consumer pinned to v0.1 cannot break when the upstream
 * Ualá API adds optional fields.
 */

export type Currency = "ARS" | "USD";

export type PaymentLinkStatus =
  | "open" // accepting payment
  | "paid" // a payer completed it
  | "expired" // past expiration without payment
  | "cancelled"; // revoked by the merchant

export interface PaymentLink {
  id: string;
  amount: number; // in centavos (ARS) or cents (USD)
  currency: Currency;
  description?: string;
  externalReference?: string;
  status: PaymentLinkStatus;
  shareUrl: string; // url to share with the payer
  qrCodeUrl?: string; // optional pre-rendered QR for in-person flows
  expiresAt?: string; // ISO 8601 in UTC
  createdAt: string; // ISO 8601 in UTC
  extras?: Record<string, unknown>;
}

export interface CreatePaymentLinkArgs {
  amount: number; // centavos for ARS, cents for USD
  currency?: Currency | undefined; // default ARS
  description?: string | undefined;
  externalReference?: string | undefined;
  expiresInMinutes?: number | undefined; // omit for no expiry
  /** Idempotency key. Same key with same payload returns the original link. */
  idempotencyKey?: string | undefined;
}

export type TransactionKind = "credit" | "debit";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  description?: string;
  counterpart?: string; // payer / payee identifier (CUIT, email, or label)
  externalReference?: string;
  paymentLinkId?: string;
  createdAt: string;
  extras?: Record<string, unknown>;
}

export interface ListTransactionsArgs {
  fromIso?: string | undefined;
  toIso?: string | undefined;
  kind?: TransactionKind | undefined;
  limit?: number | undefined; // default 25, max 100
  cursor?: string | undefined;
}

export interface ListTransactionsResult {
  transactions: Transaction[];
  /** Opaque cursor for the next page; null when exhausted. */
  nextCursor: string | null;
}

export type PayoutStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "paid"
  | "rejected";

export interface Payout {
  id: string;
  amount: number;
  currency: Currency;
  destinationCbu: string;
  reference?: string;
  status: PayoutStatus;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
  rejectionReason?: string;
  extras?: Record<string, unknown>;
}

export interface CreatePayoutArgs {
  amount: number;
  currency?: Currency | undefined; // default ARS
  destinationCbu: string;
  reference?: string | undefined;
  /** Idempotency key. Same key with same payload returns the original payout. */
  idempotencyKey?: string | undefined;
}

export interface BalanceSnapshot {
  currency: Currency;
  available: number; // currently spendable balance
  pending: number; // funds in hold (e.g. payouts en route)
  asOf: string; // ISO 8601 timestamp the snapshot is valid for
}

// ── OAuth (marketplace integrations) ────────────────────────────

export interface OAuthAuthorizeArgs {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string; // CSRF token; the caller stores + matches on callback
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
  scope: string[];
  /** External user / merchant id, when Ualá returns one. */
  merchantId?: string;
}

export interface OAuthExchangeArgs {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}

export interface OAuthRefreshArgs {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}
