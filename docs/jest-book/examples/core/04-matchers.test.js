// Chapter 4 — every equality rule in the "famous list" is checked here
class Cat { constructor(name) { this.name = name; } }

test('toBe uses Object.is', () => {
  expect(NaN).toBe(NaN);
  expect(+0).not.toBe(-0);
  expect({ a: 1 }).not.toBe({ a: 1 });
});

test('toEqual ignores undefined props, sparseness and class type', () => {
  expect({ a: undefined, b: 2 }).toEqual({ b: 2 });
  expect([, 1]).toEqual([undefined, 1]);
  expect(new Cat('Tom')).toEqual({ name: 'Tom' });
});

test('toStrictEqual does not', () => {
  expect({ a: undefined, b: 2 }).not.toStrictEqual({ b: 2 });
  expect([, 1]).not.toStrictEqual([undefined, 1]);
  expect(new Cat('Tom')).not.toStrictEqual({ name: 'Tom' });
});

test('toEqual compares Errors by message only', () => {
  expect(new TypeError('x')).toEqual(new Error('x'));
});

test('floats, strings, arrays, objects', () => {
  expect(0.1 + 0.2).toBeCloseTo(0.3);
  expect('Hello World').toMatch(/world/i);
  expect([{ id: 1 }]).toContainEqual({ id: 1 });
  expect([{ id: 1 }]).not.toContain({ id: 1 });
  expect({ a: { b: [1, { c: 2 }] } }).toHaveProperty('a.b[1].c', 2);
  expect([{ a: 1, b: 2 }]).toMatchObject([{ a: 1 }]);
});

test('objectContaining is one level deep; toMatchObject is recursive', () => {
  expect({ a: { b: 1, c: 2 } }).not.toEqual(expect.objectContaining({ a: { b: 1 } }));
  expect({ a: { b: 1, c: 2 } }).toMatchObject({ a: { b: 1 } });
});

test('asymmetric matchers', () => {
  expect({ id: 'u_1', tags: ['a', 'b'], score: 0.30001, n: null }).toEqual({
    id: expect.stringMatching(/^u_\d+$/),
    tags: expect.arrayOf(expect.any(String)),
    score: expect.closeTo(0.3, 3),
    n: null,
  });
  expect(null).not.toEqual(expect.anything());
});

test('toThrow needs a function', () => {
  const withdraw = (n) => { if (n < 0) throw new RangeError('Amount must be positive'); };
  expect(() => withdraw(-1)).toThrow(RangeError);
  expect(() => withdraw(-1)).toThrow('positive');
  expect(() => expect(5).toThrow()).toThrow(/received value must be a function/);
});
