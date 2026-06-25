import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { getGroupMembers, leaveGroup, getMyGroups } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import ScreenContainer from '../components/ScreenContainer';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function GroupSettingsScreen({ navigation }) {
  const { currentGroup, dbUser, setMyGroups, selectGroup } = useApp();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!currentGroup) { setLoading(false); return; }
    getGroupMembers(currentGroup.id)
      .then((res) => setMembers(res.data))
      .catch((err) => console.error('Erreur chargement membres', err?.response?.data || err.message))
      .finally(() => setLoading(false));
  }, [currentGroup]);

  const confirmLeave = () => {
    Alert.alert(
      'Quitter la coloc',
      `Vous allez quitter "${currentGroup?.name}". Les dépenses passées restent inchangées ; vous ne participerez plus aux futures répartitions.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: handleLeave },
      ]
    );
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveGroup(currentGroup.id);

      const groupsRes = await getMyGroups();
      const remaining = groupsRes.data;
      setMyGroups(remaining);

      if (remaining.length === 1) {
        await selectGroup(remaining[0]);
      } else {
        await selectGroup(null);
      }
    } catch (err) {
      Alert.alert('Impossible de quitter', err?.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setLeaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer centered>
        <ActivityIndicator color={colors.terracotta} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.groupSubtitle}>{currentGroup?.name}</Text>

      <Text style={styles.sectionTitle}>Membres actifs</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberEmail}>{item.email}</Text>
            </View>
            <Text style={styles.role}>{item.role === 'creator' ? 'Créateur' : 'Membre'}</Text>
          </View>
        )}
      />

      <View style={styles.leaveSection}>
        <Text style={styles.warningText}>
          ⚠ Si vous quittez la coloc, les dépenses passées restent enregistrées et vos soldes
          existants sont conservés. En revanche, les futures dépenses ne vous seront plus
          réparties automatiquement.{'\n'}
          Note MVP : aucun recalcul rétroactif n'est effectué.
        </Text>

        <Button variant="danger" onPress={confirmLeave} loading={leaving}>
          Quitter cette coloc
        </Button>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  groupSubtitle: {
    fontSize: 13,
    color: colors.inkMuted,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberName: { fontSize: 15, fontWeight: '500', color: colors.ink },
  memberEmail: { fontSize: 12, color: colors.inkLight, marginTop: 2 },
  role: { fontSize: 12, color: colors.slate, fontWeight: '600' },
  leaveSection: {
    marginTop: spacing.xl,
    padding: spacing.base,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: spacing.base,
  },
  warningText: {
    fontSize: 13,
    color: colors.inkMuted,
    lineHeight: 20,
  },
});
