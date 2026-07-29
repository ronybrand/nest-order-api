import Decimal from 'decimal.js';
import { Item } from './item.entity';

function buildItem(unitPrice: string, quantity: number): Item {
  const item = new Item();
  item.unitPrice = unitPrice;
  item.quantity = quantity;
  return item;
}

describe('Item#subtotal', () => {
  it('multiplies unitPrice by quantity', () => {
    expect(buildItem('10.50', 3).subtotal()).toBe('31.50');
  });

  it('never returns a floating-point-only-representable rounding error', () => {
    // 99999999999999.99 * 3 = 299999999999999.97 exactly (an integer number of cents).
    // Number('99999999999999.99') cannot represent that value exactly, so multiplying as a
    // float first yields 299999999999999.94 — one cent off. unitPrice/quantity fit within the
    // 19,2 precision the `unit_price` column allows, so the entity must not depend on the DTO's
    // MAX_UNIT_PRICE guard to stay correct.
    expect(buildItem('99999999999999.99', 3).subtotal()).toBe('299999999999999.97');
  });
});

describe('Decimal.js safety assumptions relied on by Item/Order', () => {
  it('constructs from a number via its shortest round-trip decimal string, not raw binary bits', () => {
    // Unlike `new BigDecimal(double)` in Java, or `Decimal(float)` in Python — both of which
    // import the double's exact binary expansion (0.1 -> 0.1000000000000000055511151231257827...)
    // — decimal.js's `number` constructor goes through the same shortest-round-trip stringification
    // as `String(number)`. This is why item.entity.ts/order.entity.ts only *require* unitPrice/total
    // to be `string`-typed as a discipline, not because `new Decimal(number)` would be unsafe today.
    // If a future decimal.js major version changed this, this test would catch it.
    expect(new Decimal(0.1).toString()).toBe('0.1');
  });

  it('never throws on a non-terminating division — it silently rounds to the global precision', () => {
    // Unlike `BigDecimal.ONE.divide(new BigDecimal("3"))` in Java, which throws
    // ArithmeticException without an explicit RoundingMode, decimal.js (like Python's
    // decimal.Decimal) rounds silently to `Decimal.precision` significant digits. Any future
    // division of money in this domain must explicitly round to 2 decimal places itself —
    // never rely on this default reaching the `decimal(19,2)` column uncorrected.
    expect(() => new Decimal(1).dividedBy(3)).not.toThrow();
    expect(new Decimal(1).dividedBy(3).toString()).toBe('0.33333333333333333333');
  });
});
