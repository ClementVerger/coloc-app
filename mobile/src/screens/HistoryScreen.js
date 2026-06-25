import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, Alert, AppState,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getExpenses, exportExpenses } from '../services/api';
import { useApp } from '../context/AppContext';

export default function HistoryScreen({ navigation }) {
  const { currentGroup } = useApp();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const appState = useRef(AppState.currentState);

  // I6 — Chargement avec état d'erreur visible et bouton "Réessayer"
  const loadExpenses = useCallback(async () => {
    if (!currentGroup) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await getExpenses(currentGroup.id);
      setExpenses(res.data);
    } catch (err) {
      console.error('Erreur chargement historique', err?.response?.data || err.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentGroup]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Polling toutes les 30s + refresh immédiat quand l'app revient au premier plan
  useEffect(() => {
    if (!currentGroup) return;

    const interval = setInterval(loadExpenses, 30_000);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        loadExpenses();
      }
      appState.current = nextState;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [currentGroup, loadExpenses]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportExpenses(currentGroup.id);
      const csvData = res.data;

      const fileUri = FileSystem.cacheDirectory + 'depenses.csv';
      await FileSystem.writeAsStringAsync(fileUri, csvData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exporter les dépenses',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(
          'Partage indisponible',
          'Le partage de fichiers n\'est pas disponible sur cet appareil.'
        );
      }
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible d\'exporter les dépenses.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  if (!currentGroup) {
    return <View style={styles.container}><Text>Aucune coloc sélectionnée.</Text></View>;
  }

  return (
    <View style={styles.container}>
      {/* Lien vers la gestion de la caution */}
      <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('Deposit')}>
        <Text style={styles.linkCardText}>Dépôt de garantie →</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Historique des dépenses</Text>

      {/* I6 — Bandeau d'erreur avec bouton Réessayer */}
      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            Impossible de charger les données, vérifie ta connexion.
          </Text>
          <TouchableOpacity onPress={loadExpenses} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowLeft}>
                {item.expense_date
                  ? new Date(item.expense_date).toLocaleDateString('fr-FR')
                  : ''}
                {'  ·  '}
                {item.paid_by_name ?? ''}
                {'  ·  '}
                {item.category}
              </Text>
              <Text style={styles.rowAmount}>{Number(item.amount).toFixed(2)} €</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune dépense enregistrée.</Text>}
          ListFooterComponent={
            expenses.length > 0 ? (
              <TouchableOpacity
                style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
                onPress={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <ActivityIndicator color="#2D6A4F" />
                ) : (
                  <Text style={styles.exportBtnText}>Exporter en CSV</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center' },
  linkCard: {
    backgroundColor: '#EDF7F2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  linkCardText: { color: '#2D6A4F', fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLeft: { flex: 1, fontSize: 13, color: '#444', marginRight: 8 },
  rowAmount: { fontSize: 14, fontWeight: '600' },
  empty: { color: '#aaa', fontSize: 14, fontStyle: 'italic', marginTop: 12 },
  errorBanner: {
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
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
  exportBtn: {
    marginTop: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#2D6A4F',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { color: '#2D6A4F', fontWeight: '600', fontSize: 14 },
});
