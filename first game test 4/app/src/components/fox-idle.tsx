import { Image, type ImageSource } from 'expo-image';

import type { FoxIdleKind } from '@/lib/fox-idle';

const SOURCES: Record<FoxIdleKind, ImageSource> = {
  stand: require('@/assets/Gifs/foxidle_01_stand.gif'),
  calm: require('@/assets/Gifs/foxidle_02_calm.gif'),
  sleepy: require('@/assets/Gifs/foxidle_03_sleepy.gif'),
  happy: require('@/assets/Gifs/foxidle_04_happy.gif'),
  excited: require('@/assets/Gifs/foxidle_05_excited.gif'),
  asleep: require('@/assets/Gifs/foxidle_06_asleep.gif'),
};

/**
 * A single always-looping idle GIF for the given mood-derived kind. Dumb and
 * presentational on purpose — `reduceMotion` is passed in rather than read
 * via `useReduceMotion()` here, matching `FoxMoment`'s split between
 * hook-driven screens and dumb GIF renderers, so this stays easy to test
 * with an explicit prop instead of mocking the hook per call site.
 *
 * `autoplay={!reduceMotion}` freezes the GIF on its first frame rather than
 * looping when the OS accessibility setting is on — Foxxy is never a still
 * PNG under normal use, but an explicit reduce-motion request still wins.
 */
export function FoxIdle({
  kind,
  size = 220,
  reduceMotion,
}: {
  kind: FoxIdleKind;
  size?: number;
  reduceMotion: boolean;
}) {
  return (
    <Image
      source={SOURCES[kind]}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay={!reduceMotion}
      accessibilityLabel="Foxxy"
    />
  );
}
