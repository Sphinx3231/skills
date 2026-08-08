import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Bitter_600SemiBold, Bitter_700Bold } from '@expo-google-fonts/bitter';
import { WorkSans_400Regular, WorkSans_500Medium, WorkSans_700Bold } from '@expo-google-fonts/work-sans';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import SignInScreen from './sign-in';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { registerApiTokenGetter } from '@/lib/api';
import { SettingsProvider } from '@/lib/settings-context';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — set it in app/.env (get it from your Clerk dashboard).'
  );
}

function Root() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  registerApiTokenGetter(getToken);

  if (!isLoaded) return null;
  return isSignedIn ? <AppTabs /> : <SignInScreen />;
}

// Split out so `useColorScheme()` (which reads the settings-context override
// via useUserSettings()) runs *inside* the SettingsProvider tree rendered by
// TabLayout below, not in the same component that mounts the provider —
// a hook call can't reach a Context.Provider it hasn't been rendered under
// yet.
function ThemedApp({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const colorScheme = useColorScheme();
  return (
    <ClerkProvider publishableKey={publishableKey!} tokenCache={tokenCache}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* If the fonts fail to load, don't hang the splash forever waiting
            on `fontsLoaded` — reveal the app (with fallback fonts) instead. */}
        <AnimatedSplashOverlay ready={fontsLoaded || !!fontError} />
        <Root />
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default function TabLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Bitter_600SemiBold,
    Bitter_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_700Bold,
  });
  return (
    <SettingsProvider>
      <ThemedApp fontsLoaded={fontsLoaded} fontError={fontError} />
    </SettingsProvider>
  );
}
