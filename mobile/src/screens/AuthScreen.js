import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import Button from '../components/Button';
import Input from '../components/Input';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function AuthScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState('signin');
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Text style={styles.title}>Vérifiez votre email</Text>
        <Text style={styles.subtitle}>Un code à 6 chiffres a été envoyé à {email}</Text>

        <Input
          style={styles.field}
          placeholder="Code de vérification"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoFocus
        />

        <Button onPress={handleVerifyEmail} loading={loading}>
          Valider
        </Button>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
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
        <Input
          style={styles.field}
          placeholder="Prénom"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <Input
        style={styles.field}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Input
        style={styles.field}
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Button
        onPress={mode === 'signin' ? handleSignIn : handleSignUp}
        loading={loading}
        style={styles.submitBtn}
      >
        {mode === 'signin' ? 'Se connecter' : "S'inscrire"}
      </Button>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.cream,
  },
  title: {
    fontSize: 32,
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
  submitBtn: { marginTop: spacing.xs },
});
