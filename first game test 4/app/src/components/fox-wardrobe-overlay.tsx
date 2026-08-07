import Svg, { G, Path, Polygon, Rect, Circle, Ellipse } from 'react-native-svg';

import type { FoxIdleKind } from '@/lib/fox-idle';

// Same ink used by the retired hand-drawn SVG fox, kept so these accessories
// still read as part of the same painted style layered over the idle GIFs.
const INK = '#5a3320';

// `stand` and `calm` are the only two idle GIFs the app ever renders
// wardrobe accessories over (Companion hero + the wardrobe grid, which is
// always `stand`; Dashboard never passes wearingX props). Both of those GIF
// frames already have a blue bandana with a paw print painted into the
// artwork itself — confirmed by looking at the actual frames
// (`foxidle_01_stand.gif` / `foxidle_02_calm.gif`), not assumed. The
// original `#3f7dd6` Scarf (same blue, same neck position) would have
// painted a near-duplicate directly over that bandana, which is why an
// earlier pass suppressed it outright for these two kinds. Suppression
// meant the "Cozy scarf" wardrobe unlock was permanently invisible on the
// only two idle kinds any call site ever renders it on — a real regression
// (flagged by the CTO gate), not an acceptable trade-off. Fixed by giving
// these two kinds a *different* Scarf design instead of hiding it: see
// `ScarfCozyWrap` below.
const KINDS_WITH_BAKED_IN_BANDANA: readonly FoxIdleKind[] = ['stand', 'calm'];

/**
 * Transparent overlay of the wardrobe accessory SVG paths, extracted
 * verbatim from the retired `FoxCompanion` (same `d`/`points` path data,
 * same `viewBox="0 0 200 200"` coordinate space) so it can be layered on
 * top of an idle GIF sized to match. Each accessory's *position* (not its
 * path data) is retargeted below to actually land on `stand`/`calm`'s real
 * body — see the per-accessory comments for how each number was derived;
 * `FoxCompanion`'s original coordinates assumed a hand-drawn body that no
 * longer exists underneath this overlay. `Scarf` itself gets swapped for a
 * differently-colored/-shaped `ScarfCozyWrap` on `stand`/`calm` specifically
 * — see `KINDS_WITH_BAKED_IN_BANDANA` below — so the "Cozy scarf" unlock
 * still visibly changes something on the only two kinds it's ever rendered
 * on, instead of being suppressed into invisibility.
 */
export function FoxWardrobeOverlay({
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
  const hasBakedInBandana = KINDS_WITH_BAKED_IN_BANDANA.includes(kind);

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {wearingBackpack && <Backpack />}
      {wearingScarf && (hasBakedInBandana ? <ScarfCozyWrap /> : <Scarf />)}
      {wearingHat && <Hat />}
      {wearingCrown && <Crown />}
    </Svg>
  );
}

function Scarf() {
  return (
    <G testID="wardrobe-scarf">
      <Path
        testID="wardrobe-scarf-default-band"
        d="M62 118 C80 134 120 134 138 118 L138 132 C120 146 80 146 62 132 Z"
        fill="#3f7dd6"
        stroke={INK}
        strokeWidth={2.5}
      />
      <Rect x="94" y="128" width="14" height="26" rx="4" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} />
      <Path d="M97 138 l4 4 6 -8" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

// A chunky knit wrap for `stand`/`calm`, redrawn after tech-lead review
// rejected an earlier draft on three measured points (see this file's git
// history / the outcome doc's "Scarf visibility fix" section for the full
// rejection). Re-measured the real silhouette by screenshotting
// `foxidle_01_stand.gif`/`foxidle_02_calm.gif` at the app's own
// `object-fit:contain` 220x220 geometry and scanning per-row non-background
// runs (same method as the Backpack/Hat/Crown fix): at viewBox y125-132 —
// where this band sits — the body spans roughly x64-128 (stand) / x64-127
// (calm), narrowing from there, while the tail is a *separate* silhouette
// run starting around x125-130 at y135+ and widening below that. So the
// band below is kept inside x70-120 (a few units of margin inside the
// measured x64-128 window, comfortably clear of the tail's x125+ start on
// both frames) instead of the previous x50-150, which overhung the
// silhouette on both sides and crossed onto the tail on the right.
//
// It's drawn as a single tapered band that dips down in the middle (a
// bezier "drape" curve, thicker at center than at the shoulders) rather
// than a flat rectangle, so it follows the body's contour instead of
// reading as a straight plank. Fill is `protein`/dusty-berry (`#B85C6B`
// from `theme.ts`) — an earth-tone rose-brown nowhere near `Backpack`'s
// green (`#5b8c5a`) or the bandana's blue, chosen so it reads distinctly
// against the fox's orange fur too. Stroke is `INK`, matching every other
// accessory in this file (the rejected draft used its own green
// `#2f4a37`, which was itself part of the "reads as one object with the
// Backpack" problem).
//
// Backpack-coexistence claim, verified this time by actually compositing
// both together (not asserted): `Backpack`'s rendered bbox, per its own
// `translate(-73,14)` below, is x55-85/y140-178. This band's own bbox is
// x70-120/y128-150 — the two do overlap in a small x70-85/y140-150 corner
// (the drape curve's left shoulder dips into the Backpack's top-right
// corner there), but the two fringed tails — the most visually prominent
// part of the wrap, the part most likely to be mistaken for merging with
// the Backpack — are placed at x90-112, entirely clear of the Backpack's
// x55-85 span. Composited screenshot of both accessories together on
// `stand.gif`/`calm.gif` (headless-Chromium, scratch files outside the
// repo) confirmed the Backpack's own fill color remains visible and
// distinct from the wrap at every backpack pixel; only a thin sliver of
// the band's stroke outline touches the Backpack's top-right corner, not
// a fill-on-fill collision.
function ScarfCozyWrap() {
  const wrap = '#B85C6B';
  return (
    <G testID="wardrobe-scarf">
      <G testID="wardrobe-scarf-cozy-wrap">
        <Path
          d="M70 128 C80 140 106 140 120 128 L120 136 C106 150 80 150 70 136 Z"
          fill={wrap}
          stroke={INK}
          strokeWidth={2.5}
        />
        <Path d="M75 133 C85 141 105 141 115 133" stroke={INK} strokeWidth={1.3} opacity={0.55} fill="none" />
        <Path d="M75 138 C85 146 105 146 115 138" stroke={INK} strokeWidth={1.3} opacity={0.55} fill="none" />
        <Rect x="90" y="140" width="10" height="30" rx="4" fill={wrap} stroke={INK} strokeWidth={2.5} />
        <Rect x="102" y="140" width="10" height="30" rx="4" fill={wrap} stroke={INK} strokeWidth={2.5} />
        <Path d="M92 170 L90 178 M95 170 L95 179 M98 170 L100 178" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <Path d="M104 170 L102 178 M107 170 L107 179 M110 170 L112 178" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      </G>
    </G>
  );
}

// These coordinates are not eyeballed: `stand.gif`/`calm.gif` were rendered
// at the same 220x220, contentFit="contain" geometry this overlay uses
// (via a headless-Chromium screenshot of an `object-fit:contain` `<img>`),
// then scanned pixel-by-pixel (non-background-color bounding boxes and
// per-column/per-row silhouette profiles) to find the real head/body/tail
// positions. See docs/outcomes/foxxy-idle-gifs-outcome.md for the measured
// numbers this was derived from. `contentFit="contain"` letterboxes these
// portrait GIFs left/right, not top/bottom (height is the constraining
// dimension), so a fraction of the *measured* image is a direct viewBox
// coordinate (`frac * 200`) — no separate letterbox correction needed once
// measured this way.
//
// Measured head-top (the fur tuft between the ears, not the ear tips) sits
// at y-fraction ≈0.16 → viewBox y≈32; the head's horizontal center sits at
// x-fraction ≈0.445 → viewBox x≈89, not the original artwork's x=100.
// Hat/Crown are shifted left by 10 and vertically rescaled so their base
// lands on y≈32 (resting on the fur) instead of the original y54/y48
// (which landed down over the eyebrows, reading as floating above the
// head).
function Hat() {
  return (
    <G testID="wardrobe-hat" transform="translate(-10,4) scale(1,0.52)">
      <Ellipse cx="100" cy="54" rx="36" ry="7" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} />
      <Path d="M78 54 L82 18 Q100 6 118 18 L122 54 Z" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x="79" y="42" width="42" height="8" fill="#f4c542" />
    </G>
  );
}

// Same measured head-top anchor as Hat above.
function Crown() {
  return (
    <G testID="wardrobe-crown" transform="translate(-10,-1) scale(1,0.6875)">
      <Polygon
        points="72,48 78,22 92,38 100,16 108,38 122,22 128,48"
        fill="#f4c542"
        stroke={INK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Circle cx="78" cy="22" r="3.5" fill="#e0403f" />
      <Circle cx="100" cy="16" r="3.5" fill="#3f7dd6" />
      <Circle cx="122" cy="22" r="3.5" fill="#e0403f" />
    </G>
  );
}

// Original backpack (x124-158, y126-164) sat just past the retired SVG
// body's right edge, mostly hidden behind the tail drawn on top of it in
// the same coordinate space. On the real `stand`/`calm` art this is a
// front-facing pose with no back visible at all, and the pixel-measured
// silhouette profile shows the tail occupying the right ~35-45% of the
// frame at torso height (e.g. at y-fraction 0.70, the body spans
// x-fraction 0.286-0.618 while the tail is a *separate* silhouette run at
// 0.641-0.864) — so the original coordinates land squarely on the tail's
// fur, not the body. There's no literal "correct" backpack spot on a
// head-on pose; the least-wrong placement is the body's left side at
// torso height (below the neck bandana, above the front legs), which the
// same profile scan puts at roughly x-fraction 0.26-0.43, y-fraction
// 0.70-0.89 (viewBox x≈52-86, y≈140-178) — clear of both the tail and the
// bandana, read as a bag resting against the body's side. `translate(
// -73,14)` moves the accessory's own bbox (x124-158,y126-164) into that
// window.
function Backpack() {
  return (
    <G testID="wardrobe-backpack" transform="translate(-73,14)">
      <Rect x="128" y="126" width="30" height="38" rx="8" fill="#5b8c5a" stroke={INK} strokeWidth={2.5} />
      <Rect x="136" y="134" width="14" height="10" rx="3" fill="#3f6d3e" />
      <Path d="M130 130 Q124 146 130 160" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
    </G>
  );
}
