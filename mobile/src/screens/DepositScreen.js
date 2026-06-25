import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { getDeposit, addDeposit, transferDeposit, settleDeposit, getGroupMembers } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Input from '../components/Input';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function DepositScreen() {
  const { currentGroup, dbUser } = useApp();
  const [deposit, setDeposit] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulaire contribution
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Formulaire transfert
  const [transferRecipient, setTransferRecipient] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Section restitution finale
  const [settleVisible, setSettleVisible] = useState(false);
  const [settleAmountReturned, setSettleAmountReturned] = useState('');
  const [settleResult, setSettleResult] = useState(null);
  const [settleLoading, setSettleLoading] = useState(false);

  const loadDeposit = useCallback(async () => {
    if (!currentGroup) return;
    setLoading(true);
    try {
      const [depositRes, membersRes] = await Promise.all([
        getDeposit(currentGroup.id),
        getGroupMembers(currentGroup.id),
      ]);
      const depositData = depositRes.data;
      setDeposit(depositData);
      setMembers(membersRes.data);

      // Pré-remplir le montant du transfert avec la contribution nette de l'utilisateur courant
      if (dbUser) {
        const myContrib = depositData.contributions?.find((c) => c.user_id === dbUser.id);
        if (myContrib) {
          setTransferAmount(Number(myContrib.net_contribution).toFixed(2));
        }
      }
    } catch (err) {
      console.error('Erreur chargement caution', err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup, dbUser]);

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

  const handleTransfer = async () => {
    if (!transferRecipient) {
      Alert.alert('Destinataire manquant', 'Sélectionnez un destinataire.');
      return;
    }
    const parsed = parseFloat(transferAmount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant supérieur à 0.');
      return;
    }
    setTransferSubmitting(true);
    try {
      await transferDeposit({
        groupId: currentGroup.id,
        fromUserId: dbUser.id,
        toUserId: transferRecipient,
        amount: parsed,
      });
      setTransferRecipient(null);
      await loadDeposit();
      Alert.alert('Transfert enregistré', 'Le transfert de part a bien été enregistré.');
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || "Impossible d'enregistrer le transfert.");
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleSettle = async () => {
    const parsed = parseFloat(settleAmountReturned);
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert('Montant invalide', 'Entrez un montant supérieur ou égal à 0.');
      return;
    }
    setSettleLoading(true);
    try {
      const res = await settleDeposit({ groupId: currentGroup.id, amountReturned: parsed });
      setSettleResult(res.data);
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible de calculer la répartition.');
    } finally {
      setSettleLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  const currentUserNet = Number(
    deposit?.contributions?.find((c) => c.user_id === dbUser?.id)?.net_contribution ?? 0
  );
  const otherMembers = members.filter((m) => m.id !== dbUser?.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

      {/* ── Total brut versé ── */}
      <View style={styles.totalCard}>
        <Text style={styles.totalCardLabel}>Total versé</Text>
        <Text style={styles.totalCardAmount}>{deposit?.total?.toFixed(2) ?? '0.00'} €</Text>
      </View>

      {/* ── Contributions nettes ── */}
      <Text style={styles.sectionTitle}>Contributions nettes</Text>
      {deposit?.contributions?.length === 0 ? (
        <Text style={styles.emptyText}>Aucune contribution enregistrée.</Text>
      ) : (
        deposit?.contributions?.map((c) => (
          <View key={c.user_id} style={styles.row}>
            <Text style={styles.memberName}>{c.name}</Text>
            <Text style={styles.memberAmount}>{Number(c.net_contribution).toFixed(2)} €</Text>
          </View>
        ))
      )}

      {/* ── Historique des transferts ── */}
      {deposit?.transfers?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Transferts de parts</Text>
          {deposit.transfers.map((t) => (
            <View key={t.id} style={styles.transferRow}>
              <Text style={styles.transferText}>
                {t.from_name} → {t.to_name} : {Number(t.amount).toFixed(2)} €
              </Text>
              <Text style={styles.transferDate}>
                {new Date(t.transferred_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          ))}
        </>
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

      {/* ── Transférer ma part ── */}
      {currentUserNet > 0 && (
        <>
          <Text style={styles.sectionTitle}>Transférer ma part</Text>
          <Text style={styles.hint}>
            Si vous quittez la coloc et qu'un remplaçant reprend votre caution, enregistrez ici le
            transfert. Cette action est séparée et optionnelle — elle ne bloque pas le départ.
          </Text>

          {otherMembers.length === 0 ? (
            <Text style={styles.emptyText}>Aucun autre membre dans le groupe.</Text>
          ) : (
            <>
              <Text style={styles.label}>Destinataire</Text>
              {otherMembers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.recipientRow,
                    transferRecipient === m.id && styles.recipientRowActive,
                  ]}
                  onPress={() => setTransferRecipient(m.id)}
                >
                  <Text
                    style={[
                      styles.recipientName,
                      transferRecipient === m.id && styles.recipientNameActive,
                    ]}
                  >
                    {m.name}
                  </Text>
                  {transferRecipient === m.id && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              ))}

              <Input
                label="Montant à transférer (€)"
                style={styles.amountInput}
                keyboardType="decimal-pad"
                value={transferAmount}
                onChangeText={setTransferAmount}
                placeholder="0.00"
              />
              <Button onPress={handleTransfer} loading={transferSubmitting}>
                Enregistrer le transfert
              </Button>
            </>
          )}
        </>
      )}

      {/* ── Restitution finale ── */}
      <TouchableOpacity
        style={styles.settleToggle}
        onPress={() => {
          setSettleVisible((v) => !v);
          setSettleResult(null);
        }}
      >
        <Text style={styles.settleToggleText}>
          {settleVisible ? '▲ Masquer' : '▼ Calculer la restitution finale'}
        </Text>
      </TouchableOpacity>

      {settleVisible && (
        <View style={styles.settleSection}>
          <Text style={styles.hint}>
            Saisissez le montant rendu par le propriétaire. L'app calcule la part de chaque coloc au
            prorata de sa contribution nette.{'\n\n'}
            ⚠️ Ce calcul est indicatif — l'app ne transfère pas d'argent réel. C'est à vous de vous
            rembourser entre colocs selon cette répartition.
          </Text>
          <Input
            label="Montant rendu par le propriétaire (€)"
            style={styles.amountInput}
            keyboardType="decimal-pad"
            value={settleAmountReturned}
            onChangeText={setSettleAmountReturned}
            placeholder="0.00"
          />
          <Button onPress={handleSettle} loading={settleLoading}>
            Calculer la répartition
          </Button>

          {settleResult && (
            <View style={styles.settleResult}>
              <Text style={styles.settleResultTitle}>
                Répartition pour {Number(settleResult.amountReturned).toFixed(2)} € restitués
              </Text>
              {settleResult.restitution.map((r) => (
                <View key={r.userId} style={styles.settleRow}>
                  <Text style={styles.settleName}>{r.name}</Text>
                  <View style={styles.settleAmounts}>
                    <Text style={styles.settleContrib}>
                      {Number(r.netContribution).toFixed(2)} € versés
                    </Text>
                    <Text style={styles.settleShare}>
                      → {Number(r.restitutionShare).toFixed(2)} € à recevoir
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
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

  transferRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  transferText: { fontSize: 14, color: colors.ink, flex: 1 },
  transferDate: { fontSize: 12, color: colors.inkLight, marginLeft: spacing.sm },

  hint: { fontSize: 12, color: colors.inkLight, marginBottom: spacing.md, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: spacing.xs },
  amountInput: { marginBottom: spacing.base },

  recipientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    backgroundColor: colors.paper,
  },
  recipientRowActive: {
    borderColor: colors.terracotta,
    backgroundColor: colors.terracottaLight,
  },
  recipientName: { fontSize: 14, color: colors.ink },
  recipientNameActive: { color: colors.terracotta, fontWeight: '600' },
  checkMark: { color: colors.terracotta, fontWeight: '700', fontSize: 16 },

  settleToggle: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  settleToggleText: { fontSize: 14, color: colors.terracotta, fontWeight: '600' },
  settleSection: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  settleResult: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  settleResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  settleRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settleName: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  settleAmounts: { flexDirection: 'row', justifyContent: 'space-between' },
  settleContrib: { fontSize: 12, color: colors.inkLight },
  settleShare: { fontSize: 13, fontWeight: '600', color: colors.avocado },
});
