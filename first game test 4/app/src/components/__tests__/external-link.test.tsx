import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExternalLink } from '../external-link';

const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

describe('ExternalLink', () => {
  afterEach(() => jest.clearAllMocks());

  test('renders its children', async () => {
    await render(
      <ExternalLink href="https://docs.expo.dev">
        <Text>Docs</Text>
      </ExternalLink>
    );
    expect(screen.getByText('Docs')).toBeTruthy();
  });

  test('opens an in-app browser instead of the default handler on native', async () => {
    const originalOS = process.env.EXPO_OS;
    process.env.EXPO_OS = 'ios';

    await render(
      <ExternalLink href="https://docs.expo.dev">
        <Text>Docs</Text>
      </ExternalLink>
    );
    fireEvent.press(screen.getByText('Docs'));

    await new Promise((r) => setTimeout(r, 0));
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://docs.expo.dev', { presentationStyle: 'AUTOMATIC' });

    process.env.EXPO_OS = originalOS;
  });

  // Note: the `EXPO_OS !== 'web'` check in ExternalLink is inlined to a
  // compile-time constant by babel-preset-expo based on the build platform
  // (jest-expo's default test platform is "ios"), so mutating
  // process.env.EXPO_OS at runtime has no effect here — the web branch
  // can't be exercised from this test file.
});
