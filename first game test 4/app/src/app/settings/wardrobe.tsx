import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/ambient-glow';
import { Foxxy } from '@/components/foxxy';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { useUserSettings } from '@/lib/settings-context';

const UNLOCK_LABELS: Record<string, string> = {
  scarf: 'Cozy scarf',
  hat: 'Little hat',
  backpack: 'Adventure backpack',
  crown: 'Golden crown',
};

const ALL_UNLOCKS = ['scarf', 'hat', 'backpack', 'crown'] as const;

const EQUIP_SETTING_FIELD = {
  scarf: 'equippedScarf',
  hat: 'equippedHat',
  backpack: 'equippedBackpack',
  crown: 'equippedCrown',
} as const;

export default function WardrobeSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, updateSettings } = useUserSettings();
  const [unlockedItems, setUnlockedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const companion = await api.getCompanion();
      setUnlockedItems(companion.unlockedItems);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="warm" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.9} testID="wardrobe-back-button">
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </PressableScale>
            <ThemedText type="title" style={styles.title}>
              Wardrobe
            </ThemedText>
          </View>

          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            ALL_UNLOCKS.map((item) => {
              const unlocked = unlockedItems.includes(item);
              const settingsField = EQUIP_SETTING_FIELD[item];
              const equipped = settings[settingsField];
              const row = (
                <ThemedView
                  type={unlocked ? 'backgroundSelected' : 'backgroundElement'}
                  style={[styles.row, CardShadowSoft]}>
                  <ThemedView style={{ opacity: unlocked ? 1 : 0.35 }}>
                    <Foxxy
                      kind="stand"
                      size={48}
                      wearingScarf={item === 'scarf' && (!unlocked || equipped)}
                      wearingHat={item === 'hat' && (!unlocked || equipped)}
                      wearingBackpack={item === 'backpack' && (!unlocked || equipped)}
                      wearingCrown={item === 'crown' && (!unlocked || equipped)}
                    />
                  </ThemedView>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{UNLOCK_LABELS[item]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {unlocked ? (equipped ? 'Equipped' : 'Unlocked') : 'Locked'}
                    </ThemedText>
                  </View>
                </ThemedView>
              );
              return (
                <View key={item}>
                  {unlocked ? (
                    <PressableScale
                      onPress={() => updateSettings({ [settingsField]: !equipped })}
                      testID={`wardrobe-settings-toggle-${item}`}
                      accessibilityLabel={`${equipped ? 'Unequip' : 'Equip'} ${UNLOCK_LABELS[item]}`}
                      scaleTo={0.98}>
                      {row}
                    </PressableScale>
                  ) : (
                    row
                  )}
                </View>
              );
            })
          )}
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
    gap: Spacing.two,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  loader: { marginTop: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 16, padding: Spacing.three },
  rowText: { flex: 1, gap: 2 },
});
