import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PressableScale } from '../pressable-scale';

describe('PressableScale', () => {
  test('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale onPress={onPress}>
        <Text>Tap me</Text>
      </PressableScale>
    );
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale onPress={onPress} disabled>
        <Text>Disabled</Text>
      </PressableScale>
    );
    fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('runs press-in/press-out handlers without crashing', async () => {
    await render(
      <PressableScale onPress={() => {}}>
        <Text>Press physics</Text>
      </PressableScale>
    );
    const node = screen.getByText('Press physics');
    fireEvent(node, 'pressIn');
    fireEvent(node, 'pressOut');
  });
});
