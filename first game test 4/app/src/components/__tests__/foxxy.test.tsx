import { render } from '@testing-library/react-native';
import { Foxxy } from '../foxxy';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

jest.mock('@/hooks/use-reduce-motion');
const mockedUseReduceMotion = useReduceMotion as jest.MockedFunction<typeof useReduceMotion>;

describe('Foxxy', () => {
  beforeEach(() => {
    mockedUseReduceMotion.mockReturnValue(false);
  });

  test('renders without crashing for every idle kind', async () => {
    for (const kind of ['stand', 'calm', 'sleepy', 'happy', 'excited', 'asleep'] as const) {
      const { toJSON } = await render(<Foxxy kind={kind} />);
      expect(toJSON()).toBeTruthy();
    }
  });

  test('does not render a wardrobe overlay when nothing is worn', async () => {
    const { queryByLabelText, toJSON } = await render(<Foxxy kind="stand" />);
    expect(queryByLabelText('Foxxy')).toBeTruthy();
    // Only one Svg (from FoxWardrobeOverlay) would appear if worn; with
    // nothing worn the overlay branch shouldn't mount at all.
    const tree = JSON.stringify(toJSON());
    expect(tree.includes('RNSVGSvgView')).toBe(false);
  });

  test('renders the wardrobe overlay on top when any accessory is worn', async () => {
    const { toJSON } = await render(<Foxxy kind="happy" wearingScarf />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('RNSVGSvgView');
  });

  test('renders each individual accessory (by its specific testID) on a kind with no baked-in scarf', async () => {
    for (const [testID, props] of [
      ['wardrobe-scarf', { wearingScarf: true }],
      ['wardrobe-hat', { wearingHat: true }],
      ['wardrobe-backpack', { wearingBackpack: true }],
      ['wardrobe-crown', { wearingCrown: true }],
    ] as const) {
      const { getByTestId } = await render(<Foxxy kind="happy" {...props} />);
      expect(getByTestId(testID)).toBeTruthy();
    }
  });

  // stand/calm are the only kinds the app actually renders with wearingX
  // props (Companion hero + the wardrobe grid), and both already have a
  // bandana baked into the GIF art — Foxxy must forward `kind` to
  // FoxWardrobeOverlay so the cozy-wrap variant actually renders here (not
  // the default Scarf), not just in FoxWardrobeOverlay's own unit tests.
  // The scarf must stay visible — not suppressed — so the "Cozy scarf"
  // unlock is never permanently invisible on the only two kinds that ever
  // render it.
  test.each(['stand', 'calm'] as const)(
    'renders the cozy-wrap scarf variant for %s instead of suppressing it',
    async (kind) => {
      const { getByTestId, queryByTestId } = await render(<Foxxy kind={kind} wearingScarf />);
      expect(getByTestId('wardrobe-scarf')).toBeTruthy();
      expect(getByTestId('wardrobe-scarf-cozy-wrap')).toBeTruthy();
      expect(queryByTestId('wardrobe-scarf-default-band')).toBeNull();
    }
  );

  test('passes reduceMotion from the hook down to the idle GIF as autoplay', async () => {
    mockedUseReduceMotion.mockReturnValue(true);
    const { toJSON } = await render(<Foxxy kind="stand" />);
    expect(JSON.stringify(toJSON())).toContain('"autoplay":false');
  });

  test('respects a custom size prop', async () => {
    const { toJSON } = await render(<Foxxy kind="stand" size={64} />);
    expect(JSON.stringify(toJSON())).toContain('"width":64');
  });
});
