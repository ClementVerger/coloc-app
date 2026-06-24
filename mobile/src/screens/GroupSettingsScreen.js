import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { getGroupMembers, leaveGroup, getMyGroups } from '../services/api';
import { useApp } from '../context/AppContext';

export default function GroupSettingsScreen({ navigation }) {
  const { currentGroup, dbUser, setCurrentGroup, setMyGroups } = useApp();
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

      // Recharge la liste des colocs restantes
      const groupsRes = await getMyGroups();
      const remaining = groupsRes.data;
      setMyGroups(remaining);

      if (remaining.length === 1) {
        // Auto-sélection de la seule coloc restante
        setCurrentGroup(remaining[0]);
      } else {
        // 0 coloc → Onboarding | 2+ colocs → GroupSelector (via navigator)
        setCurrentGroup(null);
      }
    } catch (err) {
      Alert.alert('Impossible de quitter', err?.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setLeaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.groupName}>{currentGroup?.name}</Text>

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

      {/* Bouton quitter — visible uniquement pour l'utilisateur lui-même */}
      <View style={styles.leaveSection}>
        <Text style={styles.warningText}>
          ⚠ Si vous quittez la coloc, les dépenses passées restent enregistrées et vos soldes
          existants sont conservés. En revanche, les futures dépenses ne vous seront plus
          réparties automatiquement.{'\n'}
          Note MVP : aucun recalcul rétroactif n'est effectué.
        </Text>

        <TouchableOpacity
          style={[styles.leaveBtn, leaving && styles.leaveBtnDisabled]}
          onPress={confirmLeave}
          disabled={leaving}
        >
          {leaving ? (
            <ActivityIndicator color="#e53935" />
          ) : (
            <Text style={styles.leaveBtnText}>Quitter cette coloc</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center' },
  groupName: { fontSize: 13, color: '#888', marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberName: { fontSize: 15, fontWeight: '500' },
  memberEmail: { fontSize: 12, color: '#888', marginTop: 2 },
  role: { fontSize: 12, color: '#2D6A4F', fontWeight: '600' },
  leaveSection: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  warningText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 16,
  },
  leaveBtn: {
    borderWidth: 1.5,
    borderColor: '#e53935',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  leaveBtnDisabled: { opacity: 0.5 },
  leaveBtnText: { color: '#e53935', fontWeight: '600', fontSize: 15 },
});
