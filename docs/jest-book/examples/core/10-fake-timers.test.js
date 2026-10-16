// Chapter 10 — fake timers, including the promise trap
afterEach(() => jest.useRealTimers());

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

test('debounce', () => {
  jest.useFakeTimers();
  const save = jest.fn();
  const d = debounce(save, 300);
  d('a');
  jest.advanceTimersByTime(200);
  d('b');
  jest.advanceTimersByTime(299);
  expect(save).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(save).toHaveBeenCalledWith('b');
});

test('Date is faked too', () => {
  jest.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  jest.advanceTimersByTime(1000);
  expect(new Date().toISOString()).toBe('2024-01-01T00:00:01.000Z');
});

test('await-then-timer needs the async API', async () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  (async () => { await Promise.resolve(); setTimeout(fn, 500); })();
  jest.advanceTimersByTime(500);
  expect(fn).not.toHaveBeenCalled(); // timer wasn't registered yet
  await jest.advanceTimersByTimeAsync(500);
  expect(fn).toHaveBeenCalled();
});

test('runAllTimers aborts on endless recursion', () => {
  jest.useFakeTimers();
  const loop = () => setTimeout(loop, 10);
  loop();
  expect(() => jest.runAllTimers()).toThrow(/Aborting after running 100000 timers/);
  jest.clearAllTimers();
});
