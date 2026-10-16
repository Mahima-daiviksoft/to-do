// Chapter 3 & 6 — structure, .each, and the exact hook order
const log = [];

beforeAll(() => log.push('1 - beforeAll'));
beforeEach(() => log.push('1 - beforeEach'));
afterEach(() => log.push('1 - afterEach'));

test('outer', () => {
  log.push('1 - test');
});

describe('Scoped', () => {
  beforeAll(() => log.push('2 - beforeAll'));
  beforeEach(() => log.push('2 - beforeEach'));
  afterEach(() => log.push('2 - afterEach'));
  test('inner', () => {
    log.push('2 - test');
  });
});

test('hooks ran in the documented order', () => {
  expect(log).toEqual([
    '1 - beforeAll',
    '1 - beforeEach', '1 - test', '1 - afterEach',
    '2 - beforeAll',
    '1 - beforeEach', '2 - beforeEach', '2 - test', '2 - afterEach', '1 - afterEach',
    '1 - beforeEach', // for this very test
  ]);
});

test.each([
  [1, 1, 2],
  [2, 3, 5],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(a + b).toBe(expected);
});

test.each`
  input    | expected
  ${'abc'} | ${3}
  ${''}    | ${0}
`('length of "$input" is $expected', ({ input, expected }) => {
  expect(input).toHaveLength(expected);
});

test.failing('documents a known bug: floating point', () => {
  expect(0.1 + 0.2).toBe(0.3); // fails → test.failing passes
});

test.todo('write a test for the next feature');
