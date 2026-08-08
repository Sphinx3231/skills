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
import type { UserSettings } from '@/lib/api';
import { useUserSettings } from '@/lib/settings-context';

const THEME_OPTIONS: { value: UserSettings['themeMode']; label: string; subtitle: string }[] = [
  { value: 'woodland_dusk', label: 'Woodland Dusk', subtitle: "FoxBite's default warm palette" },
  { value: 'dark', label: 'Dark', subtitle: 'Dark palette, always on' },
  { value: 'system', label: 'System', subtitle: "Match your device's setting" },
];

const MOTION_OPTIONS: { value: UserSettings['motionSetting']; label: string; subtitle: string }[] = [
  { value: 'system_default', label: 'System default', subtitle: "Match your device's reduce-motion setting" },
  { value: 'force_reduced_motion', label: 'Always reduce motion', subtitle: 'Freeze Foxxy on a static pose' },
  { value: 'full_animations', label: 'Always animate', subtitle: 'Keep looping animations on' },
];

export default function AppearanceSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, updateSettings } = useUserSettings();

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="cool" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.9} testID="appearance-back-button">
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </PressableScale>
            <ThemedText type="title" style={styles.title}>
              Appearance & Theme
            </ThemedText>
          </View>

          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Theme
          </ThemedText>
          {THEME_OPTIONS.map((option) => (
            <OptionRow
              key={option.value}
              testID={`appearance-theme-${option.value}`}
              label={option.label}
              subtitle={option.subtitle}
              selected={settings.themeMode === option.value}
              onPress={() => updateSettings({ themeMode: option.value })}
            />
          ))}

          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Motion
          </ThemedText>
          {MOTION_OPTIONS.map((option) => (
            <OptionRow
              key={option.value}
              testID={`appearance-motion-${option.value}`}
              label={option.label}
              subtitle={option.subtitle}
              selected={settings.motionSetting === option.value}
              onPress={() => updateSettings({ motionSetting: option.value })}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function OptionRow({
  testID,
  label,
  subtitle,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} testID={testID} scaleTo={0.98}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.optionRow, CardShadowSoft]}>
        <View style={styles.optionText}>
          <ThemedText type="smallBold">{label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        </View>
        {selected && <Ionicons name="checkmark-circle" size={20} color={theme.accent} testID={`${testID}-checkmark`} />}
      </ThemedView>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  title: { fontSize: 28, lineHeight: 34 },
  sectionTitle: { marginTop: Spacing.two },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: Spacing.three,
  },
  optionText: { flex: 1, gap: 2 },
});
