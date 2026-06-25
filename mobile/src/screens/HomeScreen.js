import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, SectionList, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, AppState,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { getBalances, getDeposit, getExpenses, savePushToken } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Card from '../components/Card';
import ScreenContainer from '../components/ScreenContainer';
import { theme } from '../theme/theme';

const { colors, spacing, radius, shadows } = theme;

const CATEGORY_ICONS = {
  loyer: '🏠', rent: '🏠',
  courses: '🛒', alimentation: '🛒', nourriture: '🛒', epicerie: '🛒',
  restaurant: '🍽️', restauration: '🍽️', repas: '🍽️',
  transport: '🚌', trajet: '🚌', voiture: '🚗',
  electricite: '⚡', energie: '⚡',
  eau: '💧',
  internet: '📶', telephone: '📱',
  loisirs: '🎮', divertissement: '🎮', cinema: '🎬',
  sante: '💊', medecin: '🏥', pharmacie: '💊',
  menage: '🧹', entretien: '🔧', reparation: '🔧',
  abonnement: '📋', assurance: '📋',
};

function getCategoryIcon(category) {
  if (!category) return '💳';
  const key = category
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return CATEGORY_ICONS[key] ?? '💳';
}

const SORT_MODES = [
  { key: 'name', label: 'Nom (A–Z)' },
  { key: 'highToLow', label: '↓ Solde' },
  { key: 'lowToHigh', label: '↑ Solde' },
];

const AVATAR_BG_COLORS = ['#C8A97A', '#7A9BC8', '#9BC87A', '#C87A9B', '#7AC8B9', '#B97AC8', '#C8C07A'];

function Avatar({ name, size = 36 }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const bg = AVATAR_BG_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_BG_COLORS.length];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
    </View>
  );
}

function formatNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
}

async function registerForPushNotificationsAsync() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
}

export default function HomeScreen({ navigation }) {
  const { signOut } = useAuth();
  const { currentGroup, dbUser } = useApp();
  const [balances, setBalances] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState('expenses');
  const [sortMode, setSortMode] = useState('name');

  const pushRegistered = useRef(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: colors.cream },
      headerShadowVisible: false,
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('GroupSelector')}
          style={styles.headerTitleBtn}
        >
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {currentGroup?.name ?? 'Ma coloc'}
          </Text>
          <Text style={styles.headerTitleChevron}>▾</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={styles.headerBtns}>
          <TouchableOpacity onPress={() => navigation.navigate('GroupSettings')}>
            <Text style={styles.headerBtnText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Invite')}>
            <Text style={styles.headerBtnText}>Inviter</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, currentGroup]);

  useEffect(() => {
    if (!dbUser || pushRegistered.current) return;
    pushRegistered.current = true;
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        savePushToken(token).catch((err) =>
          console.error('Erreur enregistrement push token:', err?.response?.data || err.message)
        );
      }
    });
  }, [dbUser]);

  const loadData = useCallback(async () => {
    if (!currentGroup) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const [balancesRes, expensesRes, depositRes] = await Promise.all([
        getBalances(currentGroup.id),
        getExpenses(currentGroup.id),
        getDeposit(currentGroup.id).catch(() => ({ data: null })),
      ]);
      setBalances(balancesRes.data);
      setExpenses(expensesRes.data);
      setDeposit(depositRes.data);
    } catch (err) {
      console.error('Erreur chargement tableau de bord', err?.response?.data || err.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!currentGroup) return;
    const interval = setInterval(loadData, 30_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        loadData();
      }
      appState.current = nextState;
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [currentGroup, loadData]);

  const myTotal = useMemo(() => {
    const now = new Date();
    const memberCount = balances.length || 1;
    return expenses.reduce((sum, exp) => {
      const d = new Date(exp.expense_date);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return sum;
      const amount = Number(exp.amount);
      const splits = Array.isArray(exp.splits) ? exp.splits : [];
      if (splits.length > 0) {
        const mine = splits.find((sp) => (sp.user_id ?? sp.userId) === dbUser?.id);
        if (!mine) return sum;
        const share = mine.amount != null
          ? Number(mine.amount)
          : mine.ratio != null
            ? amount * Number(mine.ratio)
            : amount / splits.length;
        return sum + share;
      }
      // Pas de splits dans la réponse API → répartition égale entre tous les membres
      return sum + amount / memberCount;
    }, 0);
  }, [expenses, dbUser, balances]);

  const totalAll = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses],
  );

  const expenseSections = useMemo(() => {
    const groups = {};
    for (const exp of expenses) {
      const key = exp.expense_date?.split('T')[0] ?? '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(exp);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({
        title: date
          ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : 'Date inconnue',
        data,
      }));
  }, [expenses]);

  const myBalance = useMemo(
    () => balances.find((b) => b.userId === dbUser?.id),
    [balances, dbUser],
  );

  const creditors = useMemo(
    () =>
      balances
        .filter((b) => b.userId !== dbUser?.id && Number(b.netBalance) > 0)
        .map((b) => b.name),
    [balances, dbUser],
  );

  const debtors = useMemo(
    () =>
      balances
        .filter((b) => b.userId !== dbUser?.id && Number(b.netBalance) < 0)
        .map((b) => b.name),
    [balances, dbUser],
  );

  const sortedBalances = useMemo(() => {
    return [...balances].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'fr');
      if (sortMode === 'highToLow') return Number(b.netBalance) - Number(a.netBalance);
      return Number(a.netBalance) - Number(b.netBalance);
    });
  }, [balances, sortMode]);

  const cycleSortMode = () => {
    const idx = SORT_MODES.findIndex((m) => m.key === sortMode);
    setSortMode(SORT_MODES[(idx + 1) % SORT_MODES.length].key);
  };

  if (loading) {
    return (
      <ScreenContainer centered>
        <ActivityIndicator color={colors.terracotta} />
      </ScreenContainer>
    );
  }

  if (!currentGroup) {
    return (
      <ScreenContainer>
        <Text style={styles.sectionTitle}>Bienvenue, {dbUser?.name} !</Text>
        <Text style={styles.emptyText}>
          Vous n'êtes encore membre d'aucune coloc. Créez ou rejoignez-en une.
        </Text>
      </ScreenContainer>
    );
  }

  const myNetBalance = Number(myBalance?.netBalance ?? 0);
  const sortModeLabel = SORT_MODES.find((m) => m.key === sortMode)?.label;

  return (
    <ScreenContainer style={styles.screenContainer}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            Impossible de charger les données, vérifie ta connexion.
          </Text>
          <TouchableOpacity onPress={loadData} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Segmented control */}
      <View style={styles.tabBar}>
        {['expenses', 'balances'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === 'expenses' ? 'Dépenses' : 'Soldes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Onglet Dépenses ── */}
      {activeTab === 'expenses' && (
        <SectionList
          style={styles.fill}
          sections={expenseSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statLabel}>Mes dépenses</Text>
                <Text style={styles.statAmount}>{myTotal.toFixed(2)} €</Text>
                <Text style={styles.statCaption}>ce mois-ci</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statLabel}>Total groupe</Text>
                <Text style={styles.statAmount}>{totalAll.toFixed(2)} €</Text>
                <Text style={styles.statCaption}>toutes dépenses</Text>
              </Card>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.dateHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Card style={styles.expenseCard}>
              <Text style={styles.expenseIcon}>{getCategoryIcon(item.category)}</Text>
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseName} numberOfLines={1}>
                  {item.description ?? item.category}
                </Text>
                <Text style={styles.expensePaidBy}>Payé par {item.paid_by_name}</Text>
              </View>
              <Text style={styles.expenseAmount}>{Number(item.amount).toFixed(2)} €</Text>
            </Card>
          )}
          ListEmptyComponent={
            !loadError ? <Text style={styles.emptyText}>Aucune dépense enregistrée.</Text> : null
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* ── Onglet Soldes ── */}
      {activeTab === 'balances' && (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {!loadError && (
            <>
              <TouchableOpacity
                onPress={() => console.log('balance card tapped')}
                activeOpacity={0.8}
              >
                <Card style={styles.myBalanceCard}>
                  {myNetBalance < 0 ? (
                    <>
                      <Text style={[styles.myBalanceAmount, styles.myBalanceNegative]}>
                        Tu dois {Math.abs(myNetBalance).toFixed(2)} €
                      </Text>
                      {creditors.length > 0 && (
                        <Text style={styles.myBalanceSubtext}>
                          Vois comment tu dois rembourser {formatNames(creditors)}
                        </Text>
                      )}
                    </>
                  ) : myNetBalance > 0 ? (
                    <>
                      <Text style={[styles.myBalanceAmount, styles.myBalancePositive]}>
                        On te doit {myNetBalance.toFixed(2)} €
                      </Text>
                      {debtors.length > 0 && (
                        <Text style={styles.myBalanceSubtext}>
                          {formatNames(debtors)} te doit{debtors.length > 1 ? 'vent' : ''} de l'argent
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.myBalanceAmount, styles.myBalanceNeutral]}>
                      Tous les comptes sont équilibrés ✓
                    </Text>
                  )}
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('Deposit')}
                activeOpacity={0.8}
                style={styles.depositCard}
              >
                <View style={styles.depositInfo}>
                  <Text style={styles.depositTitle}>🔑 Dépôt de garantie</Text>
                  <Text style={styles.depositAmount}>
                    {Number(deposit?.total ?? 0).toFixed(2)} €
                  </Text>
                  <Text style={styles.depositCaption}>versés au total</Text>
                </View>
                <Text style={styles.depositArrow}>›</Text>
              </TouchableOpacity>

              <View style={styles.equilBlock}>
                <View style={styles.equilHeader}>
                  <Text style={styles.sectionTitle}>Équilibres</Text>
                  <TouchableOpacity onPress={cycleSortMode} style={styles.sortBtn}>
                    <Text style={styles.sortBtnText}>{sortModeLabel} ⇅</Text>
                  </TouchableOpacity>
                </View>
                {sortedBalances.map((item) => {
                  const net = Number(item.netBalance);
                  const isMe = item.userId === dbUser?.id;
                  return (
                    <View key={item.userId} style={styles.balanceRow}>
                      <Avatar name={item.name} />
                      <View style={styles.balanceMember}>
                        <Text style={styles.memberName}>{item.name}</Text>
                        {isMe && <Text style={styles.memberMeTag}>Moi</Text>}
                      </View>
                      <Badge
                        type={net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral'}
                        value={`${net >= 0 ? '+' : ''}${net.toFixed(2)} €`}
                      />
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Actions fixes en bas */}
      <View style={styles.bottomActions}>
        <Button onPress={() => navigation.navigate('AddExpense')}>
          + Ajouter une dépense
        </Button>
        <TouchableOpacity onPress={() => signOut()} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContainer: { paddingBottom: 0 },
  fill: { flex: 1 },
  listContent: { paddingBottom: spacing.md },

  // Segmented control
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.terracottaLight,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.base,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill - 1,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.paper,
    ...shadows.card,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  tabLabelActive: {
    color: colors.terracotta,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  statCard: { flex: 1 },
  statLabel: {
    fontSize: 12,
    color: colors.inkLight,
    marginBottom: spacing.xs,
  },
  statAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  statCaption: {
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 2,
  },

  // Expense rows
  dateHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'capitalize',
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  expenseIcon: {
    fontSize: 22,
    marginRight: spacing.md,
  },
  expenseInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  expenseName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  expensePaidBy: {
    fontSize: 12,
    color: colors.inkLight,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },

  // My balance card
  myBalanceCard: { marginBottom: spacing.base },
  myBalanceAmount: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  myBalanceNegative: { color: colors.danger },
  myBalancePositive: { color: colors.avocado },
  myBalanceNeutral: { color: colors.inkMuted },
  myBalanceSubtext: {
    fontSize: 13,
    color: colors.inkMuted,
    lineHeight: 18,
  },

  // Deposit card
  depositCard: {
    backgroundColor: colors.slate,
    borderRadius: radius.lg,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.base,
    ...shadows.card,
  },
  depositInfo: { flex: 1 },
  depositTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: spacing.xs,
  },
  depositAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  depositCaption: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  depositArrow: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: spacing.sm,
  },

  // Équilibres block
  equilBlock: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...shadows.card,
  },
  equilHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  sortBtn: {
    backgroundColor: colors.terracottaLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.terracotta,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  balanceMember: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  memberMeTag: {
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 1,
  },

  // Avatar
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontWeight: '700',
  },

  // Bottom actions
  bottomActions: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  signOutText: {
    fontSize: 13,
    color: colors.inkLight,
  },

  // Header
  headerTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitleText: { fontSize: 16, fontWeight: '700', color: colors.ink, maxWidth: 180 },
  headerTitleChevron: { fontSize: 12, color: colors.terracotta, marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 14, marginRight: 8 },
  headerBtnText: { color: colors.terracotta, fontSize: 15, fontWeight: '600' },

  // Error
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorBannerText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  retryBtnText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  emptyText: {
    color: colors.inkLight,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
});
