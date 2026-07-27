import { OrderStatus } from './order-status.enum';

export const ORDER_STATUS_CHANGED_EVENT = 'order.status.changed';

export class OrderStatusChangedEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerEmail: string,
    public readonly customerName: string,
    public readonly oldStatus: OrderStatus,
    public readonly newStatus: OrderStatus,
    public readonly totalAmount: string,
    public readonly changedAt: Date,
  ) {}
}
