import { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with crisp spring-physics press feedback (scale + opacity),
 * matching the "smooth hover/press states" requirement from the design system.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  disabled,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  }

  return (
    <AnimatedPressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      style={[style, { transform: [{ scale }], opacity: disabled ? 0.5 : 1 }]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
