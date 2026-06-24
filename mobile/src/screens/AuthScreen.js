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
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';

export default function AuthScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const handleSignIn = async () => {
    if (!signInLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
      } else {
        Alert.alert('Connexion impossible', 'Vérifiez vos identifiants.');
      }
    } catch (err) {
      Alert.alert('Erreur', err.errors?.[0]?.longMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUpLoaded) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password, firstName: name });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      Alert.alert('Erreur', err.errors?.[0]?.longMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!signUpLoaded) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else {
        Alert.alert('Code invalide', 'Vérifiez le code reçu par email.');
      }
    } catch (err) {
      Alert.alert('Erreur', err.errors?.[0]?.longMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <Text style={styles.title}>Vérifiez votre email</Text>
        <Text style={styles.subtitle}>Un code à 6 chiffres a été envoyé à {email}</Text>

        <TextInput
          style={styles.input}
          placeholder="Code de vérification"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoFocus
        />

        <TouchableOpacity style={styles.button} onPress={handleVerifyEmail} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Valider</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <Text style={styles.title}>Coloc'</Text>
      <Text style={styles.subtitle}>Gérez vos dépenses entre colocataires</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, mode === 'signin' && styles.activeTab]}
          onPress={() => setMode('signin')}
        >
          <Text style={[styles.tabText, mode === 'signin' && styles.activeTabText]}>Connexion</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'signup' && styles.activeTab]}
          onPress={() => setMode('signup')}
        >
          <Text style={[styles.tabText, mode === 'signup' && styles.activeTabText]}>Inscription</Text>
        </TouchableOpacity>
      </View>

      {mode === 'signup' && (
        <TextInput
          style={styles.input}
          placeholder="Prénom"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.button}
        onPress={mode === 'signin' ? handleSignIn : handleSignUp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'signin' ? 'Se connecter' : "S'inscrire"}</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FBF4E6' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 32 },
  tabs: { flexDirection: 'row', marginBottom: 20, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  activeTab: { backgroundColor: '#2D6A4F' },
  tabText: { fontSize: 14, color: '#333' },
  activeTabText: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
