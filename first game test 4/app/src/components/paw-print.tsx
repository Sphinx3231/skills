import Svg, { Ellipse } from 'react-native-svg';

/**
 * FoxBite's signature motif — a small hand-drawn paw print. Used as (a) the
 * marker before each Daily Forage bucket label, and (b) a low-opacity
 * corner watermark on the Foxxy hero card. Ties the app's own vocabulary
 * (forage, tracks) into the UI instead of a generic decorative glyph.
 */
export function PawPrint({ size = 16, color = '#5a3320', opacity = 1 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
      {/* main pad */}
      <Ellipse cx="12" cy="16" rx="7" ry="5.6" fill={color} />
      {/* toes */}
      <Ellipse cx="4.2" cy="9.4" rx="2.6" ry="3.3" fill={color} transform="rotate(-18 4.2 9.4)" />
      <Ellipse cx="9.6" cy="5.6" rx="2.7" ry="3.5" fill={color} transform="rotate(-6 9.6 5.6)" />
      <Ellipse cx="15.4" cy="5.4" rx="2.7" ry="3.5" fill={color} transform="rotate(6 15.4 5.4)" />
      <Ellipse cx="20.4" cy="9.2" rx="2.6" ry="3.3" fill={color} transform="rotate(18 20.4 9.2)" />
    </Svg>
  );
}
