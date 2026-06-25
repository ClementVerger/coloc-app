import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function GroupSelectorScreen({ navigation }) {
  const { signOut } = useAuth();
  const { myGroups, selectGroup } = useApp();

  const handleSelectGroup = async (group) => {
    await selectGroup(group);
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes colocs</Text>
        <TouchableOpacity onPress={() => signOut()}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Sélectionnez la coloc à ouvrir.</Text>

      <FlatList
        data={myGroups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleSelectGroup(item)} activeOpacity={0.8}>
            <Card style={styles.card}>
              <View style={styles.cardMain}>
                <Text style={styles.groupName}>{item.name}</Text>
                {item.address ? <Text style={styles.groupAddress}>{item.address}</Text> : null}
              </View>
              <Text style={styles.memberCount}>
                {item.member_count ?? '—'} membre{item.member_count > 1 ? 's' : ''}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: spacing.base }}
      />

      <Button
        variant="secondary"
        onPress={() => navigation.navigate('Onboarding')}
        style={styles.newGroupBtn}
      >
        + Rejoindre ou créer une nouvelle coloc
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  signOutText: { fontSize: 13, color: colors.inkLight },
  subtitle: { fontSize: 14, color: colors.inkMuted, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardMain: { flex: 1, marginRight: spacing.md },
  groupName: { fontSize: 17, fontWeight: '600', color: colors.terracotta },
  groupAddress: { fontSize: 13, color: colors.inkLight, marginTop: spacing.xs },
  memberCount: { fontSize: 12, color: colors.inkLight, textAlign: 'right' },
  newGroupBtn: { marginTop: spacing.sm, marginBottom: spacing.lg },
});
