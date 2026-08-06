import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Soft, slow-drifting color blobs behind screen content — pure decoration,
 * gives otherwise-flat backgrounds a sense of depth and warmth.
 */
export function AmbientGlow({ variant = 'warm' }: { variant?: 'warm' | 'cool' }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [10, -10] });

  const colorsA: [string, string] = variant === 'warm' ? ['#FFD59E', 'transparent'] : ['#B7E4FF', 'transparent'];
  const colorsB: [string, string] = variant === 'warm' ? ['#FF9E7A', 'transparent'] : ['#C9B8FF', 'transparent'];

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.blob, styles.blobTopRight, { transform: [{ translateX }, { translateY }] }]}>
        <LinearGradient colors={colorsA} style={styles.fill} start={{ x: 0.3, y: 0.3 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View
        style={[
          styles.blob,
          styles.blobBottomLeft,
          { transform: [{ translateX: Animated.multiply(translateX, -1) }, { translateY: Animated.multiply(translateY, -1) }] },
        ]}>
        <LinearGradient colors={colorsB} style={styles.fill} start={{ x: 0.3, y: 0.3 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', width: 260, height: 260, borderRadius: 260, opacity: 0.35 },
  blobTopRight: { top: -80, right: -80 },
  blobBottomLeft: { bottom: -60, left: -100 },
  fill: { flex: 1, borderRadius: 260 },
});
