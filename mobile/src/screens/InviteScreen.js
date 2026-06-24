import { View, Text, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { useApp } from '../context/AppContext';

export default function InviteScreen() {
  const { currentGroup } = useApp();
  const code = currentGroup?.invite_code;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Rejoins ma coloc "${currentGroup.name}" sur l'app Coloc' !\nCode d'invitation : ${code}`,
      });
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le partage.');
    }
  };

  if (!code) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>
          Aucun code d'invitation disponible pour cette coloc.{'\n'}
          Elle a été créée avant la mise à jour — recréez-la ou contactez le support.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inviter un colocataire</Text>
      <Text style={styles.subtitle}>
        Partagez ce code à vos colocataires. Ils pourront l'entrer dans l'écran "Rejoindre".
      </Text>

      <View style={styles.codeBox}>
        <Text selectable style={styles.code}>{code}</Text>
      </View>

      <Text style={styles.hint}>Appui long sur le code pour le copier</Text>

      <TouchableOpacity style={styles.button} onPress={handleShare}>
        <Text style={styles.buttonText}>Partager l'invitation</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FBF4E6', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  codeBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 40,
    borderWidth: 2,
    borderColor: '#2D6A4F',
    marginBottom: 10,
  },
  code: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 10,
    color: '#2D6A4F',
    textAlign: 'center',
  },
  hint: { fontSize: 12, color: '#aaa', marginBottom: 32 },
  button: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
