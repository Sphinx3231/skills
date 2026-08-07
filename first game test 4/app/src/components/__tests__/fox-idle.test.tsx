import { render } from '@testing-library/react-native';
import { FoxIdle } from '../fox-idle';
import type { FoxIdleKind } from '@/lib/fox-idle';

// Maps each kind to the specific GIF filename it must load — asserted
// below via the mocked Image's `testUri`, not just "something rendered".
const KIND_TO_FILENAME: Record<FoxIdleKind, string> = {
  stand: 'foxidle_01_stand.gif',
  calm: 'foxidle_02_calm.gif',
  sleepy: 'foxidle_03_sleepy.gif',
  happy: 'foxidle_04_happy.gif',
  excited: 'foxidle_05_excited.gif',
  asleep: 'foxidle_06_asleep.gif',
};
const KINDS = Object.keys(KIND_TO_FILENAME) as FoxIdleKind[];

describe('FoxIdle', () => {
  test('renders without crashing for every idle kind', async () => {
    for (const kind of KINDS) {
      const { toJSON } = await render(<FoxIdle kind={kind} reduceMotion={false} />);
      expect(toJSON()).toBeTruthy();
    }
  });

  test('loads the specific GIF asset for each idle kind', async () => {
    for (const [kind, filename] of Object.entries(KIND_TO_FILENAME) as [FoxIdleKind, string][]) {
      const { toJSON } = await render(<FoxIdle kind={kind} reduceMotion={false} />);
      expect(JSON.stringify(toJSON())).toContain(filename);
    }
  });

  test('sets the Foxxy accessibility label', async () => {
    const { getByLabelText } = await render(<FoxIdle kind="stand" reduceMotion={false} />);
    expect(getByLabelText('Foxxy')).toBeTruthy();
  });

  test('respects a custom size prop', async () => {
    const { toJSON } = await render(<FoxIdle kind="stand" size={64} reduceMotion={false} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":64');
  });

  test('passes autoplay=true through to the underlying Image when reduce motion is off', async () => {
    const { toJSON } = await render(<FoxIdle kind="stand" reduceMotion={false} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"autoplay":true');
  });

  test('passes autoplay=false through to the underlying Image when reduce motion is on, freezing on a static frame', async () => {
    const { toJSON } = await render(<FoxIdle kind="stand" reduceMotion={true} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"autoplay":false');
  });
});
