// Chapter 20 — custom matcher + custom equality tester
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${this.utils.printReceived(received)} ${this.isNot ? 'not ' : ''}to be within ${floor}..${ceiling}`,
    };
  },
});

class Money {
  constructor(amount, currency) { this.amount = amount; this.currency = currency; this.cache = Math.random(); }
}
expect.addEqualityTesters([
  function moneyEquals(a, b) {
    const isA = a instanceof Money;
    const isB = b instanceof Money;
    if (isA && isB) return a.amount === b.amount && a.currency === b.currency;
    if (isA === isB) return undefined;
    return false;
  },
]);

test('custom matcher, negated and asymmetric', () => {
  expect(5).toBeWithinRange(1, 10);
  expect(50).not.toBeWithinRange(1, 10);
  expect({ n: 5 }).toEqual({ n: expect.toBeWithinRange(1, 10) });
});

test('custom equality ignores the cache field', () => {
  expect(new Money(5, 'EUR')).toEqual(new Money(5, 'EUR'));
  expect(new Money(5, 'EUR')).not.toEqual(new Money(5, 'USD'));
});
