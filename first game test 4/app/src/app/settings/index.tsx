import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/ambient-glow';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserSettings } from '@/lib/settings-context';

const ROWS = [
  {
    href: '/settings/goals' as const,
    title: 'Goals & Targets',
    subtitle: 'Daily calorie goal and macro targets',
    icon: 'flag-outline' as const,
  },
  {
    href: '/settings/appearance' as const,
    title: 'Appearance & Theme',
    subtitle: 'Theme and reduce-motion preferences',
    icon: 'color-palette-outline' as const,
  },
  {
    href: '/settings/wardrobe' as const,
    title: 'Wardrobe',
    subtitle: 'Equip or unequip unlocked accessories',
    icon: 'shirt-outline' as const,
  },
];

export default function SettingsIndexScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { syncFailed } = useUserSettings();

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="cool" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.9} testID="settings-back-button">
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </PressableScale>
            <ThemedText type="title" style={styles.title}>
              Settings
            </ThemedText>
          </View>

          {syncFailed && (
            <ThemedView type="backgroundElement" style={[styles.syncBanner, CardShadowSoft]} testID="sync-failed-banner">
              <ThemedText type="smallBold">Changes not saved</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                We couldn&apos;t reach the server — your latest change is saved on this device and will sync
                automatically once you&apos;re back online.
              </ThemedText>
            </ThemedView>
          )}

          {ROWS.map((row) => (
            <PressableScale
              key={row.href}
              onPress={() => router.push(row.href)}
              scaleTo={0.98}
              testID={`settings-row-${row.href}`}>
              <ThemedView type="backgroundElement" style={[styles.row, CardShadowSoft]}>
                <Ionicons name={row.icon} size={22} color={theme.accent} />
                <View style={styles.rowText}>
                  <ThemedText type="smallBold">{row.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.subtitle}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </ThemedView>
            </PressableScale>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  syncBanner: { borderRadius: 16, padding: Spacing.three, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
  },
  rowText: { flex: 1, gap: 2 },
});
