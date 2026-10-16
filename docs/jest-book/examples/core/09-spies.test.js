// Chapter 9 — spies and their classic blind spot
import * as math from './src/math';

test('a spy sees calls through the exports object, not internal calls', () => {
  jest.spyOn(math, 'add').mockReturnValue(100);
  expect(math.add(1, 1)).toBe(100);
  expect(math.double(2)).toBe(4); // internal call used the real add
});

test('getter spies and replaceProperty', () => {
  const settings = { get theme() { return 'light'; }, retries: 3 };
  jest.spyOn(settings, 'theme', 'get').mockReturnValue('dark');
  jest.replaceProperty(settings, 'retries', 5);
  expect(settings.theme).toBe('dark');
  expect(settings.retries).toBe(5);
});

test('spyOn errors are explicit', () => {
  expect(() => jest.spyOn({}, 'nope')).toThrow('Property `nope` does not exist in the provided object');
  expect(() => jest.spyOn({ a: 1 }, 'a')).toThrow(/use `jest.replaceProperty/);
});

test('silencing and asserting console.error', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  console.error('invalid input: ###');
  expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid input'));
});
