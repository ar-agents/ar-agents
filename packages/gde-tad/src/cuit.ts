/** Strip non-digits from a CUIT input ("20-12345678-9" → "20123456789"). */
export function normalizeCuit(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}
