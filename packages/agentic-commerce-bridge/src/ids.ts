// ID generation helpers. Defaults use `crypto.randomUUID()` (WebCrypto, Node
// 19+) and prefix with the resource shorthand per common ACP convention.
//
// Hosts that need deterministic IDs (testing) can override
// `generateSessionId` / `generateOrderId` in `FacilitatorOptions`.

const SESSION_PREFIX = "cs_";
const ORDER_PREFIX = "ord_";
const CART_PREFIX = "cart_";

function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.randomUUID) {
    throw new Error(
      "crypto.randomUUID() is required (Node 19+, browsers, Vercel Edge, " +
        "Cloudflare Workers, Deno, Bun).",
    );
  }
  return c.randomUUID();
}

export function generateSessionId(): string {
  return `${SESSION_PREFIX}${uuid().replace(/-/g, "")}`;
}

export function generateOrderId(): string {
  return `${ORDER_PREFIX}${uuid().replace(/-/g, "")}`;
}

export function generateCartId(): string {
  return `${CART_PREFIX}${uuid().replace(/-/g, "")}`;
}

export function isCheckoutSessionId(s: string): boolean {
  return s.startsWith(SESSION_PREFIX);
}

export function isOrderId(s: string): boolean {
  return s.startsWith(ORDER_PREFIX);
}

export function isCartId(s: string): boolean {
  return s.startsWith(CART_PREFIX);
}
