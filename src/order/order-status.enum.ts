export enum OrderStatus {
  OPEN = 'OPEN',
  CONFIRMED = 'CONFIRMED',
  CANCELED = 'CANCELED',
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.OPEN]: [OrderStatus.CONFIRMED, OrderStatus.CANCELED],
  [OrderStatus.CONFIRMED]: [OrderStatus.CANCELED],
  [OrderStatus.CANCELED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
