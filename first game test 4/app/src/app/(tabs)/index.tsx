import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/ambient-glow';
import { FadeInUp } from '@/components/fade-in-up';
import { FoxMoment } from '@/components/fox-moment';
import { Foxxy } from '@/components/foxxy';
import { PawPrint } from '@/components/paw-print';
import { PressableScale } from '@/components/pressable-scale';
import { TailRing } from '@/components/tail-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFoxMomentQueue } from '@/hooks/use-fox-moment-queue';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { bucketLogs, foxxyState, type FoxMood } from '@/lib/dashboard-logic';
import { idleKindForDashboard } from '@/lib/fox-idle';
import { hasWavedThisSession, markWavedThisSession, momentForMoodTransition } from '@/lib/fox-moments';
import { useUserSettings } from '@/lib/settings-context';

export default function DashboardScreen() {
  const { signOut } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { settings } = useUserSettings();
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null);
  const [logs, setLogs] = useState<api.FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReduceMotion();
  const { active: activeMoment, enqueue: enqueueMoment, handleDone: handleMomentDone } = useFoxMomentQueue(reduceMotion);
  const prevMoodRef = useRef<FoxMood | null>(null);
  const hasWavedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, logsRes] = await Promise.all([api.getDashboardSummary(), api.getLogs()]);
      setSummary(summaryRes);
      setLogs(logsRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const deleteEntry = useCallback(
    async (id: number) => {
      setLogs((prev) => prev.filter((l) => l.id !== id));
      try {
        await api.deleteLog(id);
      } finally {
        load();
      }
    },
    [load]
  );

  // Sourced from the settings context (not summary?.goal) so an edit on the
  // Goals & Targets screen reflects here on the very next render — the
  // context updates synchronously on the optimistic write, with no
  // dependency on a network round-trip or a screen-focus refetch.
  // GET /food/dashboard/summary's own `goal` field is left untouched
  // server-side; it stays the source of truth for calorie-total math there,
  // since it already reads the same users.daily_calorie_goal column this
  // screen's settings.dailyCalorieGoal is also backed by.
  const goal = settings.dailyCalorieGoal;
  const calories = summary?.calories ?? 0;
  const progress = goal > 0 ? calories / goal : 0;
  const overGoal = calories > goal;

  const { mood, line } = useMemo(() => foxxyState(logs.length, calories, goal), [logs.length, calories, goal]);
  const buckets = useMemo(() => bucketLogs(logs), [logs]);

  // Real per-user stored macro targets (Goals & Targets screen), replacing
  // the previous hardcoded 25/45/30-of-calorie-goal placeholder split.
  const proteinTarget = settings.proteinGoalG;
  const carbsTarget = settings.carbsGoalG;
  const fatTarget = settings.fatsGoalG;

  useEffect(() => {
    if (!hasWavedRef.current && !hasWavedThisSession()) {
      hasWavedRef.current = true;
      markWavedThisSession();
      enqueueMoment('wave');
    }
  }, [enqueueMoment]);

  useEffect(() => {
    if (!summary) return;
    const moment = momentForMoodTransition(prevMoodRef.current, mood);
    prevMoodRef.current = mood;
    if (moment) enqueueMoment(moment);
  }, [mood, summary, enqueueMoment]);

  return (
    <ThemedView style={styles.screen}>
      <AmbientGlow variant="warm" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                THE DEN
              </ThemedText>
              <ThemedText type="title" style={styles.title}>
                Today
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <PressableScale
                onPress={() => router.push('/settings')}
                hitSlop={8}
                scaleTo={0.9}
                testID="settings-gear-button"
                accessibilityLabel="Settings"
                style={styles.gearButton}>
                <Ionicons name="settings-outline" size={24} color={theme.textSecondary} />
              </PressableScale>
              <PressableScale onPress={() => signOut()} hitSlop={8} scaleTo={0.9}>
                <ThemedText type="link" themeColor="textSecondary">
                  Sign out
                </ThemedText>
              </PressableScale>
            </View>
          </View>

          {loading && !summary ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <>
              {/* Foxxy hero widget */}
              <FadeInUp delay={0}>
                <LinearGradient
                  colors={['#FFE4C4', '#FFC98A', '#FFB066']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.foxCard, CardShadow]}>
                  <View style={styles.foxCardWatermark} pointerEvents="none">
                    <PawPrint size={72} color={theme.bark} opacity={0.14} />
                  </View>
                  {activeMoment ? (
                    <FoxMoment kind={activeMoment} size={116} onDone={handleMomentDone} />
                  ) : (
                    <Foxxy kind={idleKindForDashboard(mood, goal - calories, goal)} size={116} />
                  )}
                  <View style={styles.foxSpeech}>
                    <ThemedText type="smallBold" style={{ color: theme.bark }}>
                      Foxxy says
                    </ThemedText>
                    <ThemedText type="small" style={[styles.foxLine, { color: theme.bark }]}>
                      {line}
                    </ThemedText>
                  </View>
                </LinearGradient>
              </FadeInUp>

              {/* Tail Sweep progress ring */}
              <FadeInUp delay={80}>
                <ThemedView type="backgroundElement" style={[styles.ringCard, CardShadow]}>
                  <View style={styles.ringWrap}>
                    <TailRing
                      size={200}
                      strokeWidth={16}
                      progress={progress}
                      trackColor={theme.backgroundSelected}
                      fillColor={overGoal ? theme.overGoal : theme.accent}
                      tipColor={overGoal ? theme.overGoal : theme.accent}
                    />
                    <View style={styles.ringCenter} pointerEvents="none">
                      <ThemedText style={[styles.calorieNumber, { color: overGoal ? theme.overGoal : theme.accent }]}>
                        {calories}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        of {goal} kcal
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.ringCaption}>
                    {overGoal ? `${calories - goal} cal over goal` : `${goal - calories} cal remaining`}
                  </ThemedText>

                  <View style={styles.macroRow}>
                    <MacroCard label="Protein" grams={summary?.proteinG ?? 0} target={proteinTarget} color={theme.protein} />
                    <MacroCard label="Carbs" grams={summary?.carbsG ?? 0} target={carbsTarget} color={theme.carbs} />
                    <MacroCard label="Fats" grams={summary?.fatG ?? 0} target={fatTarget} color={theme.fats} />
                  </View>
                </ThemedView>
              </FadeInUp>

              {/* Daily Forage meal timeline */}
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Daily Forage
              </ThemedText>

              {buckets.length === 0 ? (
                <FadeInUp delay={140}>
                  <ThemedView type="backgroundElement" style={[styles.emptyCard, CardShadowSoft]}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                      Nothing logged yet — head to the Log tab to snap your first meal.
                    </ThemedText>
                  </ThemedView>
                </FadeInUp>
              ) : (
                buckets.map((bucket, i) => (
                  <FadeInUp key={bucket.key} delay={140 + i * 60} style={styles.bucket}>
                    <View style={styles.bucketLabelRow}>
                      <PawPrint size={12} color={theme.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.bucketLabel}>
                        {bucket.label.toUpperCase()}
                      </ThemedText>
                    </View>
                    {bucket.logs.map((item) => (
                      <ThemedView key={item.id} type="backgroundElement" style={[styles.logRow, CardShadowSoft]}>
                        <View style={styles.logInfo}>
                          <ThemedText type="smallBold">{item.food_name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {new Date(item.logged_at + 'Z').toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            · {sourceLabel(item.source)}
                          </ThemedText>
                        </View>
                        <View style={styles.logRight}>
                          <ThemedText type="smallBold">{item.calories} cal</ThemedText>
                          <PressableScale
                            onPress={() => deleteEntry(item.id)}
                            hitSlop={8}
                            scaleTo={0.8}
                            testID={`delete-log-${item.id}`}
                            style={styles.deleteButton}>
                            <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
                          </PressableScale>
                        </View>
                      </ThemedView>
                    ))}
                  </FadeInUp>
                ))
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function sourceLabel(source: api.FoodLog['source']): string {
  if (source === 'ai') return 'AI scan';
  if (source === 'barcode') return 'Barcode scan';
  return 'Manual';
}

function MacroCard({ label, grams, target, color }: { label: string; grams: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(1, grams / target) : 0;
  const animated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animated, { toValue: pct, useNativeDriver: false, friction: 8, tension: 40 }).start();
  }, [pct, animated]);

  const width = animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ThemedView type="backgroundSelected" style={styles.macroCard}>
      <ThemedText type="smallBold" style={styles.macroGrams}>
        {Math.round(grams)}g
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.macroTrack}>
        <Animated.View style={[styles.macroFill, { width, backgroundColor: color }]} />
      </View>
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
  scroll: { alignSelf: 'stretch' },
  scrollContent: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  eyebrow: { letterSpacing: 1.2, fontSize: 11, marginBottom: 2 },
  title: { fontSize: 28, lineHeight: 34 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  gearButton: { padding: Spacing.one },
  loader: { marginTop: Spacing.six },

  foxCard: {
    borderRadius: 24,
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    overflow: 'hidden',
  },
  foxCardWatermark: { position: 'absolute', right: Spacing.two, bottom: Spacing.two },
  foxSpeech: { flex: 1, gap: 2 },
  foxLine: { lineHeight: 18 },

  ringCard: {
    borderRadius: 24,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  calorieNumber: { fontSize: 36, fontWeight: '800', lineHeight: 40, fontVariant: ['tabular-nums'] },
  ringCaption: { marginTop: Spacing.one },

  macroRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    width: '100%',
  },
  macroCard: { flex: 1, borderRadius: 16, padding: Spacing.two, gap: 4 },
  macroGrams: { fontVariant: ['tabular-nums'] },
  macroTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 2 },
  macroFill: { height: '100%', borderRadius: 3 },

  sectionTitle: { marginTop: Spacing.two, marginBottom: Spacing.one, letterSpacing: 0.5 },
  bucket: { gap: Spacing.one, marginBottom: Spacing.two },
  bucketLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bucketLabel: { letterSpacing: 1, fontSize: 11 },
  emptyCard: { borderRadius: 16, padding: Spacing.three },
  empty: { textAlign: 'center' },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 16,
  },
  logInfo: { gap: 2 },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  deleteButton: { padding: 2 },
});
