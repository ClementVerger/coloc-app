import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, Alert, AppState,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getExpenses, exportExpenses } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import ScreenContainer from '../components/ScreenContainer';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function HistoryScreen({ navigation }) {
  const { currentGroup } = useApp();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const appState = useRef(AppState.currentState);

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
          "Le partage de fichiers n'est pas disponible sur cet appareil."
        );
      }
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || "Impossible d'exporter les dépenses.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer centered>
        <ActivityIndicator color={colors.terracotta} />
      </ScreenContainer>
    );
  }

  if (!currentGroup) {
    return <ScreenContainer><Text style={styles.emptyText}>Aucune coloc sélectionnée.</Text></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      {/* Lien vers la gestion de la caution */}
      <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('Deposit')}>
        <Text style={styles.linkCardText}>Dépôt de garantie  →</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Historique des dépenses</Text>

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
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune dépense enregistrée.</Text>}
          ListFooterComponent={
            expenses.length > 0 ? (
              <Button
                variant="secondary"
                onPress={handleExport}
                loading={exporting}
                style={styles.exportBtn}
              >
                Exporter en CSV
              </Button>
            ) : null
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  linkCard: {
    backgroundColor: colors.slateLight,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.xs,
  },
  linkCardText: { color: colors.slate, fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLeft: { flex: 1, fontSize: 13, color: colors.inkMuted, marginRight: spacing.sm },
  rowAmount: { fontSize: 14, fontWeight: '600', color: colors.ink },
  emptyText: { color: colors.inkLight, fontSize: 14, fontStyle: 'italic', marginTop: spacing.md },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: 14,
    marginTop: spacing.sm,
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
  exportBtn: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
