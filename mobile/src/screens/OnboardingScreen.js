import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { createGroup, joinGroupByCode, getMyGroups } from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Input from '../components/Input';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function OnboardingScreen({ navigation }) {
  const { setMyGroups, selectGroup } = useApp();
  const [mode, setMode] = useState('create');

  const [loading, setLoading] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [address, setAddress] = useState('');
  const [leaseStart, setLeaseStart] = useState('');

  const [inviteCode, setInviteCode] = useState('');

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Champ requis', 'Donnez un nom à votre coloc.');
      return;
    }
    setLoading(true);
    try {
      const res = await createGroup({
        name: groupName.trim(),
        address: address.trim() || null,
        leaseStartDate: leaseStart.trim() || null,
      });
      const newGroup = res.data;
      const groupsRes = await getMyGroups();
      setMyGroups(groupsRes.data);
      await selectGroup(newGroup);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible de créer la coloc.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Code invalide', "Le code d'invitation fait 6 caractères.");
      return;
    }
    setLoading(true);
    try {
      const joinRes = await joinGroupByCode(code);
      const joinedGroup = joinRes.data;
      const groupsRes = await getMyGroups();
      setMyGroups(groupsRes.data);
      await selectGroup(joinedGroup);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Code invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Bienvenue !</Text>
        <Text style={styles.subtitle}>Commencez par créer votre coloc ou rejoignez-en une.</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'create' && styles.activeTab]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.tabText, mode === 'create' && styles.activeTabText]}>Créer ma coloc</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'join' && styles.activeTab]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.tabText, mode === 'join' && styles.activeTabText]}>Rejoindre</Text>
          </TouchableOpacity>
        </View>

        {mode === 'create' ? (
          <>
            <Input
              label="Nom de la coloc *"
              style={styles.field}
              placeholder="Ex : Appart Belleville"
              value={groupName}
              onChangeText={setGroupName}
            />

            <Input
              label="Adresse"
              style={styles.field}
              placeholder="Ex : 12 rue des Lilas, Paris"
              value={address}
              onChangeText={setAddress}
            />

            <Input
              label="Date de début de bail"
              style={styles.field}
              placeholder="AAAA-MM-JJ"
              value={leaseStart}
              onChangeText={setLeaseStart}
              keyboardType="numbers-and-punctuation"
            />

            <Button onPress={handleCreate} loading={loading} style={styles.submitBtn}>
              Créer la coloc
            </Button>
          </>
        ) : (
          <>
            <Input
              label="Code d'invitation (6 caractères)"
              style={styles.field}
              placeholder="AB12CD"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              inputStyle={styles.codeInputStyle}
            />
            <Text style={styles.hint}>Demandez le code à un colocataire depuis son écran d'invitation.</Text>

            <Button onPress={handleJoin} loading={loading} style={styles.submitBtn}>
              Rejoindre
            </Button>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    backgroundColor: colors.cream,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  activeTab: { backgroundColor: colors.terracotta },
  tabText: { fontSize: 14, color: colors.inkMuted },
  activeTabText: { color: colors.white, fontWeight: '600' },
  field: { marginBottom: spacing.md },
  codeInputStyle: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
  },
  hint: { fontSize: 12, color: colors.inkLight, marginTop: spacing.xs, marginBottom: spacing.sm },
  submitBtn: { marginTop: spacing.sm },
});
