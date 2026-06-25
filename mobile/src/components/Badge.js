import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function Badge({ type = 'neutral', value, label }) {
  return (
    <View style={[styles.badge, styles[`${type}Badge`]]}>
      {label ? <Text style={[styles.label, styles[`${type}Text`]]}>{label}</Text> : null}
      <Text style={[styles.value, styles[`${type}Text`]]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  positiveBadge: { backgroundColor: colors.avocadoLight },
  negativeBadge: { backgroundColor: colors.dangerLight },
  neutralBadge: { backgroundColor: colors.slateLight },
  value: { fontSize: 14, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 1 },
  positiveText: { color: colors.avocado },
  negativeText: { color: colors.danger },
  neutralText: { color: colors.slate },
});
