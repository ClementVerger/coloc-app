import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

// Affiche les notifications quand l'app est au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Canal Android requis pour les notifications (ignoré sur iOS)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Coloc\'',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

import { AppProvider, useApp } from './src/context/AppContext';
import { configureTokenFetcher, syncUser, getMyGroups } from './src/services/api';

import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import GroupSelectorScreen from './src/screens/GroupSelectorScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import InviteScreen from './src/screens/InviteScreen';
import DepositScreen from './src/screens/DepositScreen';
import GroupSettingsScreen from './src/screens/GroupSettingsScreen';

const Stack = createNativeStackNavigator();

const tokenCache = {
  async getToken(key) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key, value) {
    return SecureStore.setItemAsync(key, value);
  },
  async clearToken(key) {
    return SecureStore.deleteItemAsync(key);
  },
};

function RootNavigation() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { setDbUser, myGroups, setMyGroups, currentGroup, setCurrentGroup } = useApp();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setAppReady(true);
      return;
    }

    configureTokenFetcher(getToken);

    const initApp = async () => {
      try {
        const email = user.primaryEmailAddress?.emailAddress;
        const name = user.fullName || user.firstName || email;

        const syncRes = await syncUser({ email, name });
        setDbUser(syncRes.data);

        const groupsRes = await getMyGroups();
        const groups = groupsRes.data;
        setMyGroups(groups);

        // Auto-sélection uniquement si une seule coloc
        if (groups.length === 1) {
          setCurrentGroup(groups[0]);
        }
      } catch (err) {
        console.error("Erreur d'initialisation de l'app :", err?.response?.data || err.message);
      } finally {
        setAppReady(true);
      }
    };

    initApp();
  }, [isSignedIn, isLoaded]);

  if (!isLoaded || !appReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!isSignedIn ? (
          // Non connecté → authentification
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        ) : currentGroup ? (
          // Connecté + coloc sélectionnée → app principale
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Ma coloc' }} />
            <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Nouvelle dépense' }} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Historique' }} />
            <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Inviter' }} />
            <Stack.Screen name="Deposit" component={DepositScreen} options={{ title: 'Dépôt de garantie' }} />
            <Stack.Screen name="GroupSettings" component={GroupSettingsScreen} options={{ title: 'Paramètres' }} />
          </>
        ) : myGroups.length > 1 ? (
          // Connecté + plusieurs colocs → sélecteur
          <Stack.Screen name="GroupSelector" component={GroupSelectorScreen} options={{ title: 'Mes colocs', headerBackVisible: false }} />
        ) : (
          // Connecté + aucune coloc → onboarding
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <AppProvider>
        <RootNavigation />
      </AppProvider>
    </ClerkProvider>
  );
}
