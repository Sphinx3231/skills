import { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { FadeInUp } from '@/components/fade-in-up';
import { FoxMoment } from '@/components/fox-moment';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, CardShadowSoft, MaxContentWidth, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { shouldPlayFoxMoment } from '@/lib/fox-moments';
import { prepareImageForUpload } from '@/lib/image-prep';
import {
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
  startSpeechRecognition,
  stopSpeechRecognition,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from '@/lib/speech-recognition';

type Step = 'idle' | 'listening' | 'scanning' | 'analyzing' | 'review' | 'saving' | 'logged';

export default function LogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<api.FoodAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywallBilling, setPaywallBilling] = useState<api.BillingStatus | null>(null);
  const [frequent, setFrequent] = useState<api.FrequentFood[]>([]);
  const [stashingId, setStashingId] = useState<string | null>(null);
  const [logSource, setLogSource] = useState<'ai' | 'barcode'>('ai');
  const [transcript, setTranscript] = useState('');
  const reduceMotion = useReduceMotion();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const voiceSubmittedRef = useRef(false);
  const barcodeScannedRef = useRef(false);
  // Guards against a rapid double-tap on Voice Input / Barcode Hunt while
  // their permission request promise is still pending — without this, a
  // second tap before the first `await` resolves would fire a second
  // permission request / flow start.
  const voiceStartInFlightRef = useRef(false);
  const barcodeStartInFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (step === 'idle') api.getFrequentFoods().then(setFrequent).catch(() => {});
    }, [step])
  );

  async function pickAndAnalyze(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(`Permission to use the ${fromCamera ? 'camera' : 'photo library'} was denied.`);
      return;
    }

    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: false });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    const prepared = await prepareImageForUpload(asset);
    setPhotoUri(prepared.uri); // was: asset.uri — review-screen preview should show what's actually uploaded
    setStep('analyzing');

    try {
      const analysis = await api.analyzePhoto(prepared);
      setLogSource('ai');
      setResult(analysis);
      setStep('review');
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 402) {
        setPaywallBilling((err.body as { billing: api.BillingStatus }).billing);
        setStep('idle');
        setPhotoUri(null);
        return;
      }
      setError(err instanceof api.ApiError ? err.message : 'Could not reach the server.');
      setStep('idle');
    }
  }

  async function submitDescription(description: string) {
    if (!description.trim()) {
      setStep('idle');
      return;
    }
    setStep('analyzing');
    try {
      const analysis = await api.analyzeText(description);
      setLogSource('ai');
      setResult(analysis);
      setStep('review');
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 402) {
        setPaywallBilling((err.body as { billing: api.BillingStatus }).billing);
        setStep('idle');
        return;
      }
      setError(err instanceof api.ApiError ? err.message : 'Could not reach the server.');
      setStep('idle');
    }
  }

  useSpeechRecognitionEvent('result', (event: ExpoSpeechRecognitionResultEvent) => {
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);
    // Interim results are for display only — only a final result gets sent
    // to the backend, and only once per listening session.
    if (event.isFinal && !voiceSubmittedRef.current) {
      voiceSubmittedRef.current = true;
      // Stop the recognizer as soon as a final transcript is accepted —
      // on native Android the mic can otherwise stay open after the UI has
      // already moved on to analyzing/review.
      stopSpeechRecognition();
      submitDescription(text);
    }
  });

  useSpeechRecognitionEvent('error', (event: ExpoSpeechRecognitionErrorEvent) => {
    if (step !== 'listening') return;
    setError(event.message || 'Speech recognition failed, try again.');
    setStep('idle');
  });

  useSpeechRecognitionEvent('end', () => {
    // If recognition ended (e.g. silence) without ever submitting a final
    // transcript, the UI would otherwise hang on "Listening…" forever with
    // no error and no way forward besides the manual Cancel button. The
    // `step !== 'listening'` guard mirrors the 'error' handler above, so
    // this is a no-op when the session already moved on (submitted,
    // canceled, or errored) by the time 'end' actually fires.
    if (step !== 'listening') return;
    if (!voiceSubmittedRef.current) {
      setError("Didn't catch that, try again.");
      setStep('idle');
    }
  });

  async function startVoiceInput() {
    if (!isSpeechRecognitionAvailable) {
      setError('Voice Input needs the full app build — not available in this preview.');
      return;
    }
    if (voiceStartInFlightRef.current) return;
    voiceStartInFlightRef.current = true;
    setError(null);
    try {
      const permission = await requestSpeechPermissions();
      if (!permission.granted) {
        setError('Permission to use the microphone was denied.');
        return;
      }
      voiceSubmittedRef.current = false;
      setTranscript('');
      setStep('listening');
      startSpeechRecognition({ lang: 'en-US', interimResults: true });
    } finally {
      voiceStartInFlightRef.current = false;
    }
  }

  async function startBarcodeHunt() {
    if (barcodeStartInFlightRef.current) return;
    barcodeStartInFlightRef.current = true;
    setError(null);
    try {
      let permission = cameraPermission;
      if (!permission?.granted) {
        permission = await requestCameraPermission();
      }
      if (!permission?.granted) {
        setError('Permission to use the camera was denied.');
        return;
      }
      barcodeScannedRef.current = false;
      setStep('scanning');
    } finally {
      barcodeStartInFlightRef.current = false;
    }
  }

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    // onBarcodeScanned fires continuously while a barcode stays in frame, so
    // only the first scan of a session should trigger a lookup — ignore the
    // rest until the user backs out or this lookup finishes either way.
    if (barcodeScannedRef.current) return;
    barcodeScannedRef.current = true;
    lookupBarcode(scan.data);
  }

  async function lookupBarcode(code: string) {
    setStep('analyzing');
    try {
      const analysis = await api.lookupBarcode(code);
      setLogSource('barcode');
      setResult(analysis);
      setStep('review');
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Could not reach the server.');
      setStep('idle');
      barcodeScannedRef.current = false;
    }
  }

  function finishLogging() {
    setPhotoUri(null);
    setResult(null);
    setError(null);
    if (shouldPlayFoxMoment(reduceMotion)) {
      setStep('logged');
    } else {
      setStep('idle');
      router.navigate('/');
    }
  }

  async function confirmSave() {
    if (!result) return;
    setStep('saving');
    try {
      await api.createLog({
        foodName: result.foodName,
        calories: result.calories,
        proteinG: result.proteinG,
        carbsG: result.carbsG,
        fatG: result.fatG,
        source: logSource,
        aiRawResponse: result,
      });
      finishLogging();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Could not save this entry.');
      setStep('review');
    }
  }

  async function logFromStash(item: api.FrequentFood) {
    setStashingId(item.food_name);
    try {
      await api.createLog({
        foodName: item.food_name,
        calories: item.calories,
        proteinG: item.proteinG ?? undefined,
        carbsG: item.carbsG ?? undefined,
        fatG: item.fatG ?? undefined,
        source: 'manual',
      });
      finishLogging();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Could not save this entry.');
    } finally {
      setStashingId(null);
    }
  }

  function reset() {
    setStep('idle');
    setPhotoUri(null);
    setResult(null);
    setError(null);
    setTranscript('');
  }

  function cancelListening() {
    stopSpeechRecognition();
    setStep('idle');
    setTranscript('');
  }

  function cancelScanning() {
    setStep('idle');
    barcodeScannedRef.current = false;
  }

  if (paywallBilling) {
    return <TrialEndedPaywall billing={paywallBilling} onDismiss={() => setPaywallBilling(null)} />;
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
              QUICK SNARE
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Log a meal
            </ThemedText>
          </View>
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

        {step === 'idle' && (
          <>
            <FadeInUp delay={0} style={styles.hub}>
              <HubTile
                icon="camera"
                label="Snap & Track"
                sublabel="AI reads the photo"
                accent
                onPress={() => pickAndAnalyze(true)}
              />
              <HubTile
                icon="images"
                label="From library"
                sublabel="Pick an existing photo"
                onPress={() => pickAndAnalyze(false)}
              />
              <HubTile
                icon="mic"
                label="Voice Input"
                sublabel={isSpeechRecognitionAvailable ? 'Say what you ate' : 'Needs the full app build'}
                onPress={startVoiceInput}
              />
              <HubTile
                icon="barcode"
                label="Barcode Hunt"
                sublabel="Scan a package"
                onPress={startBarcodeHunt}
              />
            </FadeInUp>

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}

            {frequent.length > 0 && (
              <FadeInUp delay={90} style={styles.stashSection}>
                <ThemedText type="smallBold" style={styles.stashTitle}>
                  Quick Stash
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.stashScroll}
                  contentContainerStyle={styles.stashRow}>
                  {frequent.map((item) => (
                    <PressableScale
                      key={item.food_name}
                      onPress={() => logFromStash(item)}
                      disabled={stashingId !== null}
                      style={[styles.stashCard, CardShadowSoft, { backgroundColor: theme.backgroundElement }]}>
                      {stashingId === item.food_name ? (
                        <ActivityIndicator color={theme.accent} />
                      ) : (
                        <>
                          <ThemedText type="smallBold" numberOfLines={1} style={styles.stashName}>
                            {item.food_name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {item.calories} cal
                          </ThemedText>
                        </>
                      )}
                    </PressableScale>
                  ))}
                </ScrollView>
              </FadeInUp>
            )}
          </>
        )}

        {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

        {step === 'listening' && (
          <ThemedView type="backgroundElement" style={[styles.listeningCard, CardShadow]}>
            <Ionicons name="mic" size={32} color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              Listening… say what you ate
            </ThemedText>
            <ThemedText style={styles.transcript}>{transcript}</ThemedText>
            <PressableScale style={styles.secondaryButton} onPress={cancelListening}>
              <ThemedText themeColor="text" style={styles.secondaryButtonText}>
                Cancel
              </ThemedText>
            </PressableScale>
          </ThemedView>
        )}

        {step === 'scanning' && (
          <ThemedView style={styles.scanCard}>
            <CameraView
              style={styles.cameraView}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.scanHint}>
              Point the camera at a barcode
            </ThemedText>
            <PressableScale style={styles.secondaryButton} onPress={cancelScanning}>
              <ThemedText themeColor="text" style={styles.secondaryButtonText}>
                Cancel
              </ThemedText>
            </PressableScale>
          </ThemedView>
        )}

        {step === 'analyzing' && (
          <ThemedView style={styles.centerRow}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              Foxxy is sniffing out the details…
            </ThemedText>
          </ThemedView>
        )}

        {step === 'review' && result && (
          <ThemedView type="backgroundElement" style={[styles.reviewCard, CardShadow]}>
            {result.confidence === 'low' && (
              <ThemedText type="small" style={styles.lowConfidence}>
                Low confidence — double-check these numbers before saving.
              </ThemedText>
            )}
            {!!result.caveat && (
              <ThemedText type="small" style={styles.lowConfidence}>
                {result.caveat}
              </ThemedText>
            )}
            <Field label="Food">
              <TextInput
                value={result.foodName}
                onChangeText={(v) => setResult({ ...result, foodName: v })}
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </Field>
            <ThemedView style={styles.numberRow}>
              <NumberField
                label="Calories"
                value={result.calories}
                onChange={(v) => setResult({ ...result, calories: v })}
              />
              <NumberField
                label="Protein (g)"
                value={result.proteinG}
                onChange={(v) => setResult({ ...result, proteinG: v })}
              />
            </ThemedView>
            <ThemedView style={styles.numberRow}>
              <NumberField
                label="Carbs (g)"
                value={result.carbsG}
                onChange={(v) => setResult({ ...result, carbsG: v })}
              />
              <NumberField
                label="Fat (g)"
                value={result.fatG}
                onChange={(v) => setResult({ ...result, fatG: v })}
              />
            </ThemedView>
            {!!result.notes && (
              <ThemedText type="small" themeColor="textSecondary">
                {result.notes}
              </ThemedText>
            )}

            <ThemedView style={styles.reviewActions}>
              <PressableScale style={styles.secondaryButton} onPress={reset}>
                <ThemedText themeColor="text" style={styles.secondaryButtonText}>
                  Discard
                </ThemedText>
              </PressableScale>
              <PressableScale style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={confirmSave}>
                <ThemedText style={styles.primaryButtonText}>Save to today</ThemedText>
              </PressableScale>
            </ThemedView>
            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}
          </ThemedView>
        )}

        {step === 'saving' && (
          <ThemedView style={styles.centerRow}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              Saving…
            </ThemedText>
          </ThemedView>
        )}

        {step === 'logged' && (
          <ThemedView style={styles.centerRow}>
            <FoxMoment
              kind="order"
              size={96}
              onDone={() => {
                setStep('idle');
                router.navigate('/');
              }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Logged!
            </ThemedText>
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function HubTile({
  icon,
  label,
  sublabel,
  accent,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  accent?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.hubTile,
        accent ? CardShadow : CardShadowSoft,
        { backgroundColor: accent ? theme.accent : theme.backgroundElement },
      ]}>
      <Ionicons name={icon} size={22} color={accent ? '#fff' : theme.text} />
      <ThemedText type="smallBold" style={accent ? styles.hubTileTextAccent : undefined}>
        {label}
      </ThemedText>
      <ThemedText
        type="small"
        style={accent ? styles.hubTileSubAccent : undefined}
        themeColor={accent ? undefined : 'textSecondary'}>
        {sublabel}
      </ThemedText>
    </PressableScale>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <Field label={label}>
      <TextInput
        value={String(Math.round(value))}
        onChangeText={(v) => onChange(Number(v.replace(/[^0-9]/g, '')) || 0)}
        keyboardType="number-pad"
        style={[styles.input, styles.numberInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    </Field>
  );
}

function TrialEndedPaywall({ billing, onDismiss }: { billing: api.BillingStatus; onDismiss: () => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const origin = Platform.OS === 'web' ? window.location.origin : 'app://checkout';
      const { url } = await api.createCheckoutSession(`${origin}/?checkout=success`, `${origin}/?checkout=cancel`);
      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const WebBrowser = await import('expo-web-browser');
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err) {
      setError(
        err instanceof api.ApiError
          ? err.message
          : 'Could not start checkout. Please try again in a moment.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedView style={styles.paywallCard}>
        <ThemedText type="title" style={styles.title}>
          Your free month is up
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.paywallCopy}>
          You've had 30 days of free AI photo scans. Manual logging, your dashboard, and your companion
          are still free — subscribe to keep using AI photo scanning.
        </ThemedText>
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <PressableScale style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={subscribe} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>Subscribe</ThemedText>}
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={onDismiss}>
          <ThemedText themeColor="text" style={styles.secondaryButtonText}>
            Not now
          </ThemedText>
        </PressableScale>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  eyebrow: { letterSpacing: 1.2, fontSize: 11, marginBottom: 2 },
  title: { fontSize: 26, lineHeight: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  gearButton: { padding: Spacing.one },

  hub: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  hubTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 20,
    padding: Spacing.three,
    gap: 4,
    minHeight: 92,
    justifyContent: 'center',
  },
  hubTileTextAccent: { color: '#fff' },
  hubTileSubAccent: { color: 'rgba(255,255,255,0.85)' },

  stashSection: { gap: Spacing.two, marginTop: Spacing.one },
  stashTitle: {},
  stashScroll: { width: '100%', overflow: 'hidden' },
  stashRow: { gap: Spacing.two, paddingRight: Spacing.two },
  stashCard: {
    borderRadius: 16,
    padding: Spacing.three,
    minWidth: 120,
    gap: 2,
    justifyContent: 'center',
  },
  stashName: { maxWidth: 110 },

  primaryButton: {
    borderRadius: 16,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8883',
  },
  secondaryButtonText: { fontWeight: '700' },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    marginTop: Spacing.two,
  },
  centerRow: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  listeningCard: {
    borderRadius: 24,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  transcript: { textAlign: 'center', minHeight: 24 },
  scanCard: { gap: Spacing.two, alignItems: 'center' },
  cameraView: { width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  scanHint: { textAlign: 'center' },
  reviewCard: { borderRadius: 24, padding: Spacing.four, gap: Spacing.three },
  lowConfidence: { color: '#a9781a' },
  field: { gap: 4 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  numberRow: { flexDirection: 'row', gap: Spacing.three },
  numberInput: { flex: 1 },
  reviewActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  error: { color: '#e0473e' },
  paywallCard: {
    maxWidth: MaxContentWidth / 2,
    width: '100%',
    alignSelf: 'center',
    marginTop: Spacing.six,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  paywallCopy: { marginBottom: Spacing.two },
});
