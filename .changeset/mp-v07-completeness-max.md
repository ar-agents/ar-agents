---
"@ar-agents/mercadopago": minor
"@ar-agents/mcp": patch
---

MP v0.7: completeness máxima — el agente de MP más completo posible. **+25 tools (81 total).**

**Cierre de gaps obvios (8 tools)** — endpoints que ya existían en client.ts pero no expuestos como tools, o métodos típicos faltantes:

- `get_customer`, `update_customer` — CRUD completo del Customer
- `create_customer_card`, `get_customer_card` — gestión de saved cards
- `get_subscription_plan` — fetch de un plan reusable
- `update_subscription`, `search_subscriptions` — CRUD + búsqueda
- `get_refund` — fetch de un refund individual
- `update_payment_preference` — patch a una Preference no-pagada

**Merchant Orders (3 tools — categoría completa nueva)**:

- `get_merchant_order`, `search_merchant_orders`, `update_merchant_order`
- MerchantOrder agrupa Payments asociados a una Preference — clave para reconciliar webhooks con `topic='merchant_order'`.

**Stores + POS CRUD completion (6 tools)**:

- `get_store`, `update_store`, `delete_store`
- `get_pos`, `update_pos`, `delete_pos`

**Bank Accounts (2 tools)**:

- `list_bank_accounts` — los CBUs registrados del seller
- `register_bank_account` — agregar un CBU adicional

**Point Devices físicos (5 tools — categoría nueva)**:

- `list_point_devices` — terminales físicas (Smart, Tap to Pay)
- `update_point_device_mode` — switch entre PDV y STANDALONE
- `create_point_payment_intent` — push payment al device (amount en CENTAVOS)
- `get_point_payment_intent`, `cancel_point_payment_intent`
- Distinto de los QR/POS lógicos — esto es para hardware físico de retail.

**Pure helpers (2 tools, high-leverage)**:

- `compute_marketplace_fee` — dado amount + (% o flat ARS, con min/max), devuelve el `marketplace_fee` exacto
- `explain_payment_status` — dado un Payment, traduce los 30+ status_detail codes de MP a `{ summary, recommendedAction, final, paid, retryable }` en español. Killer feature: el agente no necesita memorizar códigos crípticos de MP.

**Type exports**: `MerchantOrder`, `BankAccount`, `PointDevice`, `PointPaymentIntent`, `PointPaymentIntentState`, `CreatePointPaymentIntentParams`, `MarketplaceFeeRule`, `PaymentStatusExplanation`.

**Helpers exportados**: `computeMarketplaceFee`, `explainPaymentStatus`.

**Cliente extendido**: `request<T>` ahora soporta PATCH (necesario para Point devices).

**169 tests pass** (was 132; +37 v0.7 tests). publint clean. attw 🟢. 31.4 KB brotli'd.

**Cubre el 100% de lo que MP expone como API pública remota.** Operaciones dashboard-only (verificación de identidad, transferencias account-to-account, configuración de notificaciones por email, fraud rules) NO están — tampoco lo están en ningún SDK oficial de MP.
