// Chapter 7 — mock functions, precedence, clear/reset/restore (Jest 30 semantics)
test('programmed values: once-queue first, then default', () => {
  const h = jest.fn()
    .mockReturnValue('default')
    .mockReturnValueOnce('first')
    .mockImplementationOnce(() => 'second');
  expect([h(), h(), h()]).toEqual(['first', 'second', 'default']);
});

test('mockReturnValue replaces the jest.fn(impl) body', () => {
  expect(jest.fn(() => 'impl').mockReturnValue('rv')()).toBe('rv');
});

test('.mock records calls, results, this', () => {
  const fn = jest.fn((x) => { if (x < 0) throw new Error('neg'); return x * 2; });
  fn(2);
  try { fn(-1); } catch {}
  expect(fn.mock.calls).toEqual([[2], [-1]]);
  expect(fn.mock.results.map((r) => r.type)).toEqual(['return', 'throw']);
  expect(fn.mock.lastCall).toEqual([-1]);
});

test('arguments are stored by reference', () => {
  const m = jest.fn();
  const obj = { n: 1 };
  m(obj);
  obj.n = 2;
  expect(m.mock.calls[0][0].n).toBe(2);
});

test('toHaveBeenCalledWith is strict about argument count', () => {
  const f = jest.fn();
  f('a', undefined);
  expect(f).not.toHaveBeenCalledWith('a');
  expect(f).toHaveBeenCalledWith('a', undefined);
});

test('mockReset on a spy returns undefined; mockRestore brings back the original', () => {
  const obj = { greet: () => 'real' };
  const spy = jest.spyOn(obj, 'greet').mockReturnValue('fake');
  spy.mockReset();
  expect(obj.greet()).toBeUndefined();
  spy.mockRestore();
  expect(obj.greet()).toBe('real');
});

test('restoreAllMocks does not touch plain jest.fn()', () => {
  const fn = jest.fn(() => 'impl');
  fn();
  jest.restoreAllMocks();
  expect(fn()).toBe('impl');
  expect(fn).toHaveBeenCalledTimes(2);
});

test('whenCalledWith (Jest 30.5+)', () => {
  const fn = jest.fn();
  fn.whenCalledWith('apple').mockReturnValue('red');
  fn.whenCalledWith(expect.any(Number)).mockReturnValue('numeric');
  expect([fn('apple'), fn(42), fn('grape')]).toEqual(['red', 'numeric', undefined]);
});
