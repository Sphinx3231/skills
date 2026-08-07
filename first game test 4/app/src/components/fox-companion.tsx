import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Softer, warmer linework than a flat near-black — reads as painted, not inked.
const INK = '#5a3320';
const GLOW = '#FFB65C';

/**
 * empty     — morning, nothing logged yet: sleepy stretch + espresso cup
 * onTarget  — hit the day's macros: big grin, glowing tail, sparkles
 * over      — went past the calorie goal: content, curled up, full belly
 * neutral   — plain idle pose, used for wardrobe previews
 */
export type FoxMood = 'empty' | 'onTarget' | 'over' | 'neutral';

export function FoxCompanion({
  size = 220,
  mood = 'neutral',
  wearingScarf = false,
  wearingHat = false,
  wearingBackpack = false,
  wearingCrown = false,
}: {
  size?: number;
  mood?: FoxMood;
  wearingScarf?: boolean;
  wearingHat?: boolean;
  wearingBackpack?: boolean;
  wearingCrown?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const earWiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      // Reduce motion can flip on mid-loop (OS setting toggled while the
      // fox is mid-bob) — snap back to the resting frame instead of
      // freezing wherever the loop happened to be stopped.
      bob.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    bobLoop.start();
    return () => bobLoop.stop();
  }, [bob, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      earWiggle.setValue(0);
      return;
    }
    const wiggleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(earWiggle, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(earWiggle, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    wiggleLoop.start();
    return () => wiggleLoop.stop();
  }, [earWiggle, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      // Without this, toggling reduce motion on mid-blink can permanently
      // freeze the eyes squinted at scaleY 0.08 instead of open.
      blink.setValue(1);
      return;
    }
    let cancelled = false;
    function scheduleBlink() {
      const delay = 2200 + Math.random() * 2600;
      const id = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.08, duration: 80, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start(() => !cancelled && scheduleBlink());
      }, delay);
      return id;
    }
    const id = scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [blink, reduceMotion]);

  useEffect(() => {
    if (mood !== 'onTarget') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sparkle, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mood, sparkle]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  // react-native-svg's `rotation` prop is coerced with unary `+`, so a
  // "-2deg" string (the React Native transform convention) silently becomes
  // NaN -> 0. It wants a plain number of degrees.
  const earRotate = earWiggle.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 0.2] });
  const sparkleScale = sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 0.6] });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id="tailGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={GLOW} stopOpacity={0.6} />
            <Stop offset="100%" stopColor={GLOW} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3a2313" stopOpacity={0.28} />
            <Stop offset="100%" stopColor="#3a2313" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="furBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#ffb066" />
            <Stop offset="55%" stopColor="#f0873a" />
            <Stop offset="100%" stopColor="#d96a24" />
          </LinearGradient>
          <RadialGradient id="furHead" cx="38%" cy="30%" r="75%">
            <Stop offset="0%" stopColor="#ffc07f" />
            <Stop offset="55%" stopColor="#f0873a" />
            <Stop offset="100%" stopColor="#db6b26" />
          </RadialGradient>
          <LinearGradient id="furTail" x1="20%" y1="100%" x2="90%" y2="0%">
            <Stop offset="0%" stopColor="#d96a24" />
            <Stop offset="60%" stopColor="#f5964a" />
            <Stop offset="100%" stopColor="#ffe4bd" />
          </LinearGradient>
          <LinearGradient id="creamBelly" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#fffaf0" />
            <Stop offset="100%" stopColor="#ffe2b8" />
          </LinearGradient>
          <RadialGradient id="cheekBlush" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#ff8a5c" stopOpacity={0.75} />
            <Stop offset="100%" stopColor="#ff8a5c" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="eyeIris" cx="42%" cy="38%" r="65%">
            <Stop offset="0%" stopColor="#7a4a26" />
            <Stop offset="70%" stopColor="#3d2314" />
            <Stop offset="100%" stopColor="#241206" />
          </RadialGradient>
          <LinearGradient id="earInner" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#fff3e0" />
            <Stop offset="100%" stopColor="#ffcaa3" />
          </LinearGradient>
        </Defs>

        {/* soft painterly ground shadow */}
        <Ellipse cx="100" cy="184" rx="50" ry="10" fill="url(#groundShadow)" />

        <AnimatedG {...({ translateY } as any)}>
          {wearingBackpack && <Backpack />}

          {mood === 'onTarget' && (
            <>
              <Circle cx="168" cy="96" r="36" fill="url(#tailGlow)" />
              <Sparkle x={158} y={54} scale={sparkleScale} opacity={sparkleOpacity} />
              <Sparkle x={182} y={110} scale={sparkleScale} opacity={sparkleOpacity} />
              <Sparkle x={40} y={70} scale={sparkleScale} opacity={sparkleOpacity} />
            </>
          )}

          {/* tail — fluffy layered tip instead of a smooth blob */}
          <Path
            d="M150 142 C188 136 198 92 168 72 C186 88 184 124 152 134 Z"
            fill="url(#furTail)"
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Path
            d="M170 80 C168 78 165 82 168 85 C170 82 173 84 171 87 C174 84 177 88 174 90 C178 87 181 91 178 94"
            fill="none"
            stroke="#fff1dc"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.8}
          />
          <Path d="M164 118 C172 112 180 100 180 88" fill="none" stroke="#fff1dc" strokeWidth={2} strokeLinecap="round" opacity={0.5} />

          {/* ears — gentle idle wiggle, fluffy tufted tips */}
          <AnimatedG {...({ rotation: earRotate, originX: 67, originY: 55 } as any)}>
            {mood === 'empty' ? (
              <Ear points="60,62 52,26 86,50" innerPoints="62,56 58,36 80,50" />
            ) : (
              <Ear points="62,58 50,18 84,46" innerPoints="64,52 58,30 78,46" />
            )}
          </AnimatedG>
          <AnimatedG {...({ rotation: earRotate, originX: 133, originY: 55 } as any)}>
            {mood === 'empty' ? (
              <Ear points="140,62 152,26 114,50" innerPoints="138,56 144,38 122,52" flip />
            ) : (
              <Ear points="138,58 150,18 116,46" innerPoints="136,52 142,30 122,46" flip />
            )}
          </AnimatedG>

          {/* body — a touch rounder when full */}
          <Ellipse
            cx="100"
            cy="146"
            rx={mood === 'over' ? 47 : 43}
            ry={mood === 'over' ? 38 : 35}
            fill="url(#furBody)"
            stroke={INK}
            strokeWidth={2.5}
          />
          <Ellipse cx="100" cy="158" rx={mood === 'over' ? 27 : 24} ry={mood === 'over' ? 19 : 17} fill="url(#creamBelly)" />
          {mood === 'over' && <Ellipse cx="90" cy="150" rx="7" ry="4.5" fill="#fff" opacity={0.4} />}

          {/* head */}
          <Circle cx="100" cy="90" r="48" fill="url(#furHead)" stroke={INK} strokeWidth={2.5} />
          {/* soft rim light, upper-left */}
          <Path d="M66 66 A48 48 0 0 1 126 50" fill="none" stroke="#ffe3b0" strokeWidth={3} strokeLinecap="round" opacity={0.55} />

          {/* fluffy chest ruff — drawn on top of the head/body seam so the
              scalloped tufts actually peek out on either side of the neck */}
          <G>
            {[62, 75, 88, 100, 112, 125, 138].map((cx, i) => (
              <Circle key={i} cx={cx} cy={131} r="9" fill="url(#creamBelly)" stroke={INK} strokeWidth={1.3} />
            ))}
          </G>

          {/* cheeks */}
          <Circle cx="66" cy="100" r="13" fill="url(#cheekBlush)" />
          <Circle cx="134" cy="100" r="13" fill="url(#cheekBlush)" />

          {/* muzzle */}
          <Path d="M76 94 C76 122 124 122 124 94 C124 112 76 112 76 94 Z" fill="url(#creamBelly)" stroke={INK} strokeWidth={1.5} />
          <Ellipse cx="100" cy="107" rx="7.5" ry="5.5" fill={INK} />
          <Circle cx="98" cy="105" r="1.3" fill="#fff" opacity={0.7} />

          {/* mouth */}
          {mood === 'onTarget' && (
            <Path
              d="M84 118 Q100 136 116 118 Q100 130 84 118 Z"
              fill="#c85a4a"
              stroke={INK}
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          )}
          {mood === 'over' && (
            <Path d="M91 120 Q100 125 109 120" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          )}
          {mood === 'empty' && (
            <Path d="M93 121 Q100 124 107 121" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          )}
          {mood === 'neutral' && (
            <Path d="M88 117 Q100 128 112 117" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          )}

          {/* eyes — big, glossy, Ghibli-style catchlights. Droopy/content moods use a soft lash line */}
          {mood === 'empty' || mood === 'over' ? (
            <>
              <Path d="M72 92 Q80 97 90 92" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
              <Path d="M110 92 Q120 97 128 92" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
            </>
          ) : (
            <>
              <AnimatedG {...({ scaleY: blink, originX: 80, originY: 92 } as any)}>
                <Circle cx="80" cy="92" r="11.5" fill="#fff" stroke={INK} strokeWidth={1.6} />
                <Circle cx="81" cy="93" r="9" fill="url(#eyeIris)" />
                <Circle cx="84" cy="88" r="3" fill="#fff" opacity={0.95} />
                <Circle cx="77" cy="97" r="1.4" fill="#fff" opacity={0.6} />
              </AnimatedG>
              <AnimatedG {...({ scaleY: blink, originX: 120, originY: 92 } as any)}>
                <Circle cx="120" cy="92" r="11.5" fill="#fff" stroke={INK} strokeWidth={1.6} />
                <Circle cx="121" cy="93" r="9" fill="url(#eyeIris)" />
                <Circle cx="124" cy="88" r="3" fill="#fff" opacity={0.95} />
                <Circle cx="117" cy="97" r="1.4" fill="#fff" opacity={0.6} />
              </AnimatedG>
            </>
          )}

          {/* front paws */}
          {mood === 'over' ? (
            <>
              <Ellipse cx="85" cy="170" rx="12" ry="8.5" fill="url(#creamBelly)" stroke={INK} strokeWidth={2} />
              <Ellipse cx="115" cy="170" rx="12" ry="8.5" fill="url(#creamBelly)" stroke={INK} strokeWidth={2} />
            </>
          ) : (
            <>
              <Ellipse cx="78" cy="178" rx="12" ry="8.5" fill="url(#creamBelly)" stroke={INK} strokeWidth={2} />
              <Ellipse cx="122" cy="178" rx="12" ry="8.5" fill="url(#creamBelly)" stroke={INK} strokeWidth={2} />
            </>
          )}

          {mood === 'empty' && <CoffeeCup />}

          {wearingScarf && <Scarf />}
          {wearingHat && <Hat />}
          {wearingCrown && <Crown />}
        </AnimatedG>
      </Svg>
    </View>
  );
}

function Ear({ points, innerPoints, flip }: { points: string; innerPoints: string; flip?: boolean }) {
  return (
    <G>
      <Polygon points={points} fill="url(#furHead)" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Polygon points={innerPoints} fill="url(#earInner)" />
      {/* tiny fur wisp at the tip */}
      <Path
        d={flip ? 'M148 26 q-4 -6 -9 -8' : 'M52 26 q4 -6 9 -8'}
        fill="none"
        stroke={INK}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.55}
      />
    </G>
  );
}

function Sparkle({
  x,
  y,
  scale,
  opacity,
}: {
  x: number;
  y: number;
  scale: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <AnimatedCircle
      {...({ cx: x, cy: y, r: 3.2, fill: '#FFE9B8', opacity, scale, originX: x, originY: y } as any)}
    />
  );
}

function Scarf() {
  return (
    <G>
      <Path d="M62 118 C80 134 120 134 138 118 L138 132 C120 146 80 146 62 132 Z" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} />
      <Rect x="94" y="128" width="14" height="26" rx="4" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} />
      <Path d="M97 138 l4 4 6 -8" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function Hat() {
  return (
    <G>
      <Ellipse cx="100" cy="54" rx="36" ry="7" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} />
      <Path d="M78 54 L82 18 Q100 6 118 18 L122 54 Z" fill="#3f7dd6" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x="79" y="42" width="42" height="8" fill="#f4c542" />
    </G>
  );
}

function Crown() {
  return (
    <G>
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

function CoffeeCup() {
  return (
    <G>
      <Rect x="126" y="172" width="16" height="16" rx="3" fill="#fff" stroke={INK} strokeWidth={2} />
      <Path d="M142 176 Q150 176 148 182 Q146 186 142 184" fill="none" stroke={INK} strokeWidth={2} />
      <Path d="M129 172 Q131 168 129 165" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
      <Path d="M135 172 Q137 167 135 163" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
    </G>
  );
}

function Backpack() {
  return (
    <G>
      <Rect x="128" y="126" width="30" height="38" rx="8" fill="#5b8c5a" stroke={INK} strokeWidth={2.5} />
      <Rect x="136" y="134" width="14" height="10" rx="3" fill="#3f6d3e" />
      <Path d="M130 130 Q124 146 130 160" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
    </G>
  );
}
