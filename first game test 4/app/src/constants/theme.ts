/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    // Bespoke woodland-dusk palette — replaces the Material Design stock
    // swatches (Orange 900 / Pink 700 / Amber 700 / Green 800 / Brown 900)
    // that shipped here verbatim.
    accent: '#C9622A', // ember/burnt-clay
    accentSoft: '#FFF8F0',
    protein: '#B85C6B', // dusty berry
    carbs: '#D9A544', // dulled honey
    fats: '#4B7355', // forest moss
    bark: '#2B1B13',
    // Over-goal warning state (calorie ring/number once past the day's
    // goal) — a de-saturated scorched red-clay, in the same family and
    // saturation range as the rest of this palette, replacing a leftover
    // Material Red 700 (`#D32F2F`) that hadn't been touched by this pass.
    overGoal: '#B5432E',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    // Brightened dark-mode equivalents of the light woodland-dusk tokens
    // above, keeping the same hue relationships and adequate contrast
    // against the near-black background.
    accent: '#E08355', // brightened ember/burnt-clay
    accentSoft: '#241C18',
    protein: '#D98A96', // brightened dusty berry
    carbs: '#E8C275', // brightened dulled honey
    fats: '#7FA989', // brightened forest moss
    bark: '#EFE0DC',
    overGoal: '#E2795F', // brightened scorched red-clay
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

const SystemFonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

// Two chosen typefaces (loaded via `useFonts` in `_layout.tsx`) give the app
// actual typographic personality instead of the bare `system-ui` default:
// Bitter — a grounded slab-serif — for display roles (headings, "Foxxy
// says"), and Work Sans — a clean humanist sans — for body copy.
export const Fonts = {
  ...SystemFonts,
  display: 'Bitter_700Bold',
  displaySemiBold: 'Bitter_600SemiBold',
  body: 'WorkSans_500Medium',
  bodyRegular: 'WorkSans_400Regular',
  bodyBold: 'WorkSans_700Bold',
};

// Deliberate ~1.25 modular scale (base 16px), replacing the previous ad hoc
// 14/16/32/48px jump. Values land close to the sizes already in use — e.g.
// `xxl` ≈ the old 32px subtitle, `display` ≈ the old 48px title — so no
// `ThemedText` call site needs to change, only the styles backing it.
export const TypeScale = {
  xs: 10, // 16 / 1.25^2
  sm: 13, // 16 / 1.25
  base: 16,
  lg: 20, // 16 * 1.25
  xl: 25, // 16 * 1.25^2
  xxl: 31, // 16 * 1.25^3
  display: 49, // 16 * 1.25^5
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// Soft, warm-toned card shadow — cross-platform (elevation on Android, shadow* elsewhere).
export const CardShadow = Platform.select({
  android: { elevation: 4 },
  default: {
    shadowColor: '#7a3d10',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
}) as object;

export const CardShadowSoft = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: '#7a3d10',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
}) as object;
