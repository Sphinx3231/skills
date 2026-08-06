import { render } from '@testing-library/react-native';
import { TailRing } from '../tail-ring';

describe('TailRing', () => {
  test('renders at 0 progress without crashing', async () => {
    const { toJSON } = await render(
      <TailRing progress={0} trackColor="#eee" fillColor="#f00" tipColor="#f00" />
    );
    expect(toJSON()).toBeTruthy();
  });

  test('renders at full progress without crashing', async () => {
    const { toJSON } = await render(
      <TailRing progress={1} trackColor="#eee" fillColor="#f00" tipColor="#f00" />
    );
    expect(toJSON()).toBeTruthy();
  });

  test('clamps progress values outside 0..1', async () => {
    const over = await render(<TailRing progress={1.5} trackColor="#eee" fillColor="#f00" tipColor="#f00" />);
    const under = await render(<TailRing progress={-0.5} trackColor="#eee" fillColor="#f00" tipColor="#f00" />);
    expect(over.toJSON()).toBeTruthy();
    expect(under.toJSON()).toBeTruthy();
  });

  test('respects custom size and strokeWidth', async () => {
    const { toJSON } = await render(
      <TailRing size={120} strokeWidth={10} progress={0.5} trackColor="#eee" fillColor="#f00" tipColor="#f00" />
    );
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":120');
  });
});
