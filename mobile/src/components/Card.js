import { View, StyleSheet } from 'react-native';
import { theme } from '../theme/theme';

const { colors, radius, shadows, spacing } = theme;

export default function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...shadows.card,
  },
});
