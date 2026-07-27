/**
 * Checagem positiva nomeada (isBlank/isNotBlank) em vez de negar o oposto
 * (`!value`) espalhado pelo código — mesma convenção do commons-lang3 usado
 * no projeto Java de referência.
 */
export const StringUtils = {
  isBlank(value: string | null | undefined): boolean {
    return value == null || value.trim().length === 0;
  },
  isNotBlank(value: string | null | undefined): value is string {
    return !StringUtils.isBlank(value);
  },
};
