import { View, Text, StyleSheet, Share, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import { theme } from '../theme/theme';

const { colors, spacing, radius } = theme;

export default function InviteScreen() {
  const { currentGroup } = useApp();
  const code = currentGroup?.invite_code;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Rejoins ma coloc "${currentGroup.name}" sur l'app Coloc' !\nCode d'invitation : ${code}`,
      });
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'ouvrir le partage.");
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

      <Button onPress={handleShare} style={styles.shareBtn}>
        Partager l'invitation
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    paddingVertical: 28,
    paddingHorizontal: 40,
    borderWidth: 2,
    borderColor: colors.terracotta,
    marginBottom: spacing.sm,
  },
  code: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 10,
    color: colors.terracotta,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: colors.inkLight,
    marginBottom: spacing.xl,
  },
  shareBtn: { width: '100%' },
});
