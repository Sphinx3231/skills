import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/ambient-glow';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserSettings } from '@/lib/settings-context';

const FIELDS = [
  { key: 'dailyCalorieGoal' as const, label: 'Daily calorie goal', unit: 'kcal' },
  { key: 'proteinGoalG' as const, label: 'Protein target', unit: 'g' },
  { key: 'carbsGoalG' as const, label: 'Carbs target', unit: 'g' },
  { key: 'fatsGoalG' as const, label: 'Fat target', unit: 'g' },
];

export default function GoalsSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, updateSettings } = useUserSettings();
  // Local text buffers so a mid-edit empty/partial string (e.g. deleting a
  // digit to retype it) doesn't get immediately coerced back to a number
  // and fight the user's cursor — committed to updateSettings onBlur/onChange
  // once it parses as a valid non-negative number.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function draftFor(key: (typeof FIELDS)[number]['key']): string {
    return drafts[key] ?? String(settings[key]);
  }

  function onChangeText(key: (typeof FIELDS)[number]['key'], text: string) {
    setDrafts((prev) => ({ ...prev, [key]: text }));
    const parsed = Number(text);
    if (text.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      updateSettings({ [key]: parsed });
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="warm" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.9} testID="goals-back-button">
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </PressableScale>
            <ThemedText type="title" style={styles.title}>
              Goals & Targets
            </ThemedText>
          </View>

          {FIELDS.map((field) => (
            <ThemedView key={field.key} type="backgroundElement" style={[styles.fieldCard, CardShadowSoft]}>
              <ThemedText type="smallBold">{field.label}</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  testID={`goals-input-${field.key}`}
                  value={draftFor(field.key)}
                  onChangeText={(text) => onChangeText(field.key, text)}
                  keyboardType="number-pad"
                  style={[styles.input, { color: theme.text }]}
                  placeholderTextColor={theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {field.unit}
                </ThemedText>
              </View>
            </ThemedView>
          ))}

          <ThemedView type="backgroundElement" style={[styles.fieldCard, CardShadowSoft]}>
            <ThemedText type="smallBold">Macro display unit</ThemedText>
            <View style={styles.unitToggleRow}>
              {(['grams', 'percentage'] as const).map((unit) => (
                <PressableScale
                  key={unit}
                  onPress={() => updateSettings({ macroUnit: unit })}
                  testID={`goals-macro-unit-${unit}`}
                  scaleTo={0.96}
                  style={[
                    styles.unitOption,
                    { backgroundColor: settings.macroUnit === unit ? theme.backgroundSelected : theme.background },
                  ]}>
                  <ThemedText
                    type="small"
                    themeColor={settings.macroUnit === unit ? 'text' : 'textSecondary'}
                    style={styles.unitOptionText}>
                    {unit === 'grams' ? 'Grams' : 'Percentage'}
                  </ThemedText>
                </PressableScale>
              ))}
            </View>
          </ThemedView>
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
  fieldCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { fontSize: 18, minWidth: 80, paddingVertical: 4 },
  unitToggleRow: { flexDirection: 'row', gap: Spacing.two },
  unitOption: { flex: 1, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center' },
  unitOptionText: {},
});
