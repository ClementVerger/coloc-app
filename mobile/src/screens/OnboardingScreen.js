import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { createGroup, joinGroupByCode, getMyGroups } from '../services/api';
import { useApp } from '../context/AppContext';

export default function OnboardingScreen() {
  const { signOut } = useAuth();
  const { setMyGroups, setCurrentGroup } = useApp();
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [loading, setLoading] = useState(false);

  // Formulaire création
  const [groupName, setGroupName] = useState('');
  const [address, setAddress] = useState('');
  const [leaseStart, setLeaseStart] = useState('');

  // Formulaire rejoindre
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
      setMyGroups([newGroup]);
      setCurrentGroup(newGroup);
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible de créer la coloc.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Code invalide', 'Le code d\'invitation fait 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      await joinGroupByCode(code);
      // Recharge la liste complète pour être synchronisé
      const groupsRes = await getMyGroups();
      const groups = groupsRes.data;
      setMyGroups(groups);
      if (groups.length === 1) setCurrentGroup(groups[0]);
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
        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>

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
            <Text style={styles.label}>Nom de la coloc *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : Appart Belleville"
              value={groupName}
              onChangeText={setGroupName}
            />

            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : 12 rue des Lilas, Paris"
              value={address}
              onChangeText={setAddress}
            />

            <Text style={styles.label}>Date de début de bail</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-JJ"
              value={leaseStart}
              onChangeText={setLeaseStart}
              keyboardType="numbers-and-punctuation"
            />

            <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Créer la coloc</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Code d'invitation (6 caractères)</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="AB12CD"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />
            <Text style={styles.hint}>Demandez le code à un colocataire depuis son écran d'invitation.</Text>

            <TouchableOpacity style={styles.button} onPress={handleJoin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Rejoindre</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#FBF4E6', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 28 },
  tabs: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  activeTab: { backgroundColor: '#2D6A4F' },
  tabText: { fontSize: 14, color: '#333' },
  activeTabText: { color: '#fff', fontWeight: '600' },
  label: { fontSize: 13, marginTop: 12, marginBottom: 4, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
  },
  hint: { fontSize: 12, color: '#888', marginTop: 6, marginBottom: 4 },
  button: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signOutBtn: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8, marginBottom: 8 },
  signOutText: { color: '#999', fontSize: 13 },
});
