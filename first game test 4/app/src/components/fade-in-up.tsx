import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/** Staggered entrance: fades in and rises 12px, spring physics. */
export function FadeInUp({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.spring(progress, {
      toValue: 1,
      delay,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
