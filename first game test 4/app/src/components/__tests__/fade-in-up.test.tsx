import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FadeInUp } from '../fade-in-up';

describe('FadeInUp', () => {
  test('renders its children', async () => {
    await render(
      <FadeInUp>
        <Text>Hello</Text>
      </FadeInUp>
    );
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  test('accepts a delay prop without crashing', async () => {
    await render(
      <FadeInUp delay={200}>
        <Text>Delayed</Text>
      </FadeInUp>
    );
    expect(screen.getByText('Delayed')).toBeTruthy();
  });
});
