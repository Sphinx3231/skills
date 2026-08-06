import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemedView } from '../themed-view';

describe('ThemedView', () => {
  test('renders children', async () => {
    await render(
      <ThemedView>
        <Text>Inside</Text>
      </ThemedView>
    );
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  test.each(['background', 'backgroundElement', 'backgroundSelected', 'accent', 'accentSoft'] as const)(
    'renders without crashing for type=%s',
    async (type) => {
      const { toJSON } = await render(<ThemedView type={type} />);
      expect(toJSON()).toBeTruthy();
    }
  );
});
