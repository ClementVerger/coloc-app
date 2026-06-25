import { createContext, useCallback, useContext, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const SELECTED_GROUP_KEY = 'selectedGroupId';

const AppContext = createContext({
  dbUser: null,
  setDbUser: () => {},
  myGroups: [],
  setMyGroups: () => {},
  currentGroup: null,
  setCurrentGroup: () => {},
  selectGroup: async () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [dbUser, setDbUser] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);

  // Sélectionne une coloc et persiste son ID pour le prochain lancement
  const selectGroup = useCallback(async (group) => {
    setCurrentGroup(group);
    if (group?.id) {
      await SecureStore.setItemAsync(SELECTED_GROUP_KEY, group.id);
    } else {
      await SecureStore.deleteItemAsync(SELECTED_GROUP_KEY);
    }
  }, []);

  return (
    <AppContext.Provider value={{ dbUser, setDbUser, myGroups, setMyGroups, currentGroup, setCurrentGroup, selectGroup }}>
      {children}
    </AppContext.Provider>
  );
}

export { SELECTED_GROUP_KEY };
