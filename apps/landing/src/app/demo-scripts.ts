// Bilingual scenario scripts. Tools (args + result) stay language-agnostic
// (they're synthetic API responses); only the user prompt, the assistant
// reply, the tab label, and the result-card title/fields/CTA-label vary.
//
// getScenarios(lang) returns the runtime shape DemoTerminal consumes:
// each scenario expands `tools[]` into ToolEvents and bookends them with
// the user + assistant events for the chosen language.

import type { Lang } from "./i18n";

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

type Bilingual<T> = { en: T; es: T };

type ToolCall = Omit<ToolEvent, "kind">;

type ScenarioTemplate = {
  id: string;
  label: Bilingual<string>;
  user: Bilingual<string>;
  tools: ReadonlyArray<ToolCall>;
  assistant: Bilingual<string>;
  result: Bilingual<Scenario["result"]>;
};

const SUBSCRIPTION: ScenarioTemplate = {
  id: "subscription",
  label: { en: "Subscription", es: "Suscripción" },
  user: {
    en: "Create a monthly $1000 ARS subscription for customer@example.com",
    es: "Creá una subscription mensual de $1000 ARS para customer@example.com",
  },
  tools: [
    {
      name: "find_customer_by_email",
      args: { email: "customer@example.com" },
      result: { found: false },
    },
    {
      name: "create_customer",
      args: { email: "customer@example.com" },
      result: { id: "1234567890", email: "customer@example.com" },
    },
    {
      name: "create_subscription",
      args: { amount: 1000, frequency: "monthly", customer_id: "1234567890" },
      result: {
        id: "abc-123",
        init_point:
          "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
      },
    },
  ],
  assistant: {
    en: "Done. Created the monthly $1000 ARS subscription for customer@example.com.\nSend them this link to authorize the first payment:\nhttps://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
    es: "Listo, creé la subscription mensual de $1000 ARS para customer@example.com.\nMandale este link para que pague:\nhttps://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
  },
  result: {
    en: {
      title: "Subscription created",
      fields: [
        ["ID", "abc-123"],
        ["Amount", "$1,000 ARS · monthly"],
        ["Customer", "customer@example.com"],
        ["Status", "pending first payment"],
      ],
      cta: {
        label: "Open checkout",
        href: "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
      },
    },
    es: {
      title: "Suscripción creada",
      fields: [
        ["ID", "abc-123"],
        ["Monto", "$1.000 ARS · mensual"],
        ["Cliente", "customer@example.com"],
        ["Estado", "esperando primer pago"],
      ],
      cta: {
        label: "Abrir checkout",
        href: "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
      },
    },
  },
};

const CUOTAS: ScenarioTemplate = {
  id: "cuotas",
  label: { en: "Installments + 3DS", es: "Cuotas + 3DS" },
  user: {
    en: "Charge $50,000 ARS to Juan on his Galicia card. Offer installments if he has a promo.",
    es: "Cobrale $50.000 ARS a Juan con su tarjeta Galicia. Ofrecele cuotas si tiene promo.",
  },
  tools: [
    {
      name: "find_applicable_promos",
      args: { issuer: "galicia", amount: 50000 },
      result: { best_installments: 6, rate: 0, label: "6 cuotas sin interés" },
    },
    {
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
      name: "confirm_3ds_challenge",
      args: { payment_id: "pay-77001" },
      result: { id: "pay-77001", status: "approved", net_amount: 50000 },
    },
  ],
  assistant: {
    en: "Charged $50,000 ARS from Juan in 6 interest-free installments (Galicia).\nThe 3DS challenge confirmed and the payment was approved.\nPayment ID: pay-77001.",
    es: "Cobré $50.000 ARS de Juan en 6 cuotas sin interés (Galicia).\nEl 3DS challenge se confirmó y el pago quedó approved.\nPayment ID: pay-77001.",
  },
  result: {
    en: {
      title: "Payment approved",
      fields: [
        ["Payment", "pay-77001"],
        ["Amount", "$50,000 ARS"],
        ["Plan", "6 interest-free installments · Galicia"],
        ["3DS", "approved"],
      ],
      cta: {
        label: "View receipt",
        href: "https://www.mercadopago.com.ar/activities/pay-77001",
      },
    },
    es: {
      title: "Pago aprobado",
      fields: [
        ["Pago", "pay-77001"],
        ["Monto", "$50.000 ARS"],
        ["Plan", "6 cuotas sin interés · Galicia"],
        ["3DS", "aprobado"],
      ],
      cta: {
        label: "Ver comprobante",
        href: "https://www.mercadopago.com.ar/activities/pay-77001",
      },
    },
  },
};

const MARKETPLACE: ScenarioTemplate = {
  id: "marketplace",
  label: { en: "Marketplace", es: "Marketplace" },
  user: {
    en: "Seller @tiendanube_xyz wants to charge $5,000 ARS. My platform takes 10%.",
    es: "El seller @tiendanube_xyz quiere cobrar $5.000 ARS. Mi platform se lleva 10%.",
  },
  tools: [
    {
      name: "compute_marketplace_fee",
      args: { amount: 5000, platform_fee_pct: 10 },
      result: { platform_fee: 500, seller_amount: 4500 },
    },
    {
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
  ],
  assistant: {
    en: "Preference created with a 90/10 split.\nCustomer pays $5,000 ARS, seller receives $4,500, platform $500.\nSend this link to the customer:\nhttps://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
    es: "Preference creada con split 90/10.\nCliente paga $5.000 ARS, seller recibe $4.500, platform $500.\nMandale este link al cliente:\nhttps://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
  },
  result: {
    en: {
      title: "Preference created",
      fields: [
        ["Preference", "pref-9281"],
        ["Total", "$5,000 ARS"],
        ["Seller", "$4,500 (90%)"],
        ["Platform fee", "$500 (10%)"],
      ],
      cta: {
        label: "Open checkout",
        href: "https://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
      },
    },
    es: {
      title: "Preference creada",
      fields: [
        ["Preference", "pref-9281"],
        ["Total", "$5.000 ARS"],
        ["Seller", "$4.500 (90%)"],
        ["Platform fee", "$500 (10%)"],
      ],
      cta: {
        label: "Abrir checkout",
        href: "https://mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-9281",
      },
    },
  },
};

const RECOVERY: ScenarioTemplate = {
  id: "recovery",
  label: { en: "Recovery", es: "Recuperación" },
  user: {
    en: "Charge $1,000 ARS to customer cust-42 with the saved card.",
    es: "Cobrale $1.000 ARS al cliente cust-42 con la tarjeta que tiene guardada.",
  },
  tools: [
    {
      name: "list_customer_cards",
      args: { customer_id: "cust-42" },
      result: { primary_id: "card_xyz", primary_status: "active" },
    },
    {
      name: "charge_saved_card",
      args: { card_id: "card_xyz", amount: 1000 },
      result: {
        status: "rejected",
        status_detail: "cc_rejected_other_reason",
      },
    },
    {
      name: "list_customer_cards",
      args: { customer_id: "cust-42" },
      result: { backup_id: "card_uvw", backup_status: "active" },
    },
    {
      name: "charge_saved_card",
      args: { card_id: "card_uvw", amount: 1000 },
      result: { id: "pay-44102", status: "approved" },
    },
  ],
  assistant: {
    en: "The primary card was rejected. I tried the backup and it approved.\nPayment ID: pay-44102.",
    es: "La tarjeta primaria fue rechazada. Probé con la backup y aprobó.\nPayment ID: pay-44102.",
  },
  result: {
    en: {
      title: "Recovered after retry",
      fields: [
        ["Payment", "pay-44102"],
        ["Amount", "$1,000 ARS"],
        ["Attempts", "2 (1 rejected · 1 approved)"],
        ["Card used", "backup (card_uvw)"],
      ],
      cta: {
        label: "View receipt",
        href: "https://www.mercadopago.com.ar/activities/pay-44102",
      },
    },
    es: {
      title: "Recuperado tras retry",
      fields: [
        ["Pago", "pay-44102"],
        ["Monto", "$1.000 ARS"],
        ["Intentos", "2 (1 rechazado · 1 aprobado)"],
        ["Tarjeta usada", "backup (card_uvw)"],
      ],
      cta: {
        label: "Ver comprobante",
        href: "https://www.mercadopago.com.ar/activities/pay-44102",
      },
    },
  },
};

const TEMPLATES: ReadonlyArray<ScenarioTemplate> = [
  SUBSCRIPTION,
  CUOTAS,
  MARKETPLACE,
  RECOVERY,
];

function expand(s: ScenarioTemplate, lang: Lang): Scenario {
  const events: Event[] = [
    { kind: "user", text: s.user[lang] },
    ...s.tools.map((t) => ({ kind: "tool" as const, ...t })),
    { kind: "assistant", text: s.assistant[lang] },
  ];
  return {
    id: s.id,
    label: s.label[lang],
    prompt: s.user[lang],
    events,
    result: s.result[lang],
  };
}

export function getScenarios(lang: Lang): Scenario[] {
  return TEMPLATES.map((t) => expand(t, lang));
}
