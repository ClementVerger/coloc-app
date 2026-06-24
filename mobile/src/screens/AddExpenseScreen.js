import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { addExpense, getGroupMembers } from '../services/api';
import { useApp } from '../context/AppContext';

const CATEGORIES = [
  { key: 'electricite', label: 'Électricité / gaz' },
  { key: 'courses',     label: 'Courses communes' },
  { key: 'internet',    label: 'Internet' },
  { key: 'autre',       label: 'Autre' },
];

// Répartition égale par défaut : base arrondie à l'entier, le dernier membre
// absorbe le reliquat pour que le total soit toujours exactement 100.
function initEqualShares(members) {
  if (members.length === 0) return {};
  const base = Math.floor(100 / members.length);
  const remainder = 100 - base * members.length;
  return Object.fromEntries(
    members.map((m, i) => [m.id, String(i === members.length - 1 ? base + remainder : base)])
  );
}

export default function AddExpenseScreen({ navigation }) {
  const { currentGroup } = useApp();

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('courses');
  const [splitType, setSplitType] = useState('equal');

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  // shares : { [userId]: percentageString }
  const [shares, setShares] = useState({});

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentGroup) return;
    setMembersLoading(true);
    getGroupMembers(currentGroup.id)
      .then((res) => {
        const m = res.data;
        setMembers(m);
        setShares(initEqualShares(m));
      })
      .catch((err) => console.error('Erreur chargement membres', err?.response?.data || err.message))
      .finally(() => setMembersLoading(false));
  }, [currentGroup]);

  const total = Object.values(shares).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.01;

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant supérieur à 0.');
      return;
    }

    let sharesPayload;
    if (splitType === 'prorata') {
      if (members.length === 0) {
        Alert.alert('Erreur', 'Les membres de la coloc n\'ont pas pu être chargés.');
        return;
      }
      if (!totalOk) {
        Alert.alert('Total incorrect', `Le total des parts doit faire 100 % (actuellement ${total.toFixed(1)} %).`);
        return;
      }
      sharesPayload = members.map((m) => ({
        userId: m.id,
        ratio: parseFloat(shares[m.id] || 0) / 100,
      }));
    }

    setSubmitting(true);
    try {
      await addExpense({
        groupId: currentGroup.id,
        amount: parsed,
        category,
        splitType,
        expenseDate: new Date().toISOString().split('T')[0],
        ...(splitType === 'prorata' && { shares: sharesPayload }),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible d\'enregistrer la dépense.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* ── Montant ── */}
      <Text style={styles.label}>Montant (€)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
      />

      {/* ── Catégorie ── */}
      <Text style={styles.label}>Catégorie</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.chip, category === cat.key && styles.chipActive]}
            onPress={() => setCategory(cat.key)}
          >
            <Text style={[styles.chipText, category === cat.key && styles.chipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Répartition ── */}
      <Text style={styles.label}>Répartition</Text>
      <View style={styles.chipRow}>
        {[
          { key: 'equal',   label: 'Égale' },
          { key: 'prorata', label: 'Prorata' },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, splitType === opt.key && styles.chipActive]}
            onPress={() => setSplitType(opt.key)}
          >
            <Text style={[styles.chipText, splitType === opt.key && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Saisie prorata ── */}
      {splitType === 'prorata' && (
        <View style={styles.prorataBox}>
          {membersLoading ? (
            <ActivityIndicator />
          ) : members.length === 0 ? (
            <Text style={styles.errorText}>Impossible de charger les membres.</Text>
          ) : (
            <>
              {members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                  <View style={styles.percentWrapper}>
                    <TextInput
                      style={styles.percentInput}
                      keyboardType="decimal-pad"
                      value={shares[m.id] ?? ''}
                      onChangeText={(v) => setShares((prev) => ({ ...prev, [m.id]: v }))}
                    />
                    <Text style={styles.percentSign}>%</Text>
                  </View>
                </View>
              ))}

              {/* Total temps réel */}
              <View style={[styles.totalRow, !totalOk && styles.totalRowError]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.totalValue, !totalOk && styles.totalValueError]}>
                  {total.toFixed(1)} %
                </Text>
              </View>
              {!totalOk && (
                <Text style={styles.errorText}>
                  Le total doit être exactement 100 % pour soumettre.
                </Text>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Soumettre ── */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Enregistrer la dépense</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const ACTIVE_COLOR = '#2D6A4F';

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 18, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f7f7f7',
  },
  chipActive: { backgroundColor: ACTIVE_COLOR, borderColor: ACTIVE_COLOR },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  prorataBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberName: { flex: 1, fontSize: 14, marginRight: 8 },
  percentWrapper: { flexDirection: 'row', alignItems: 'center' },
  percentInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 6,
    width: 64,
    textAlign: 'right',
    fontSize: 14,
  },
  percentSign: { marginLeft: 4, fontSize: 14, color: '#555' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalRowError: { borderTopColor: '#e53935' },
  totalLabel: { fontSize: 14, fontWeight: '600' },
  totalValue: { fontSize: 14, fontWeight: '700', color: ACTIVE_COLOR },
  totalValueError: { color: '#e53935' },
  errorText: { fontSize: 12, color: '#e53935', marginTop: 6 },

  submitBtn: {
    backgroundColor: ACTIVE_COLOR,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
