import { render } from '@testing-library/react-native';
import { PawPrint } from '../paw-print';

describe('PawPrint', () => {
  test('renders with its default size, color, and opacity', async () => {
    const { toJSON } = await render(<PawPrint />);
    expect(toJSON()).toBeTruthy();
  });

  test('renders with custom size, color, and opacity props', async () => {
    const { toJSON } = await render(<PawPrint size={72} color="#2B1B13" opacity={0.14} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":72');
  });
});
