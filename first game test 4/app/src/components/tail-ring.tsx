import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TailRing({
  size = 220,
  strokeWidth = 16,
  progress,
  trackColor,
  fillColor,
  tipColor,
}: {
  size?: number;
  strokeWidth?: number;
  /** 0..1, may exceed 1 (clamped visually, caller decides over-limit color) */
  progress: number;
  trackColor: string;
  fillColor: string;
  tipColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  const animated = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(animated, { toValue: clamped, useNativeDriver: false, friction: 8, tension: 40 }).start();
  }, [clamped, animated]);

  const strokeDashoffset = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  // Tail-tip marker travels along the arc, starting at 12 o'clock, clockwise.
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const cx = size / 2 + radius * Math.cos(angle);
  const cy = size / 2 + radius * Math.sin(angle);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id="tipGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={tipColor} stopOpacity={1} />
          <Stop offset="100%" stopColor={tipColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />

      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />

      {clamped > 0.02 && <Circle cx={cx} cy={cy} r={strokeWidth * 0.62} fill="url(#tipGlow)" />}
      {clamped > 0.02 && <Circle cx={cx} cy={cy} r={strokeWidth * 0.34} fill={tipColor} />}
    </Svg>
  );
}
