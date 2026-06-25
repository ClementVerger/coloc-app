import { View, StyleSheet } from 'react-native';
import { theme } from '../theme/theme';

const { colors, spacing } = theme;

export default function ScreenContainer({ children, style, centered = false }) {
  return (
    <View style={[styles.container, centered && styles.centered, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.base,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
