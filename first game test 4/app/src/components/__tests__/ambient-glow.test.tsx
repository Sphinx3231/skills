import { render } from '@testing-library/react-native';
import { AmbientGlow } from '../ambient-glow';

describe('AmbientGlow', () => {
  test('renders with the default "warm" variant when none is given', async () => {
    const { toJSON } = await render(<AmbientGlow />);
    expect(toJSON()).toBeTruthy();
  });

  test('renders the "cool" variant', async () => {
    const { toJSON } = await render(<AmbientGlow variant="cool" />);
    expect(toJSON()).toBeTruthy();
  });
});
