import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getDeposit, addDeposit } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Input from '../components/Input';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function DepositScreen() {
  const { currentGroup } = useApp();
  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDeposit = useCallback(async () => {
    if (!currentGroup) return;
    setLoading(true);
    try {
      const res = await getDeposit(currentGroup.id);
      setDeposit(res.data);
    } catch (err) {
      console.error('Erreur chargement caution', err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadDeposit();
  }, [loadDeposit]);

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant supérieur à 0.');
      return;
    }
    setSubmitting(true);
    try {
      await addDeposit({ groupId: currentGroup.id, amountContributed: parsed });
      setAmount('');
      await loadDeposit();
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || "Impossible d'enregistrer la contribution.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ── Récapitulatif ── */}
      <View style={styles.totalCard}>
        <Text style={styles.totalCardLabel}>Total versé</Text>
        <Text style={styles.totalCardAmount}>{deposit?.total?.toFixed(2) ?? '0.00'} €</Text>
      </View>

      <Text style={styles.sectionTitle}>Contributions</Text>
      {deposit?.contributions?.length === 0 ? (
        <Text style={styles.emptyText}>Aucune contribution enregistrée.</Text>
      ) : (
        deposit?.contributions?.map((c) => (
          <View key={c.user_id} style={styles.row}>
            <Text style={styles.memberName}>{c.name}</Text>
            <Text style={styles.memberAmount}>{Number(c.total_contributed).toFixed(2)} €</Text>
          </View>
        ))
      )}

      {/* ── Formulaire contribution ── */}
      <Text style={styles.sectionTitle}>Enregistrer ma contribution</Text>
      <Text style={styles.hint}>
        Chaque versement est ajouté au total de la coloc. Vous pouvez en saisir plusieurs.
      </Text>

      <Input
        label="Montant (€)"
        style={styles.amountInput}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
      />

      <Button onPress={handleSubmit} loading={submitting}>
        Enregistrer ma contribution
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  container: { flex: 1, backgroundColor: colors.cream },
  contentContainer: { padding: spacing.base, paddingBottom: spacing.xl * 2 },

  totalCard: {
    backgroundColor: colors.slate,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  totalCardLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: spacing.xs },
  totalCardAmount: { color: colors.white, fontSize: 36, fontWeight: '700' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: { color: colors.inkLight, fontSize: 14, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberName: { fontSize: 14, color: colors.ink },
  memberAmount: { fontSize: 14, fontWeight: '600', color: colors.ink },

  hint: { fontSize: 12, color: colors.inkLight, marginBottom: spacing.md, lineHeight: 18 },
  amountInput: { marginBottom: spacing.base },
});
