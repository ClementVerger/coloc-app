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
import * as ImagePicker from 'expo-image-picker';
import { addExpense, getGroupMembers, scanReceipt } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

const CATEGORIES = [
  { key: 'electricite', label: 'Électricité / gaz' },
  { key: 'courses',     label: 'Courses communes' },
  { key: 'internet',    label: 'Internet' },
  { key: 'autre',       label: 'Autre' },
];

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
  const [shares, setShares] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanHint, setScanHint] = useState(null);

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

  const handleScanReceipt = () => {
    Alert.alert('Scanner un ticket', "Source de l'image", [
      { text: 'Prendre une photo', onPress: () => pickAndScan('camera') },
      { text: 'Choisir depuis la galerie', onPress: () => pickAndScan('library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const pickAndScan = async (source) => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission refusée', "L'accès à la caméra est nécessaire pour scanner un ticket.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire pour importer une image.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      }

      if (result.canceled) return;

      const asset = result.assets[0];
      setScanning(true);
      setScanHint(null);

      const formData = new FormData();
      formData.append('receipt', { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: 'receipt.jpg' });

      try {
        const res = await scanReceipt(formData);
        const { amount } = res.data;
        if (amount !== null && amount > 0) {
          setAmount(amount.toFixed(2));
          setScanHint('success');
        } else {
          setScanHint('failure');
        }
      } catch {
        setScanHint('failure');
      } finally {
        setScanning(false);
      }
    } catch {
      Alert.alert('Erreur', "Impossible d'accéder à l'appareil photo ou à la galerie.");
    }
  };

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant supérieur à 0.');
      return;
    }

    let sharesPayload;
    if (splitType === 'prorata') {
      if (members.length === 0) {
        Alert.alert('Erreur', "Les membres de la coloc n'ont pas pu être chargés.");
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
      Alert.alert('Erreur', err?.response?.data?.error || "Impossible d'enregistrer la dépense.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Scanner un ticket ── */}
      <TouchableOpacity
        style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
        onPress={handleScanReceipt}
        disabled={scanning}
      >
        {scanning ? (
          <>
            <ActivityIndicator color={colors.terracotta} style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Analyse du ticket...</Text>
          </>
        ) : (
          <Text style={styles.scanBtnText}>📷  Scanner un ticket</Text>
        )}
      </TouchableOpacity>

      {/* ── Montant ── */}
      <Input
        label="Montant (€)"
        style={styles.amountInput}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
      />
      {scanHint === 'success' && (
        <Text style={styles.scanHintSuccess}>Montant détecté, vérifie qu'il est correct.</Text>
      )}
      {scanHint === 'failure' && (
        <Text style={styles.scanHintFailure}>
          Impossible de lire le montant automatiquement, saisis-le manuellement.
        </Text>
      )}

      {/* ── Catégorie ── */}
      <Text style={styles.sectionLabel}>Catégorie</Text>
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
      <Text style={styles.sectionLabel}>Répartition</Text>
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
        <Card style={styles.prorataCard}>
          {membersLoading ? (
            <ActivityIndicator color={colors.terracotta} />
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
        </Card>
      )}

      {/* ── Soumettre ── */}
      <Button
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitBtn}
      >
        Enregistrer la dépense
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  contentContainer: { padding: spacing.base, paddingBottom: spacing.xl * 2 },

  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.terracotta,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    backgroundColor: colors.terracottaLight,
  },
  scanBtnDisabled: { opacity: 0.6 },
  scanBtnText: { color: colors.terracotta, fontSize: 15, fontWeight: '600' },
  scanHintSuccess: { fontSize: 12, color: colors.avocado, marginTop: spacing.xs, marginBottom: spacing.sm },
  scanHintFailure: { fontSize: 12, color: colors.danger, marginTop: spacing.xs, marginBottom: spacing.sm },

  amountInput: { marginBottom: spacing.xs },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: colors.paper,
  },
  chipActive: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  chipText: { fontSize: 13, color: colors.inkMuted },
  chipTextActive: { color: colors.white, fontWeight: '600' },

  prorataCard: { marginTop: spacing.md },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberName: { flex: 1, fontSize: 14, color: colors.ink, marginRight: spacing.sm },
  percentWrapper: { flexDirection: 'row', alignItems: 'center' },
  percentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 6,
    width: 64,
    textAlign: 'right',
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  percentSign: { marginLeft: spacing.xs, fontSize: 14, color: colors.inkMuted },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  totalRowError: { borderTopColor: colors.danger },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  totalValue: { fontSize: 14, fontWeight: '700', color: colors.avocado },
  totalValueError: { color: colors.danger },
  errorText: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },

  submitBtn: { marginTop: spacing.xl },
});
