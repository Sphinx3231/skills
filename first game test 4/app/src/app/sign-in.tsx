import { useSignIn, useSignUp } from '@clerk/expo';
// The stable useSSO() from '@clerk/expo' does not auto-activate the session
// after the OAuth/CAPTCHA round-trip — the experimental one (matching the
// "future resource" API used for password auth below) does, and is what
// Clerk's own SSO guidance now points to for Expo apps.
import { useSSO } from '@clerk/expo/experimental';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const colors = {
  bg: '#131316',
  input: '#1c1c20',
  border: '#2c2c31',
  text: '#f5f5f7',
  textDim: '#9a9aa3',
  placeholder: '#6b6b73',
  accent: '#6c47ff',
  link: '#a78bfa',
  error: '#f87171',
  devMode: '#f0a742',
};

const isDevInstance = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_');

type SSOStrategy = 'oauth_apple' | 'oauth_github' | 'oauth_google';

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'submit' | SSOStrategy | null>(null);

  // Sign in — identifier-first, two visual steps
  const [signInStep, setSignInStep] = useState<'identifier' | 'password'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Sign up — single form, then email verification
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  // 'signUp' = post-signup email verification; 'signInTrust' = Clerk's
  // Client Trust check on sign-in from an unrecognized device/browser
  // (status 'needs_client_trust') — same code-entry UI, different resource
  // methods and finalize target underneath.
  const [verifying, setVerifying] = useState<'signUp' | 'signInTrust' | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    // warmUpAsync/coolDownAsync pre-launch a Custom Tab on Android to make
    // the OAuth browser open faster — native-only, no equivalent on web.
    if (Platform.OS === 'web') return;
    WebBrowser.warmUpAsync();
    return () => {
      WebBrowser.coolDownAsync();
    };
  }, []);

  function resetToStart() {
    setError(null);
    setSignInStep('identifier');
    setVerifying(null);
    setCode('');
  }

  async function submitSignIn() {
    if (!signIn) return;
    if (signInStep === 'identifier') {
      if (!identifier) return;
      setError(null);
      setSignInStep('password');
      return;
    }

    setError(null);
    setBusy('submit');
    try {
      const { error: signInError } = await signIn.password({ identifier, password: signInPassword });
      if (signInError) {
        setError(signInError.message ?? 'Could not sign in with those details.');
        return;
      }

      // Clerk's Client Trust check: a correct password from an
      // unrecognized device/browser lands here instead of 'complete'.
      // finalize() would throw ("Cannot finalize sign-in without a
      // created session") if called without resolving this first.
      if (signIn.status === 'needs_client_trust') {
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) {
          setError(sendError.message ?? 'Could not send a verification code.');
          return;
        }
        setVerifying('signInTrust');
        return;
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) setError(finalizeError.message ?? 'Could not complete sign-in.');
    } finally {
      setBusy(null);
    }
  }

  async function submitSignInTrustVerification() {
    if (!signIn) return;
    setError(null);
    setBusy('submit');
    try {
      const { error: verifyError } = await signIn.mfa.verifyEmailCode({ code });
      if (verifyError) {
        setError(verifyError.message ?? 'That code didn’t work — try again.');
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) setError(finalizeError.message ?? 'Could not complete sign-in.');
    } finally {
      setBusy(null);
    }
  }

  async function submitSignUp() {
    if (!signUp) return;
    setError(null);
    setBusy('submit');
    try {
      const { error: signUpError } = await signUp.password({
        emailAddress: signUpEmail,
        password: signUpPassword,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(username ? { username } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
      });
      if (signUpError) {
        setError(signUpError.message ?? 'Could not create your account — check the details above.');
        return;
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setError(sendError.message ?? 'Could not send a verification code.');
        return;
      }
      setVerifying('signUp');
    } finally {
      setBusy(null);
    }
  }

  async function submitVerification() {
    if (!signUp) return;
    setError(null);
    setBusy('submit');
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyError) {
        setError(verifyError.message ?? 'That code didn’t work — try again.');
        return;
      }
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) setError(finalizeError.message ?? 'Could not complete sign-up.');
    } finally {
      setBusy(null);
    }
  }

  const signInWithSSO = useCallback(
    async (strategy: SSOStrategy) => {
      setError(null);
      setBusy(strategy);
      try {
        const result = await startSSOFlow({ strategy });
        if (result.createdSessionId) return; // useAuth() picks this up automatically

        // No session yet — the OAuth handshake finished, but Clerk needs one
        // more step (e.g. finalize after a bot-protection challenge) before
        // the session activates. Try to finish whichever resource came back.
        const pending = result.signUp ?? result.signIn;
        if (!pending) {
          setError('Sign-in did not complete — please try again.');
          console.warn('SSO returned no session and no pending resource:', result);
          return;
        }
        const { error: finalizeError } = await pending.finalize();
        if (finalizeError) {
          setError(finalizeError.message ?? 'Could not complete sign-in.');
          const p = pending as any;
          console.warn(
            [
              'SSO finalize failed: ' + finalizeError.message,
              'resource status: ' + p.status,
              'missingFields: ' + JSON.stringify(p.missingFields),
              'unverifiedFields: ' + JSON.stringify(p.unverifiedFields),
              'requiredFields: ' + JSON.stringify(p.requiredFields),
              'optionalFields: ' + JSON.stringify(p.optionalFields),
            ].join('\n')
          );
        }
      } catch (err: any) {
        setError(err?.errors?.[0]?.longMessage ?? err?.message ?? 'Could not complete sign-in.');
      } finally {
        setBusy(null);
      }
    },
    [startSSOFlow]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {verifying ? (
            <VerifyStep
              email={verifying === 'signUp' ? signUpEmail : identifier}
              code={code}
              onChangeCode={setCode}
              onSubmit={verifying === 'signUp' ? submitVerification : submitSignInTrustVerification}
              error={error}
              busy={busy === 'submit'}
            />
          ) : mode === 'signIn' ? (
            <SignInForm
              step={signInStep}
              identifier={identifier}
              onChangeIdentifier={setIdentifier}
              password={signInPassword}
              onChangePassword={setSignInPassword}
              showPassword={showSignInPassword}
              onToggleShowPassword={() => setShowSignInPassword((v) => !v)}
              onBack={() => setSignInStep('identifier')}
              onSubmit={submitSignIn}
              onSSO={signInWithSSO}
              onSwitchMode={() => {
                setMode('signUp');
                resetToStart();
              }}
              error={error}
              busy={busy}
            />
          ) : (
            <SignUpForm
              firstName={firstName}
              onChangeFirstName={setFirstName}
              lastName={lastName}
              onChangeLastName={setLastName}
              username={username}
              onChangeUsername={setUsername}
              email={signUpEmail}
              onChangeEmail={setSignUpEmail}
              phoneNumber={phoneNumber}
              onChangePhoneNumber={setPhoneNumber}
              password={signUpPassword}
              onChangePassword={setSignUpPassword}
              showPassword={showSignUpPassword}
              onToggleShowPassword={() => setShowSignUpPassword((v) => !v)}
              onSubmit={submitSignUp}
              onSSO={signInWithSSO}
              onSwitchMode={() => {
                setMode('signIn');
                resetToStart();
              }}
              error={error}
              busy={busy}
            />
          )}

          {/* Required for sign-up flows on web — Clerk skips the CAPTCHA on iOS/Android */}
          <View nativeID="clerk-captcha" />

          <Footer />
        </View>
      </ScrollView>
    </View>
  );
}

function SocialRow({ onPress, busy }: { onPress: (s: SSOStrategy) => void; busy: 'submit' | SSOStrategy | null }) {
  const providers: { strategy: SSOStrategy; icon: keyof typeof Ionicons.glyphMap }[] = [
    { strategy: 'oauth_apple', icon: 'logo-apple' },
    { strategy: 'oauth_github', icon: 'logo-github' },
    { strategy: 'oauth_google', icon: 'logo-google' },
  ];
  return (
    <View style={styles.socialRow}>
      {providers.map(({ strategy, icon }) => (
        <Pressable
          key={strategy}
          testID={`sso-${strategy}`}
          onPress={() => onPress(strategy)}
          disabled={busy !== null}
          style={({ pressed }) => [
            styles.socialButton,
            { opacity: busy && busy !== strategy ? 0.4 : pressed ? 0.75 : 1 },
          ]}>
          {busy === strategy ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name={icon} size={20} color={colors.text} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function Field({
  label,
  right,
  style,
  ...inputProps
}: {
  label: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={style}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {right}
      </View>
      <TextInput placeholderTextColor={colors.placeholder} style={styles.input} {...inputProps} />
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Create a password"
          placeholderTextColor={colors.placeholder}
          secureTextEntry={!show}
          style={[styles.input, styles.passwordInput]}
        />
        <Pressable onPress={onToggleShow} style={styles.eyeButton} hitSlop={8} testID="toggle-password-visibility">
          <Ionicons name={show ? 'eye-off' : 'eye'} size={18} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.continueButton, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <Text style={styles.continueButtonText}>{label}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </>
      )}
    </Pressable>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <Text style={styles.error}>{error}</Text>;
}

function Footer() {
  return (
    <View style={styles.footer}>
      <View style={styles.footerRow}>
        <Ionicons name="shield-checkmark" size={12} color={colors.textDim} />
        <Text style={styles.footerText}>Secured by Clerk</Text>
      </View>
      {isDevInstance && <Text style={styles.devModeText}>Development mode</Text>}
    </View>
  );
}

function SignInForm(props: {
  step: 'identifier' | 'password';
  identifier: string;
  onChangeIdentifier: (v: string) => void;
  password: string;
  onChangePassword: (v: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onSSO: (s: SSOStrategy) => void;
  onSwitchMode: () => void;
  error: string | null;
  busy: 'submit' | SSOStrategy | null;
}) {
  return (
    <>
      <Text style={styles.title}>Sign in to FoxBite</Text>
      <Text style={styles.subtitle}>Welcome back! Please sign in to continue</Text>

      {props.step === 'identifier' && <SocialRow onPress={props.onSSO} busy={props.busy} />}
      {props.step === 'identifier' && <Divider />}

      {props.step === 'identifier' ? (
        <Field
          label="Email address or username"
          value={props.identifier}
          onChangeText={props.onChangeIdentifier}
          placeholder="Enter email or username"
          autoCapitalize="none"
        />
      ) : (
        <View>
          <Pressable onPress={props.onBack} style={styles.backRow} hitSlop={8}>
            <Ionicons name="chevron-back" size={14} color={colors.link} />
            <Text style={styles.backText}>{props.identifier}</Text>
          </Pressable>
          <PasswordField
            label="Password"
            value={props.password}
            onChangeText={props.onChangePassword}
            show={props.showPassword}
            onToggleShow={props.onToggleShowPassword}
          />
        </View>
      )}

      <ErrorText error={props.error} />

      <PrimaryButton
        label="Continue"
        onPress={props.onSubmit}
        loading={props.busy === 'submit'}
        disabled={
          props.busy !== null ||
          (props.step === 'identifier' ? !props.identifier : props.password.length < 8)
        }
      />

      <Pressable onPress={props.onSwitchMode}>
        <Text style={styles.switchModeText}>
          Don't have an account? <Text style={styles.switchModeLink}>Sign up</Text>
        </Text>
      </Pressable>
    </>
  );
}

function SignUpForm(props: {
  firstName: string;
  onChangeFirstName: (v: string) => void;
  lastName: string;
  onChangeLastName: (v: string) => void;
  username: string;
  onChangeUsername: (v: string) => void;
  email: string;
  onChangeEmail: (v: string) => void;
  phoneNumber: string;
  onChangePhoneNumber: (v: string) => void;
  password: string;
  onChangePassword: (v: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
  onSSO: (s: SSOStrategy) => void;
  onSwitchMode: () => void;
  error: string | null;
  busy: 'submit' | SSOStrategy | null;
}) {
  return (
    <>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Welcome! Please fill in the details to get started.</Text>

      <SocialRow onPress={props.onSSO} busy={props.busy} />
      <Divider />

      <View style={styles.nameRow}>
        <Field
          label="First name"
          value={props.firstName}
          onChangeText={props.onChangeFirstName}
          placeholder="First name"
          style={styles.nameField}
        />
        <Field
          label="Last name"
          value={props.lastName}
          onChangeText={props.onChangeLastName}
          placeholder="Last name"
          style={styles.nameField}
        />
      </View>

      <Field
        label="Username"
        value={props.username}
        onChangeText={props.onChangeUsername}
        placeholder="Enter your username"
        autoCapitalize="none"
      />
      <Field
        label="Email address"
        value={props.email}
        onChangeText={props.onChangeEmail}
        placeholder="Enter your email address"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Phone number"
        value={props.phoneNumber}
        onChangeText={props.onChangePhoneNumber}
        placeholder="+1 234 567 8900"
        keyboardType="phone-pad"
      />
      <PasswordField
        label="Password"
        value={props.password}
        onChangeText={props.onChangePassword}
        show={props.showPassword}
        onToggleShow={props.onToggleShowPassword}
      />

      <ErrorText error={props.error} />

      <PrimaryButton
        label="Continue"
        onPress={props.onSubmit}
        loading={props.busy === 'submit'}
        disabled={props.busy !== null || !props.email || props.password.length < 8}
      />

      <Pressable onPress={props.onSwitchMode}>
        <Text style={styles.switchModeText}>
          Already have an account? <Text style={styles.switchModeLink}>Sign in</Text>
        </Text>
      </Pressable>
    </>
  );
}

function VerifyStep({
  email,
  code,
  onChangeCode,
  onSubmit,
  error,
  busy,
}: {
  email: string;
  code: string;
  onChangeCode: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  busy: boolean;
}) {
  return (
    <>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>Enter the verification code we just sent to {email}.</Text>

      <Field label="Verification code" value={code} onChangeText={onChangeCode} placeholder="123456" keyboardType="numeric" />

      <ErrorText error={error} />

      <PrimaryButton label="Verify" onPress={onSubmit} loading={busy} disabled={busy || code.length === 0} />
    </>
  );
}

// Plain Text avoids pulling in the app's adaptive ThemedText — this screen
// commits to one fixed dark look (matching Clerk's own account portal),
// not the system light/dark theme.
function Text(props: TextProps) {
  return <RNText {...props} style={[{ color: colors.text }, props.style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, gap: 4 },

  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.textDim, textAlign: 'center', marginTop: 4, marginBottom: 20 },

  socialRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  socialButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textDim },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', color: colors.text },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 14,
  },

  nameRow: { flexDirection: 'row', gap: 10 },
  nameField: { flex: 1 },

  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 40 },
  eyeButton: { position: 'absolute', right: 12, top: 0, bottom: 14, justifyContent: 'center' },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  backText: { fontSize: 13, color: colors.link, fontWeight: '600' },

  error: { fontSize: 12.5, color: colors.error, marginBottom: 12 },

  continueButton: {
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  continueButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  switchModeText: { fontSize: 13, color: colors.textDim, textAlign: 'center', marginTop: 24 },
  switchModeLink: { color: colors.link, fontWeight: '600' },

  footer: { alignItems: 'center', marginTop: 28, gap: 4 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 11, color: colors.textDim },
  devModeText: { fontSize: 11, color: colors.devMode, fontWeight: '600' },
});
