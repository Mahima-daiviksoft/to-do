// Chapter 19 / 38 — property-based testing with fast-check
const fc = require('fast-check');

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

test('slugify only produces safe characters and is idempotent', () => {
  fc.assert(fc.property(fc.string(), (s) => /^[a-z0-9-]*$/.test(slugify(s)) && slugify(slugify(s)) === slugify(s)));
});

test('fast-check shrinks a failure to the smallest counterexample', () => {
  const buggyMax = (arr) => arr.reduce((m, x) => (x > m ? x : m), 0); // bug: starts at 0
  expect(() =>
    fc.assert(fc.property(fc.array(fc.integer(), { minLength: 1 }), (arr) => buggyMax(arr) === Math.max(...arr)), { seed: 42 }),
  ).toThrow(/Counterexample: \[\[-1\]\]/);
});
