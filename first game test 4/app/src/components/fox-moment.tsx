import { useEffect } from 'react';
import { Image, type ImageSource } from 'expo-image';

import { FOX_MOMENT_DURATIONS, type FoxMomentKind } from '@/lib/fox-moments';

const SOURCES: Record<FoxMomentKind, ImageSource> = {
  wave: require('@/assets/Gifs/fox_01_wave.gif'),
  sleepy: require('@/assets/Gifs/fox_02_sleepy.gif'),
  celebrate: require('@/assets/Gifs/fox_03_celebrate.gif'),
  resting: require('@/assets/Gifs/fox_04_resting.gif'),
  order: require('@/assets/Gifs/fox_05_order.gif'),
};

/**
 * A one-shot GIF moment layered around Foxxy's looping idle GIF for a
 * specific event (wave/sleepy/celebrate/resting/order). Plays once, then
 * calls onDone so the caller can swap back to the persistent idle GIF —
 * this never replaces Foxxy itself.
 */
export function FoxMoment({
  kind,
  size = 116,
  onDone,
}: {
  kind: FoxMomentKind;
  size?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDone, FOX_MOMENT_DURATIONS[kind]);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone identity isn't expected to change mid-moment
  }, [kind]);

  return (
    <Image
      source={SOURCES[kind]}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Foxxy"
    />
  );
}
