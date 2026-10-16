import { mount } from '@vue/test-utils';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Counter from './Counter.vue';
test('VTU: increments and emits', async () => {
  const wrapper = mount(Counter, { props: { start: 1 } });
  await wrapper.get('button').trigger('click');
  expect(wrapper.get('[data-testid="count"]').text()).toBe('Count: 2');
  expect(wrapper.emitted('changed')).toEqual([[2]]);
});
test('TL: shows alert at max', async () => {
  const user = userEvent.setup();
  render(Counter, { props: { start: 2, max: 3 } });
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Max reached');
});
