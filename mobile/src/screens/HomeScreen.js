import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Button, FlatList,
  ActivityIndicator, TouchableOpacity, Platform, AppState,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { getBalances, getExpenses, savePushToken } from '../services/api';
import { useApp } from '../context/AppContext';

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

  // Boutons "Paramètres" et "Inviter" dans le header
  useEffect(() => {
    navigation.setOptions({
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
  }, [navigation]);

  // Enregistrement du push token après chargement du profil utilisateur
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

  // I6 — Chargement avec état d'erreur visible et bouton "Réessayer"
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

  // Polling toutes les 30s + refresh immédiat quand l'app revient au premier plan
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

  if (loading) return <ActivityIndicator style={styles.center} />;

  if (!currentGroup) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Bienvenue, {dbUser?.name} !</Text>
        <Text style={{ color: '#666', marginTop: 8 }}>
          Vous n'êtes encore membre d'aucune coloc. Créez ou rejoignez-en une.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.groupName}>{currentGroup.name}</Text>

      {/* I6 — Bandeau d'erreur avec bouton Réessayer */}
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
                <Text>{item.name}</Text>
                <Text style={item.netBalance >= 0 ? styles.positive : styles.negative}>
                  {Number(item.netBalance).toFixed(2)} €
                </Text>
              </View>
            )}
          />

          <Text style={styles.sectionTitle}>Dernières dépenses</Text>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text>{item.category}</Text>
                <Text>{Number(item.amount).toFixed(2)} €</Text>
              </View>
            )}
          />
        </>
      )}

      <Button title="+ Ajouter une dépense" onPress={() => navigation.navigate('AddExpense')} />
      <Button title="Voir l'historique" onPress={() => navigation.navigate('History')} />
      <Button title="Se déconnecter" color="#999" onPress={() => signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center' },
  groupName: { fontSize: 13, color: '#888', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  positive: { color: 'green' },
  negative: { color: 'red' },
  headerBtns: { flexDirection: 'row', gap: 14, marginRight: 8 },
  headerBtnText: { color: '#2D6A4F', fontSize: 15, fontWeight: '600' },
  errorBanner: {
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
    gap: 10,
  },
  errorBannerText: { color: '#c62828', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1,
    borderColor: '#c62828',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  retryBtnText: { color: '#c62828', fontSize: 13, fontWeight: '600' },
});
