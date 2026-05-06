/**
 * Test fixtures: real-shape CBUs and CVUs (account numbers are synthetic but
 * their check digits are correctly computed by the BCRA dual mod-10
 * algorithm).
 *
 * Verified against `computeBlockCheckDigit` — these pass validation but
 * don't correspond to any real bank account.
 */

// Banco Galicia (007), branch 0123, account 4567890123456, valid checks
export const VALID_GALICIA_CBU = "0070123145678901234564";

// Banco Nación (011), branch 4567, account 1234567890123, valid checks
export const VALID_NACION_CBU = "0114567812345678901233";

// Mercado Pago CVU: PSP prefix 0000031, account 0000012345678, valid checks
export const VALID_MERCADOPAGO_CVU = "0000031400000123456784";

// Same Galicia CBU with block 1 check digit wrong (1 → 9)
export const INVALID_GALICIA_BLOCK1 = "0070123945678901234564";

// Same Galicia CBU with block 2 check digit wrong (4 → 5)
export const INVALID_GALICIA_BLOCK2 = "0070123145678901234565";

// Wrong length
export const SHORT_CBU = "12345";
export const LONG_CBU = "00701234456789012345640";

// Empty
export const EMPTY_CBU = "";

// Real-shape unknown PSP code (not in our table)
// Use entity 000 + made-up 4-digit subcode 9999
// "0009999" → block1 weights [7,1,3,9,7,1,3]
// sum(0*7,0*1,0*3,9*9,9*7,9*1,9*3) = 0+0+0+81+63+9+27 = 180 → (10-0)%10 = 0
// Block 1 = "00099990"
// Block 2 = "0000000123456" with weights [3,9,7,1,3,9,7,1,3,9,7,1,3]
// sum(0,0,0,0,0,0,0,1*1,2*3,3*9,4*7,5*1,6*3) = 0+0+0+0+0+0+0+1+6+27+28+5+18 = 85 → (10-5)%10 = 5
// CVU = "00099990" + "0000000123456" + "5" = "0009999000000001234565"
export const UNKNOWN_PSP_CVU = "0009999000000001234565";
