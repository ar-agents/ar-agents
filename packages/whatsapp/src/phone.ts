/**
 * Phone-number normalization for Argentine WhatsApp recipients.
 *
 * # Why this exists
 *
 * Meta's Cloud API expects E.164 format WITHOUT the leading `+`. Argentine
 * users write phone numbers a dozen different ways:
 *
 * - `+54 9 11 1234-5678`
 * - `54 9 11 1234 5678`
 * - `+5491112345678`
 * - `011 1234-5678` (no country code)
 * - `11-1234-5678`
 * - `1112345678` (no area code prefix)
 *
 * Two AR-specific gotchas:
 * 1. WhatsApp requires the **`9`** after the country code for mobile numbers.
 *    Local format `011 5555-1234` becomes `54 9 11 5555-1234`. Without the
 *    9, Meta rejects with "recipient not on WhatsApp" even when they are.
 * 2. The trunk `0` (e.g., the `0` in `011`) must be DROPPED.
 *
 * `normalizeArPhone` handles both. For non-AR numbers (anything starting
 * with country code !== 54), it just strips non-digits and returns.
 */

/**
 * Normalize an Argentine phone number to WhatsApp E.164 format (no `+`).
 *
 * Rules applied in order:
 * 1. Strip all non-digit characters.
 * 2. If starts with `54` (country code already present): drop trunk `0` if
 *    next is `0`, ensure `9` present after `54` for mobile (10-digit
 *    subscriber numbers — landlines stay without `9`).
 * 3. If starts with `0`: assume AR domestic, drop the `0`, prefix `549`.
 * 4. If starts with `15`: legacy mobile prefix, strip and prefix `549<area>`
 *    (best effort — defaults to area `11` if unable to detect).
 * 5. Otherwise: prefix `549` (assumes AR mobile, 10 digits).
 *
 * Returns the normalized string, or throws if the input doesn't look like a
 * valid phone number after normalization.
 *
 * @example
 * normalizeArPhone("+54 9 11 1234-5678") // "5491112345678"
 * normalizeArPhone("011 1234-5678")       // "5491112345678"
 * normalizeArPhone("11-1234-5678")        // "5491112345678"
 * normalizeArPhone("+1 415 555 2671")     // "14155552671" (non-AR pass-through)
 */
export function normalizeArPhone(input: string): string {
  if (typeof input !== "string") {
    throw new TypeError(`Phone number must be a string, got ${typeof input}`);
  }
  const digits = input.replace(/\D/g, "");
  if (!digits) {
    throw new Error(`Phone number "${input}" has no digits`);
  }

  // Country code 54 already present
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    // If the next char is "9", it's already a WhatsApp mobile format
    if (rest.startsWith("9")) {
      const subscriber = rest.slice(1);
      if (subscriber.length < 9 || subscriber.length > 11) {
        throw new Error(
          `AR mobile after country+9 should be 9-11 digits, got ${subscriber.length}: "${input}"`,
        );
      }
      return "549" + subscriber;
    }
    // No 9 — could be landline OR mobile that forgot the 9
    // Heuristic: if length is 10 (area + subscriber), assume mobile, add 9
    if (rest.length === 10) {
      return "549" + rest;
    }
    // Otherwise treat as landline
    return "54" + rest;
  }

  // Starts with leading 0 (domestic AR format)
  if (digits.startsWith("0")) {
    const stripped = stripLeadingZeros(digits);
    // Common pattern: 011 + 8-digit subscriber → 011 1234 5678 → 1112345678
    return "549" + stripped;
  }

  // Legacy 15 mobile prefix (no longer used post-2022, but still seen)
  if (digits.startsWith("15") && digits.length === 10) {
    return "5491" + digits.slice(2);
  }

  // Length 8 = subscriber only, assume CABA (area 11)
  if (digits.length === 8) {
    return "549" + "11" + digits;
  }
  // Length 10 = area + subscriber, assume AR mobile
  if (digits.length === 10) {
    return "549" + digits;
  }
  // Length 11 = 9 + area + subscriber, prepend 54
  if (digits.length === 11 && digits.startsWith("9")) {
    return "54" + digits;
  }
  // Already E.164 length (12-13 digits) but no 54 prefix — pass through
  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }
  throw new Error(
    `Could not normalize phone "${input}" — got ${digits.length} digits, no clear AR pattern matched`,
  );
}

function stripLeadingZeros(s: string): string {
  return s.replace(/^0+/, "");
}

/**
 * Loose validation — checks shape, not deliverability. Returns true if the
 * input could plausibly be a WhatsApp-deliverable phone number. Use this in
 * tools where the LLM might pass garbage.
 */
export function isPlausibleWhatsAppPhone(input: string): boolean {
  try {
    const normalized = normalizeArPhone(input);
    return normalized.length >= 11 && normalized.length <= 15 && /^\d+$/.test(normalized);
  } catch {
    return false;
  }
}
