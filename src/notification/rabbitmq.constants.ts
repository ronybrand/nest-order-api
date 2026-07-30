export const ORDER_STATUS_CHANGED_QUEUE = 'order.status.changed';
export const ORDER_STATUS_CHANGED_DLQ = 'order.status.changed.dlq';
export const MAX_RETRIES = 3;

/**
 * Declarado identicamente por `RabbitMqPublisher` e `RabbitMqConsumer`: os argumentos de
 * uma fila precisam bater em toda declaração (`assertQueue`) - RabbitMQ rejeita com 406
 * PRECONDITION_FAILED se um lado declarar sem dead-letter e o outro com. Os dois lados
 * importam esta mesma constante em vez de repetir o objeto.
 */
export const QUEUE_ARGUMENTS = {
  'x-dead-letter-exchange': '',
  'x-dead-letter-routing-key': ORDER_STATUS_CHANGED_DLQ,
};
