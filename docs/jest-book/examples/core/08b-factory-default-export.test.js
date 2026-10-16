// Chapter 8 §8.2.2 — default exports in factories need __esModule: true
import main, { named } from './src/defaultExport';

jest.mock('./src/defaultExport', () => ({
  __esModule: true,
  default: jest.fn(() => 'mocked default'),
  named: jest.fn(() => 'mocked named'),
}));

test('default and named exports are mocked', () => {
  expect(main()).toBe('mocked default');
  expect(named()).toBe('mocked named');
});
