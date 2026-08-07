import { render } from '@testing-library/react-native';
import { FoxWardrobeOverlay } from '../fox-wardrobe-overlay';

describe('FoxWardrobeOverlay', () => {
  test('renders without crashing when nothing is worn', async () => {
    const { toJSON } = await render(<FoxWardrobeOverlay kind="happy" />);
    expect(toJSON()).toBeTruthy();
  });

  test('renders every accessory (by its specific testID) when all are worn on a kind with no baked-in scarf', async () => {
    const { getByTestId } = await render(
      <FoxWardrobeOverlay kind="happy" wearingScarf wearingHat wearingBackpack wearingCrown />
    );
    expect(getByTestId('wardrobe-scarf')).toBeTruthy();
    expect(getByTestId('wardrobe-hat')).toBeTruthy();
    expect(getByTestId('wardrobe-backpack')).toBeTruthy();
    expect(getByTestId('wardrobe-crown')).toBeTruthy();
  });

  test('respects a custom size prop', async () => {
    const { toJSON } = await render(<FoxWardrobeOverlay kind="happy" size={64} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":64');
  });

  test('renders each accessory individually by its specific testID', async () => {
    for (const [testID, props] of [
      ['wardrobe-scarf', { wearingScarf: true }],
      ['wardrobe-hat', { wearingHat: true }],
      ['wardrobe-backpack', { wearingBackpack: true }],
      ['wardrobe-crown', { wearingCrown: true }],
    ] as const) {
      const { getByTestId } = await render(<FoxWardrobeOverlay kind="happy" {...props} />);
      expect(getByTestId(testID)).toBeTruthy();
    }
  });

  // `stand` and `calm` are the only two idle GIFs the app ever layers
  // accessories over, and both already have a bandana painted into the
  // artwork (verified by reading the actual GIF frames) — see the
  // KINDS_WITH_BAKED_IN_BANDANA comment in fox-wardrobe-overlay.tsx. Scarf
  // still renders on these two kinds (the "Cozy scarf" unlock must remain
  // visible), but as the distinct `ScarfCozyWrap` design, not the default
  // `Scarf`.
  test.each(['stand', 'calm'] as const)(
    'renders the cozy-wrap Scarf variant (not the default) for %s, which already has a baked-in bandana',
    async (kind) => {
      const { getByTestId, queryByTestId } = await render(<FoxWardrobeOverlay kind={kind} wearingScarf />);
      // Still present under the same testID other call sites rely on...
      expect(getByTestId('wardrobe-scarf')).toBeTruthy();
      // ...but it's the cozy-wrap variant specifically, not the default one.
      expect(getByTestId('wardrobe-scarf-cozy-wrap')).toBeTruthy();
      expect(queryByTestId('wardrobe-scarf-default-band')).toBeNull();
    }
  );

  // `react-native-svg`'s test-renderer output encodes color props as
  // `{type, payload}` (an ARGB int), not the literal hex string, so
  // asserting on a hex substring in the rendered tree doesn't work here.
  // Instead, render both variants and compare the actual `fill` payload on
  // each variant's band/path — proving the color genuinely differs, not
  // just that two different-looking hex strings were typed into the source.
  test.each(['stand', 'calm'] as const)('cozy-wrap Scarf uses a different fill color than the default Scarf for %s', async (kind) => {
    const cozy = await render(<FoxWardrobeOverlay kind={kind} wearingScarf />);
    const cozyFill = cozy.getByTestId('wardrobe-scarf-cozy-wrap').props.children[0].props.fill;

    const defaultRender = await render(<FoxWardrobeOverlay kind="happy" wearingScarf />);
    const defaultFill = defaultRender.getByTestId('wardrobe-scarf-default-band').props.fill;

    expect(cozyFill).toBeTruthy();
    expect(defaultFill).toBeTruthy();
    expect(cozyFill).not.toEqual(defaultFill);
  });

  test('renders the default Scarf design (not the cozy wrap) for a kind without a baked-in bandana', async () => {
    const { getByTestId, queryByTestId } = await render(<FoxWardrobeOverlay kind="happy" wearingScarf />);
    expect(getByTestId('wardrobe-scarf')).toBeTruthy();
    expect(getByTestId('wardrobe-scarf-default-band')).toBeTruthy();
    expect(queryByTestId('wardrobe-scarf-cozy-wrap')).toBeNull();
  });
});
