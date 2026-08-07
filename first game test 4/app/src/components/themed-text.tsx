import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: TypeScale.sm,
    lineHeight: 18,
    fontFamily: Fonts.bodyRegular,
  },
  smallBold: {
    fontSize: TypeScale.sm,
    lineHeight: 18,
    fontFamily: Fonts.bodyBold,
  },
  default: {
    fontSize: TypeScale.base,
    lineHeight: 22,
    fontFamily: Fonts.body,
  },
  title: {
    fontSize: TypeScale.display,
    lineHeight: 54,
    fontFamily: Fonts.display,
  },
  subtitle: {
    fontSize: TypeScale.xxl,
    lineHeight: 38,
    fontFamily: Fonts.displaySemiBold,
  },
  link: {
    lineHeight: 20,
    fontSize: TypeScale.sm,
    fontFamily: Fonts.bodyRegular,
  },
  linkPrimary: {
    lineHeight: 20,
    fontSize: TypeScale.sm,
    fontFamily: Fonts.bodyRegular,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: TypeScale.xs,
  },
});
