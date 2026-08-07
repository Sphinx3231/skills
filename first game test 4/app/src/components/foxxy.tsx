import { StyleSheet, View } from 'react-native';

import { FoxIdle } from '@/components/fox-idle';
import { FoxWardrobeOverlay } from '@/components/fox-wardrobe-overlay';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import type { FoxIdleKind } from '@/lib/fox-idle';

/**
 * Composite entry point that replaces `FoxCompanion` at every call site: a
 * looping idle GIF (`FoxIdle`) with wardrobe accessories (`FoxWardrobeOverlay`)
 * absolutely positioned on top when any are worn. Reads `useReduceMotion()`
 * itself so call sites don't each need to thread it through — `FoxIdle`
 * underneath stays a dumb, prop-driven renderer.
 */
export function Foxxy({
  kind,
  size = 220,
  wearingScarf = false,
  wearingHat = false,
  wearingBackpack = false,
  wearingCrown = false,
}: {
  kind: FoxIdleKind;
  size?: number;
  wearingScarf?: boolean;
  wearingHat?: boolean;
  wearingBackpack?: boolean;
  wearingCrown?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const wearingAnything = wearingScarf || wearingHat || wearingBackpack || wearingCrown;

  return (
    <View style={{ width: size, height: size }}>
      <FoxIdle kind={kind} size={size} reduceMotion={reduceMotion} />
      {wearingAnything && (
        <View style={styles.overlay} pointerEvents="none">
          <FoxWardrobeOverlay
            kind={kind}
            size={size}
            wearingScarf={wearingScarf}
            wearingHat={wearingHat}
            wearingBackpack={wearingBackpack}
            wearingCrown={wearingCrown}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0 },
});
