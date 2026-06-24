import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useApp } from '../context/AppContext';

export default function GroupSelectorScreen() {
  const { signOut } = useAuth();
  const { myGroups, setCurrentGroup } = useApp();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choisissez votre coloc</Text>
        <TouchableOpacity onPress={() => signOut()}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Vous êtes membre de plusieurs colocations.</Text>

      <FlatList
        data={myGroups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setCurrentGroup(item)}>
            <Text style={styles.groupName}>{item.name}</Text>
            {item.address ? <Text style={styles.groupAddress}>{item.address}</Text> : null}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FBF4E6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  signOutText: { fontSize: 13, color: '#999' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  groupName: { fontSize: 17, fontWeight: '600', color: '#2D6A4F' },
  groupAddress: { fontSize: 13, color: '#888', marginTop: 4 },
});
