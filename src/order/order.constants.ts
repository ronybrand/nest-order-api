export const OrderConstants = {
  MAX_ITEMS_PER_ORDER: 200,
  MAX_UNIT_PRICE: 1_000_000,
  MAX_QUANTITY: 10_000,
} as const;

/**
 * Limite proprio das escritas de pedido (mais apertado que o global de 100/min): cada transicao de status
 * publica no broker, e escrita nao deve dividir balde com leitura.
 */
export const OrderRateLimit = { default: { limit: 30, ttl: 60_000 } } as const;
