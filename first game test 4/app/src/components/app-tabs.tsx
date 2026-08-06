import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <Label>Today</Label>
        <Icon src={require('@/assets/images/tabIcons/home.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="log">
        <Label>Log</Label>
        <Icon src={require('@/assets/images/tabIcons/log.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="companion">
        <Label>Companion</Label>
        <Icon src={require('@/assets/images/tabIcons/companion.png')} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
