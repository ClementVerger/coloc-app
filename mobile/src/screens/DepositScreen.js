import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getDeposit, addDeposit } from '../services/api';
import { useApp } from '../context/AppContext';

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
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible d\'enregistrer la contribution.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView style={styles.container}>
      {/* ── Récapitulatif ── */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total versé</Text>
        <Text style={styles.totalAmount}>{deposit?.total?.toFixed(2) ?? '0.00'} €</Text>
      </View>

      <Text style={styles.sectionTitle}>Contributions</Text>
      {deposit?.contributions?.length === 0 ? (
        <Text style={styles.empty}>Aucune contribution enregistrée.</Text>
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

      <Text style={styles.label}>Montant (€)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Enregistrer ma contribution</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center' },

  totalCard: {
    backgroundColor: '#2D6A4F',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 },
  totalAmount: { color: '#fff', fontSize: 36, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  empty: { color: '#aaa', fontSize: 14, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberName: { fontSize: 14 },
  memberAmount: { fontSize: 14, fontWeight: '600', color: '#333' },

  hint: { fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
