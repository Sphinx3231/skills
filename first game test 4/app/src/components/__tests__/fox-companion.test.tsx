import { render } from '@testing-library/react-native';
import { FoxCompanion } from '../fox-companion';

describe('FoxCompanion', () => {
  test('renders without crashing for every mood', async () => {
    for (const mood of ['empty', 'onTarget', 'over', 'neutral'] as const) {
      const { toJSON } = await render(<FoxCompanion mood={mood} />);
      expect(toJSON()).toBeTruthy();
    }
  });

  test('renders with every accessory combination enabled', async () => {
    const { toJSON } = await render(
      <FoxCompanion mood="onTarget" wearingScarf wearingHat wearingBackpack wearingCrown />
    );
    expect(toJSON()).toBeTruthy();
  });

  test('respects a custom size prop', async () => {
    const { toJSON } = await render(<FoxCompanion size={64} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":64');
  });

  test('runs the scheduled blink animation without crashing, including after unmount', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<FoxCompanion />);

    jest.advanceTimersByTime(5000);
    unmount();
    jest.advanceTimersByTime(5000);

    jest.useRealTimers();
  });
});
