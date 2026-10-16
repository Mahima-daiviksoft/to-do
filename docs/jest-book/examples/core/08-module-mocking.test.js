// Chapter 8 — jest.mock is hoisted above the imports
import { displayName } from './src/userService';
import { getUser } from './src/api';

jest.mock('./src/api'); // automock: getUser becomes jest.fn() returning undefined

test('automocked function returns undefined until programmed', async () => {
  await expect(displayName(1)).resolves.toBe('Unknown user');
});

test('program the mock per test', async () => {
  jest.mocked(getUser).mockResolvedValue({ first: 'Ann', last: 'Lee' });
  await expect(displayName(1)).resolves.toBe('Ann Lee');
  expect(getUser).toHaveBeenCalledWith(1);
});

test('requireActual gives you the real module', async () => {
  const real = jest.requireActual('./src/api');
  await expect(real.getUser(1)).rejects.toThrow('real network call');
});

test('isolateModules gives a fresh registry', () => {
  let a;
  let b;
  jest.isolateModules(() => { a = require('./src/math'); });
  jest.isolateModules(() => { b = require('./src/math'); });
  expect(a).not.toBe(b);
});
