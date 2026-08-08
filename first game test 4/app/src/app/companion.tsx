import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/ambient-glow';
import { FadeInUp } from '@/components/fade-in-up';
import { FoxMoment } from '@/components/fox-moment';
import { Foxxy } from '@/components/foxxy';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFoxMomentQueue } from '@/hooks/use-fox-moment-queue';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { idleKindForCompanion } from '@/lib/fox-idle';
import { useUserSettings } from '@/lib/settings-context';

// Equip flags in useUserSettings(), keyed by the same item id used in
// ALL_UNLOCKS/companion_state.unlocked_items below.
const EQUIP_SETTING_FIELD = {
  scarf: 'equippedScarf',
  hat: 'equippedHat',
  backpack: 'equippedBackpack',
  crown: 'equippedCrown',
} as const;

const UNLOCK_LABELS: Record<string, string> = {
  scarf: 'Cozy scarf',
  hat: 'Little hat',
  backpack: 'Adventure backpack',
  crown: 'Golden crown',
};

const ALL_UNLOCKS = ['scarf', 'hat', 'backpack', 'crown'];

export default function CompanionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, updateSettings } = useUserSettings();
  const [companion, setCompanion] = useState<api.CompanionState | null>(null);
  const [billing, setBilling] = useState<api.BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReduceMotion();
  const { active: activeMoment, enqueue: enqueueMoment, handleDone: handleMomentDone } = useFoxMomentQueue(reduceMotion);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [companionRes, billingRes] = await Promise.all([api.getCompanion(), api.getBillingStatus()]);
      setCompanion(companionRes);
      setBilling(billingRes);
      // The backend computes this diff itself (companion.js) and only
      // returns non-empty on the load that actually crosses a streak
      // threshold — including a screen's very first load, which a
      // client-side "previous vs current" comparison would miss.
      if (companionRes.newlyUnlocked.length > 0) enqueueMoment('celebrate');
    } finally {
      setLoading(false);
    }
  }, [enqueueMoment]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="cool" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.title}>
              Your companion
            </ThemedText>
            <PressableScale
              onPress={() => router.push('/settings')}
              hitSlop={8}
              scaleTo={0.9}
              testID="settings-gear-button"
              accessibilityLabel="Settings"
              style={styles.gearButton}>
              <Ionicons name="settings-outline" size={24} color={theme.textSecondary} />
            </PressableScale>
          </View>

          {loading && !companion ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <>
              {billing && billing.status !== 'active' && (
                <FadeInUp delay={0}>
                  <ThemedView type="backgroundElement" style={[styles.billingBanner, CardShadowSoft]}>
                    <ThemedText type="smallBold">
                      {billing.status === 'trialing'
                        ? `${billing.daysLeft} day${billing.daysLeft === 1 ? '' : 's'} left in your free trial`
                        : 'Your free trial has ended'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {billing.status === 'trialing'
                        ? 'AI photo scans are free during your trial — no card needed.'
                        : 'Manual logging still works. Subscribe from the Log tab to bring back AI scans.'}
                    </ThemedText>
                  </ThemedView>
                </FadeInUp>
              )}

              <FadeInUp delay={60}>
                <LinearGradient
                  colors={['#FFE9CC', '#FFD1A0', '#FFB878']}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[styles.stage, CardShadow]}>
                  {activeMoment ? (
                    <FoxMoment kind={activeMoment} size={200} onDone={handleMomentDone} />
                  ) : (
                    <Foxxy
                      kind={idleKindForCompanion(companion?.streakCount ?? 0)}
                      size={200}
                      wearingScarf={!!companion?.unlockedItems.includes('scarf') && settings.equippedScarf}
                      wearingHat={!!companion?.unlockedItems.includes('hat') && settings.equippedHat}
                      wearingBackpack={!!companion?.unlockedItems.includes('backpack') && settings.equippedBackpack}
                      wearingCrown={!!companion?.unlockedItems.includes('crown') && settings.equippedCrown}
                    />
                  )}
                </LinearGradient>
              </FadeInUp>

              <FadeInUp delay={120}>
                <ThemedView type="backgroundElement" style={[styles.streakCard, CardShadow]}>
                  <ThemedText style={[styles.streakNumber, { color: theme.accent }]}>
                    {companion?.streakCount ?? 0}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    day streak
                  </ThemedText>
                  {companion?.nextUnlock && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.nextUnlock}>
                      {companion.nextUnlock.streak - companion.streakCount} more day
                      {companion.nextUnlock.streak - companion.streakCount === 1 ? '' : 's'} to unlock{' '}
                      {UNLOCK_LABELS[companion.nextUnlock.item]}
                    </ThemedText>
                  )}
                </ThemedView>
              </FadeInUp>

              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Wardrobe
              </ThemedText>
              <ThemedView style={styles.wardrobeGrid}>
                {ALL_UNLOCKS.map((item, i) => {
                  const unlocked = companion?.unlockedItems.includes(item);
                  const settingsField = EQUIP_SETTING_FIELD[item as keyof typeof EQUIP_SETTING_FIELD];
                  const equipped = settings[settingsField];
                  const card = (
                    <ThemedView
                      type={unlocked ? 'backgroundSelected' : 'backgroundElement'}
                      style={[styles.wardrobeItem, CardShadowSoft]}>
                      <ThemedView style={{ opacity: unlocked ? 1 : 0.35 }}>
                        <Foxxy
                          kind="stand"
                          size={64}
                          wearingScarf={item === 'scarf' && (!unlocked || equipped)}
                          wearingHat={item === 'hat' && (!unlocked || equipped)}
                          wearingBackpack={item === 'backpack' && (!unlocked || equipped)}
                          wearingCrown={item === 'crown' && (!unlocked || equipped)}
                        />
                      </ThemedView>
                      <ThemedText type="small" themeColor={unlocked ? 'text' : 'textSecondary'}>
                        {UNLOCK_LABELS[item]}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {unlocked ? (equipped ? 'Equipped' : 'Unlocked') : 'Locked'}
                      </ThemedText>
                    </ThemedView>
                  );
                  return (
                    <FadeInUp key={item} delay={160 + i * 50} style={styles.wardrobeItemWrap}>
                      {unlocked ? (
                        <PressableScale
                          onPress={() => updateSettings({ [settingsField]: !equipped })}
                          testID={`wardrobe-equip-toggle-${item}`}
                          accessibilityLabel={`${equipped ? 'Unequip' : 'Equip'} ${UNLOCK_LABELS[item]}`}
                          scaleTo={0.96}>
                          {card}
                        </PressableScale>
                      ) : (
                        card
                      )}
                    </FadeInUp>
                  );
                })}
              </ThemedView>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, lineHeight: 34 },
  gearButton: { padding: Spacing.one },
  loader: { marginTop: Spacing.six },
  billingBanner: { borderRadius: 20, padding: Spacing.three, gap: 2 },
  stage: { borderRadius: 24, paddingVertical: Spacing.five, alignItems: 'center', justifyContent: 'center' },
  streakCard: { borderRadius: 24, padding: Spacing.five, alignItems: 'center', gap: 2 },
  streakNumber: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  nextUnlock: { marginTop: Spacing.two, textAlign: 'center' },
  sectionTitle: { marginTop: Spacing.two },
  wardrobeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  wardrobeItemWrap: { flexBasis: '47%' },
  wardrobeItem: {
    borderRadius: 20,
    padding: Spacing.three,
    gap: 2,
  },
});
