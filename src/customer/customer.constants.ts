export const CustomerConstants = {
  TAX_ID_PATTERN: /^[A-Za-z0-9./-]{5,20}$/,
  PASSPORT_NUMBER_PATTERN: /^[A-Z0-9]{6,9}$/,
} as const;

/** Maiusculas e so letras/digitos: "123.456-78" -> "12345678", "ab-12.cd/9" -> "AB12CD9". */
export function canonicalTaxId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
