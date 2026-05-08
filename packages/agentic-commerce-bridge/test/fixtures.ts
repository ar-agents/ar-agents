// Shared fixtures for handler tests. Provides a MockCatalogProvider, a
// MockPaymentProvider, and a `buildTestFacilitator()` helper that wires
// them up with an InMemoryStateAdapter.

import {
  createFacilitator,
  InMemoryStateAdapter,
  type CatalogProvider,
  type ResolvedItem,
  type PaymentProvider,
  type PaymentResult,
  type Facilitator,
  type FacilitatorOptions,
  type FacilitatorHooks,
  type AcpRequest,
} from "../src";
import type { PaymentHandler } from "../src/schemas/capabilities";

export class MockCatalogProvider implements CatalogProvider {
  constructor(private items: Record<string, ResolvedItem>) {}
  async resolveItem(id: string): Promise<ResolvedItem | null> {
    return this.items[id] ?? null;
  }
}

export interface MockPaymentProviderOpts {
  handlerId?: string;
  /** Override `processPayment` outcome. Defaults to success. */
  outcome?: PaymentResult | (() => PaymentResult);
  /** Override `onSessionCreated` to return metadata or a no-op. */
  onSessionCreatedMetadata?: Record<string, unknown>;
  /** If true, processPayment throws. */
  throws?: boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly handlerId: string;
  private outcome: () => PaymentResult;
  private onCreatedMeta: Record<string, unknown> | undefined;
  private shouldThrow: boolean;
  public onCreatedCalled = 0;
  public processPaymentCalled = 0;
  public lastPaymentArgs: Parameters<PaymentProvider["processPayment"]>[0] | null =
    null;

  constructor(opts: MockPaymentProviderOpts = {}) {
    this.handlerId = opts.handlerId ?? "test_handler";
    const outcome = opts.outcome ?? {
      success: true,
      paymentId: "pay_mock_001",
      metadata: { mock: true },
    };
    this.outcome =
      typeof outcome === "function" ? (outcome as () => PaymentResult) : () => outcome;
    this.onCreatedMeta = opts.onSessionCreatedMetadata;
    this.shouldThrow = opts.throws ?? false;
  }

  async onSessionCreated(): Promise<{ metadata?: Record<string, unknown> } | void> {
    this.onCreatedCalled++;
    if (this.onCreatedMeta) return { metadata: this.onCreatedMeta };
  }

  async processPayment(
    args: Parameters<PaymentProvider["processPayment"]>[0],
  ): Promise<PaymentResult> {
    this.processPaymentCalled++;
    this.lastPaymentArgs = args;
    if (this.shouldThrow) {
      throw new Error("payment provider exploded");
    }
    return this.outcome();
  }
}

export const TEST_PAYMENT_HANDLER: PaymentHandler = {
  id: "test_handler",
  name: "dev.acp.tokenized.card",
  display_name: "Test Card",
  version: "2026-04-17",
  spec: "https://acp.dev/handlers/tokenized.card",
  requires_delegate_payment: false,
  requires_pci_compliance: false,
  psp: "test",
  config_schema: "https://example.invalid/schemas/test_config",
  instrument_schemas: ["https://example.invalid/schemas/test_instrument"],
  config: {},
  display_order: 1,
};

export interface BuildFacilitatorOpts {
  catalog?: Record<string, ResolvedItem>;
  payment?: MockPaymentProviderOpts;
  hooks?: FacilitatorHooks;
  webhookSecret?: string;
  options?: Partial<FacilitatorOptions>;
}

export interface TestFacilitator {
  facilitator: Facilitator;
  state: InMemoryStateAdapter;
  catalog: MockCatalogProvider;
  payment: MockPaymentProvider;
}

export function buildTestFacilitator(
  opts: BuildFacilitatorOpts = {},
): TestFacilitator {
  const state = new InMemoryStateAdapter();
  const catalog = new MockCatalogProvider(
    opts.catalog ?? {
      item_a: {
        id: "item_a",
        name: "Test Item A",
        description: "A test item",
        unit_amount: 19900,
        currency: "ars",
        available_quantity: 100,
        sku: "SKU-A",
      },
      item_b: {
        id: "item_b",
        name: "Test Item B",
        unit_amount: 5000,
        currency: "ars",
        available_quantity: 5,
      },
      item_usd: {
        id: "item_usd",
        name: "USD Item",
        unit_amount: 1000,
        currency: "usd",
      },
    },
  );
  const payment = new MockPaymentProvider(opts.payment);
  const facilitator = createFacilitator({
    state,
    catalog,
    paymentProviders: { [payment.handlerId]: payment },
    paymentHandlers: [{ ...TEST_PAYMENT_HANDLER, id: payment.handlerId }],
    ...(opts.hooks !== undefined ? { hooks: opts.hooks } : {}),
    ...(opts.webhookSecret !== undefined
      ? { webhookSecret: opts.webhookSecret }
      : {}),
    // Deterministic time + IDs for tests.
    now: () => 1717000000,
    generateSessionId: (() => {
      let i = 0;
      return () => `cs_test_${++i}`;
    })(),
    generateOrderId: (() => {
      let i = 0;
      return () => `ord_test_${++i}`;
    })(),
    ...opts.options,
  });
  return { facilitator, state, catalog, payment };
}

export function buildPostRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): AcpRequest {
  const rawBody = JSON.stringify(body);
  return {
    method: "POST",
    path,
    headers: {
      "API-Version": "2026-04-17",
      "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
      "Content-Type": "application/json",
      ...headers,
    },
    rawBody,
    body,
  };
}

export function buildGetRequest(
  path: string,
  headers: Record<string, string> = {},
): AcpRequest {
  return {
    method: "GET",
    path,
    headers: {
      "API-Version": "2026-04-17",
      ...headers,
    },
    rawBody: "",
  };
}
