import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity, AppState,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { getBalances, getExpenses, savePushToken } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Badge from '../components/Badge';
import ScreenContainer from '../components/ScreenContainer';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
      const [balancesRes, expensesRes] = await Promise.all([
        getBalances(currentGroup.id),
        getExpenses(currentGroup.id),
      ]);
      setBalances(balancesRes.data);
      setExpenses(expensesRes.data.slice(0, 5));
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

  return (
    <ScreenContainer>
      <Text style={styles.groupSubtitle}>{currentGroup.name}</Text>

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

      {!loadError && (
        <>
          <Text style={styles.sectionTitle}>Soldes</Text>
          <FlatList
            data={balances}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.memberName}>{item.name}</Text>
                <Badge
                  type={item.netBalance >= 0 ? 'positive' : 'negative'}
                  value={`${item.netBalance >= 0 ? '+' : ''}${Number(item.netBalance).toFixed(2)} €`}
                />
              </View>
            )}
          />

          <Text style={styles.sectionTitle}>Dernières dépenses</Text>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.expenseCategory}>{item.category}</Text>
                <Text style={styles.expenseAmount}>{Number(item.amount).toFixed(2)} €</Text>
              </View>
            )}
          />
        </>
      )}

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('AddExpense')}>
          + Ajouter une dépense
        </Button>
        <Button
          variant="secondary"
          onPress={() => navigation.navigate('History')}
          style={styles.historyBtn}
        >
          Voir l'historique
        </Button>
        <TouchableOpacity onPress={() => signOut()} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  groupSubtitle: {
    fontSize: 13,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberName: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  expenseCategory: { fontSize: 13, color: colors.inkMuted, textTransform: 'capitalize' },
  expenseAmount: { fontSize: 14, fontWeight: '600', color: colors.ink },
  emptyText: { color: colors.inkMuted, marginTop: spacing.sm, fontSize: 14 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  historyBtn: {},
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  signOutText: { fontSize: 13, color: colors.inkLight },
  headerTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitleText: { fontSize: 16, fontWeight: '700', color: colors.ink, maxWidth: 180 },
  headerTitleChevron: { fontSize: 12, color: colors.terracotta, marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 14, marginRight: 8 },
  headerBtnText: { color: colors.terracotta, fontSize: 15, fontWeight: '600' },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: 14,
    marginTop: spacing.md,
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
});
