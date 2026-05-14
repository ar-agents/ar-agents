// Mock MELI backend used by the live demo. Returns canned data shaped like
// real MELI responses so a real LLM agent can drive the 14 tools end-to-end
// without needing OAuth or hitting MELI for production data.

import { mockFetch, makeMeliClient } from "@ar-agents/mercadolibre/testing";

export function buildDemoMeliClient() {
  const fm = mockFetch()
    .on("GET", "/orders/search", () => ({
      status: 200,
      body: {
        paging: { total: 7 },
        results: Array.from({ length: 7 }, (_, i) => ({
          id: 1000 + i,
          date_created: new Date().toISOString(),
          status: "paid",
          total_amount: 4500 * (i + 1),
          currency_id: "ARS",
          pack_id: i % 3 === 0 ? 9000 + i : null,
          order_items: [
            {
              item: {
                id: `MLA${1402155766 + i}`,
                title:
                  i % 2 === 0
                    ? "Yerba Mate Amanda 1kg"
                    : "Termo Stanley Classic 1.4L",
              },
              quantity: 1,
              unit_price: 4500 * (i + 1),
              currency_id: "ARS",
            },
          ],
          buyer: { id: 88 + i, nickname: `BUYER-${i}` },
        })),
      },
    }))
    .onRegex("GET", /\/orders\/\d+$/, (req) => ({
      status: 200,
      body: {
        id: Number(req.url.split("/").pop()) || 1234,
        date_created: new Date().toISOString(),
        status: "paid",
        total_amount: 12500,
        currency_id: "ARS",
        pack_id: 9001,
        order_items: [
          {
            item: { id: "MLA1402155766", title: "Yerba mate Amanda 1kg" },
            quantity: 2,
            unit_price: 6250,
            currency_id: "ARS",
          },
        ],
        buyer: {
          id: 88,
          nickname: "TERE-X",
          billing_info: { doc_type: "DNI", doc_number: "12345678" },
        },
      },
    }))
    .on("GET", "/questions/search", () => ({
      status: 200,
      body: {
        total: 3,
        questions: [
          {
            id: 9876543210,
            seller_id: 12345,
            item_id: "MLA1402155766",
            text: "¿Hay stock en talle M?",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 88, nickname: "TERE-X", answered_questions: 12 },
          },
          {
            id: 1111,
            seller_id: 12345,
            item_id: "MLA1402155767",
            text: "Te paso mi WhatsApp +54 11 1234-5678 para hablar fuera",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 89 },
          },
          {
            id: 2222,
            seller_id: 12345,
            item_id: "MLA1402155768",
            text: "¿Hacés envío gratis a Mendoza?",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 90, answered_questions: 4 },
          },
        ],
      },
    }))
    .onRegex("GET", /\/questions\/\d+$/, () => ({
      status: 200,
      body: {
        id: 9876543210,
        seller_id: 12345,
        item_id: "MLA1402155766",
        text: "¿Hay stock en talle M?",
        status: "UNANSWERED",
        date_created: new Date().toISOString(),
        from: { id: 88, nickname: "TERE-X", answered_questions: 12 },
      },
    }))
    .on("POST", "/answers", (req) => ({
      status: 200,
      body: {
        id: 9999,
        text: (req.body as { text: string }).text,
        status: "ANSWERED",
      },
    }))
    .on("GET", "/sites/MLA/category_predictor/predict", () => ({
      status: 200,
      body: {
        id: "MLA409408",
        name: "Yerba Mate",
        path_from_root: [
          { id: "MLA1403", name: "Alimentos y Bebidas" },
          { id: "MLA1409", name: "Almacén" },
          { id: "MLA409408", name: "Yerba Mate" },
        ],
      },
    }))
    .on("GET", "/sites/MLA/domain_discovery/search", () => ({
      status: 200,
      body: [
        {
          domain_id: "MLA-YERBA_MATE",
          domain_name: "Yerba mate",
          category_id: "MLA409408",
          category_name: "Yerba Mate",
          attributes: [],
        },
      ],
    }))
    .on("GET", "/domains/MLA-YERBA_MATE/technical_specs/input", () => ({
      status: 200,
      body: {
        input: {
          components: [
            { type: "INPUT", id: "BRAND", required: true },
            { type: "INPUT", id: "MODEL", required: true },
            { type: "INPUT", id: "NET_WEIGHT", required: true },
            { type: "INPUT", id: "ITEM_CONDITION", required: true },
          ],
          mandatory: 4,
        },
      },
    }))
    .on("GET", "/users/12345/items/search", () => ({
      status: 200,
      body: {
        results: Array.from({ length: 47 }, (_, i) => `MLA${1400000000 + i}`),
        scroll_id: null,
      },
    }))
    .onRegex("GET", /\/items\/MLA\d+$/, (req) => {
      const id = req.url.split("/").pop() ?? "MLA1402155766";
      return {
        status: 200,
        body: {
          id,
          site_id: "MLA",
          title: "Yerba Mate Amanda 1kg",
          seller_id: 12345,
          category_id: "MLA409408",
          price: 4500,
          currency_id: "ARS",
          available_quantity: 25,
          condition: "new",
          buying_mode: "buy_it_now",
          listing_type_id: "gold_special",
          status: "active",
          permalink: `https://articulo.mercadolibre.com.ar/${id}`,
        },
      };
    })
    .onRegex("PUT", /\/items\/MLA\d+$/, (req) => {
      const id = req.url.split("/").pop() ?? "MLA1";
      return {
        status: 200,
        body: {
          id,
          site_id: "MLA",
          title: "Yerba Mate Amanda 1kg",
          seller_id: 12345,
          category_id: "MLA409408",
          price: 4500,
          currency_id: "ARS",
          available_quantity:
            (req.body as { available_quantity?: number }).available_quantity ??
            25,
          condition: "new",
          buying_mode: "buy_it_now",
          listing_type_id: "gold_special",
          status: "active",
          permalink: `https://articulo.mercadolibre.com.ar/${id}`,
        },
      };
    })
    .on("GET", "/post-purchase/v1/claims/search", () => ({
      status: 200,
      body: {
        paging: { total: 2 },
        data: [
          {
            id: 5421,
            resource: "order",
            resource_id: 1234567890,
            status: "opened",
            stage: "mediation",
            type: "missing_product",
            reason_id: "PNR0001",
            date_created: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
            due_date: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
          },
          {
            id: 5422,
            resource: "order",
            resource_id: 1234567891,
            status: "opened",
            stage: "mediation",
            type: "different_product",
            reason_id: "PNR0042",
            date_created: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
            due_date: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
          },
        ],
      },
    }))
    .on("GET", "/users/12345/seller_reputation", () => ({
      status: 200,
      body: {
        level_id: "3_yellow",
        power_seller_status: null,
        metrics: {
          claims: { rate: 0.04, value: 12, period: "60d" },
          delayed_handling_time: { rate: 0.02, value: 6, period: "60d" },
          cancellations: { rate: 0.015, value: 5, period: "60d" },
          sales: { period: "60d", completed: 200 },
        },
      },
    }))
    .on("GET", "/seller-promotions/users/12345/candidates", () => ({
      status: 200,
      body: {
        results: [
          {
            promotion_id: "PROMO_2026_05",
            promotion_type: "DEAL",
            start_date: new Date().toISOString(),
            finish_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
            suggested_discount_percentage: 20,
            max_discount_percentage: 30,
            min_discount_percentage: 10,
            items: [
              {
                id: "MLA1402155766",
                original_price: 4500,
                suggested_price: 3600,
                currency_id: "ARS",
              },
            ],
          },
        ],
      },
    }))
    .build();

  return makeMeliClient({
    fetch: fm.fetch,
    accessToken: "demo_token",
    skipResponseValidation: true,
  });
}
