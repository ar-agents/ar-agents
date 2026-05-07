// Scenario scripts for the DemoTerminal. Each scenario plays as a tab.
// Picked for breadth: subscription billing (recurring), cuotas + 3DS
// (AR-specific), marketplace OAuth split (depth), and recovery (production
// wiring). Each ~10s of runtime. Result cards parameterized per scenario.

export type ToolEvent = {
  kind: "tool";
  name: string;
  args: Record<string, string | number | boolean>;
  result: Record<string, string | number | boolean>;
};

export type Event =
  | { kind: "user"; text: string }
  | ToolEvent
  | { kind: "assistant"; text: string };

export type Scenario = {
  id: string;
  label: string;
  prompt: string;
  events: ReadonlyArray<Event>;
  result: {
    title: string;
    fields: ReadonlyArray<readonly [string, string]>;
    cta: { label: string; href: string };
  };
};

const SUBSCRIPTION: Scenario = {
  id: "subscription",
  label: "Subscription",
  prompt: "Creá una subscription mensual de $1000 ARS para customer@example.com",
  events: [
    {
      kind: "user",
      text: "Creá una subscription mensual de $1000 ARS para customer@example.com",
    },
    {
      kind: "tool",
      name: "find_customer_by_email",
      args: { email: "customer@example.com" },
      result: { found: false },
    },
    {
      kind: "tool",
      name: "create_customer",
      args: { email: "customer@example.com" },
      result: { id: "1234567890", email: "customer@example.com" },
    },
    {
      kind: "tool",
      name: "create_subscription",
      args: {
        amount: 1000,
        frequency: "monthly",
        customer_id: "1234567890",
      },
      result: {
        id: "abc-123",
        init_point:
          "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
      },
    },
    {
      kind: "assistant",
      text: "Listo, creé la subscription mensual de $1000 ARS para customer@example.com.\nMandale este link para que pague:\nhttps://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
    },
  ],
  result: {
    title: "Subscription created",
    fields: [
      ["ID", "abc-123"],
      ["Amount", "$1.000 ARS · monthly"],
      ["Customer", "customer@example.com"],
      ["Status", "pending first payment"],
    ],
    cta: {
      label: "Open checkout",
      href: "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
    },
  },
};

const CUOTAS: Scenario = {
  id: "cuotas",
  label: "Cuotas + 3DS",
  prompt:
    "Cobrale $50.000 ARS a Juan con su tarjeta Galicia. Ofrecele cuotas si tiene promo.",
  events: [
    {
      kind: "user",
      text: "Cobrale $50.000 ARS a Juan con su tarjeta Galicia. Ofrecele cuotas si tiene promo.",
    },
    {
      kind: "tool",
      name: "find_applicable_promos",
      args: { issuer: "galicia", amount: 50000 },
      result: {
        best_installments: 6,
        rate: 0,
        label: "6 cuotas sin interés",
      },
    },
    {
      kind: "tool",
      name: "create_payment",
      args: {
        amount: 50000,
        installments: 6,
        token: "card_token_xxx",
        capture: true,
      },
      result: {
        id: "pay-77001",
        status: "pending_3ds",
        three_ds_url: "https://api.mercadopago.com/v1/3ds/challenge?token=...",
      },
    },
    {
      kind: "tool",
      name: "confirm_3ds_challenge",
      args: { payment_id: "pay-77001" },
      result: { id: "pay-77001", status: "approved", net_amount: 50000 },
    },
    {
      kind: "assistant",
      text: "Cobré $50.000 ARS de Juan en 6 cuotas sin interés (Galicia).\nEl 3DS challenge se confirmó y el pago quedó approved.\nPayment ID: pay-77001.",
    },
  ],
  result: {
    title: "Payment approved",
    fields: [
      ["Payment", "pay-77001"],
      ["Amount", "$50.000 ARS"],
      ["Plan", "6 cuotas sin interés · Galicia"],
      ["3DS", "approved"],
    ],
    cta: {
      label: "View receipt",
      href: "https://www.mercadopago.com.ar/activities/pay-77001",
    },
  },
};

const MARKETPLACE: Scenario = {
  id: "marketplace",
  label: "Marketplace",
  prompt:
    "El seller @tiendanube_xyz quiere cobrar $5.000 ARS. Mi platform se lleva 10%.",
  events: [
    {
      kind: "user",
      text: "El seller @tiendanube_xyz quiere cobrar $5.000 ARS. Mi platform se lleva 10%.",
    },
    {
      kind: "tool",
      name: "compute_marketplace_fee",
      args: { amount: 5000, platform_fee_pct: 10 },
      result: {
        platform_fee: 500,
        seller_amount: 4500,
      },
    },
    {
      kind: "tool",
      name: "create_payment_preference",
      args: {
        amount: 5000,
        marketplace_fee: 500,
        seller_token_id: "tiendanube_xyz",
      },
      result: {
        id: "pref-9281",
        init_point:
          "https://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
      },
    },
    {
      kind: "assistant",
      text: "Preference creada con split 90/10.\nCliente paga $5.000 ARS, seller recibe $4.500, platform $500.\nMandale este link al cliente:\nhttps://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
    },
  ],
  result: {
    title: "Preference created",
    fields: [
      ["Preference", "pref-9281"],
      ["Total", "$5.000 ARS"],
      ["Seller", "$4.500 (90%)"],
      ["Platform fee", "$500 (10%)"],
    ],
    cta: {
      label: "Open checkout",
      href: "https://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
    },
  },
};

const RECOVERY: Scenario = {
  id: "recovery",
  label: "Recovery",
  prompt:
    "Cobrale $1.000 ARS al cliente cust-42 con la tarjeta que tiene guardada.",
  events: [
    {
      kind: "user",
      text: "Cobrale $1.000 ARS al cliente cust-42 con la tarjeta que tiene guardada.",
    },
    {
      kind: "tool",
      name: "list_customer_cards",
      args: { customer_id: "cust-42" },
      result: {
        primary_id: "card_xyz",
        primary_status: "active",
      },
    },
    {
      kind: "tool",
      name: "charge_saved_card",
      args: { card_id: "card_xyz", amount: 1000 },
      result: {
        status: "rejected",
        status_detail: "cc_rejected_other_reason",
      },
    },
    {
      kind: "tool",
      name: "list_customer_cards",
      args: { customer_id: "cust-42" },
      result: {
        backup_id: "card_uvw",
        backup_status: "active",
      },
    },
    {
      kind: "tool",
      name: "charge_saved_card",
      args: { card_id: "card_uvw", amount: 1000 },
      result: { id: "pay-44102", status: "approved" },
    },
    {
      kind: "assistant",
      text: "La tarjeta primaria fue rechazada. Probé con la backup y aprobó.\nPayment ID: pay-44102.",
    },
  ],
  result: {
    title: "Recovered after retry",
    fields: [
      ["Payment", "pay-44102"],
      ["Amount", "$1.000 ARS"],
      ["Attempts", "2 (1 rejected · 1 approved)"],
      ["Card used", "backup (card_uvw)"],
    ],
    cta: {
      label: "View receipt",
      href: "https://www.mercadopago.com.ar/activities/pay-44102",
    },
  },
};

export const SCENARIOS: ReadonlyArray<Scenario> = [
  SUBSCRIPTION,
  CUOTAS,
  MARKETPLACE,
  RECOVERY,
];
