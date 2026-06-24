import { createContext, useContext, useState } from 'react';

const AppContext = createContext({
  dbUser: null,
  setDbUser: () => {},
  myGroups: [],
  setMyGroups: () => {},
  currentGroup: null,
  setCurrentGroup: () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [dbUser, setDbUser] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);

  return (
    <AppContext.Provider value={{ dbUser, setDbUser, myGroups, setMyGroups, currentGroup, setCurrentGroup }}>
      {children}
    </AppContext.Provider>
  );
}
