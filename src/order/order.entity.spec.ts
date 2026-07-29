import { Order } from './order.entity';
import { Item } from './item.entity';

function buildItem(unitPrice: string, quantity: number): Item {
  const item = new Item();
  item.unitPrice = unitPrice;
  item.quantity = quantity;
  return item;
}

function buildOrder(items: Item[]): Order {
  const order = new Order();
  order.items = items;
  return order;
}

describe('Order#calculateTotal', () => {
  it('sums unitPrice * quantity across items', () => {
    const order = buildOrder([buildItem('10.10', 1), buildItem('20.20', 1)]);

    order.calculateTotal();

    expect(order.total).toBe('30.30');
  });

  it('never returns a floating-point-only-representable rounding error', () => {
    // Same root cause as Item#subtotal: unitPrice/quantity fit within the 19,2 precision the
    // column allows, but Number(unitPrice) * quantity can't represent 99999999999999.99 * 3
    // exactly, so summing floats yields 300000000000020.94 instead of ...20.97.
    const order = buildOrder([buildItem('99999999999999.99', 3), buildItem('10.50', 2)]);

    order.calculateTotal();

    expect(order.total).toBe('300000000000020.97');
  });

  it('returns "0.00" for an order with no items', () => {
    const order = buildOrder([]);

    order.calculateTotal();

    expect(order.total).toBe('0.00');
  });
});
