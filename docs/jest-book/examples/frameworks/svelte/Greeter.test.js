import { mount, unmount, flushSync } from 'svelte';
import Greeter from './Greeter.svelte';
test('renders and updates', () => {
  const target = document.createElement('div');
  const app = mount(Greeter, { target, props: { name: 'Ann' } });
  expect(target.querySelector('h1').textContent).toBe('Hello Ann!');
  target.querySelector('button').click();
  flushSync();
  expect(target.querySelector('button').textContent).toBe('Clicked 1');
  unmount(app);
});
