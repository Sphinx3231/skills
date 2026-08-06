import { render, screen } from '@testing-library/react-native';
import { ThemedText } from '../themed-text';

describe('ThemedText', () => {
  test('renders children text', async () => {
    await render(<ThemedText>Hello Foxxy</ThemedText>);
    expect(screen.getByText('Hello Foxxy')).toBeTruthy();
  });

  test.each(['default', 'title', 'small', 'smallBold', 'subtitle', 'link', 'linkPrimary', 'code'] as const)(
    'renders without crashing for type=%s',
    async (type) => {
      const { toJSON } = await render(<ThemedText type={type}>Styled</ThemedText>);
      expect(toJSON()).toBeTruthy();
    }
  );

  test('applies a themeColor override', async () => {
    const { toJSON } = await render(<ThemedText themeColor="textSecondary">Muted</ThemedText>);
    expect(toJSON()).toBeTruthy();
  });
});
