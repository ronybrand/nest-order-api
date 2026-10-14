/**
 * Tetos estruturais do payload de busca: sem eles uma unica requisicao carrega centenas de
 * condicoes/valores para o banco.
 */
export const SearchLimits = {
  MAX_FILTER_FIELDS: 10,
  MAX_CONDITIONS_PER_FIELD: 10,
  MAX_IN_VALUES: 100,
  MAX_VALUE_LENGTH: 200,
  /** OFFSET precisa caber num inteiro de 32 bits: acima disso o Postgres devolve erro em vez de uma pagina vazia. */
  MAX_OFFSET: 2_147_483_647,
} as const;
