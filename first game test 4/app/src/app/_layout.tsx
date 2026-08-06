import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import SignInScreen from './sign-in';
import { registerApiTokenGetter } from '@/lib/api';

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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ClerkProvider publishableKey={publishableKey!} tokenCache={tokenCache}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Root />
      </ThemeProvider>
    </ClerkProvider>
  );
}
