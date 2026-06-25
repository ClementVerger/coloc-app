import axios from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Stocke la fonction getToken fournie par le hook Clerk useAuth()
let getTokenFn = null;

export const configureTokenFetcher = (fn) => {
  getTokenFn = fn;
};

// Injecte automatiquement le token Clerk dans chaque requête
api.interceptors.request.use(async (config) => {
  if (getTokenFn) {
    const token = await getTokenFn();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Utilisateurs ---
export const syncUser = (payload) => api.post('/users/sync', payload);
export const savePushToken = (token) => api.post('/users/push-token', { token });

// --- Groupes ---
export const getMyGroups = () => api.get('/groups/my');
export const getGroupMembers = (groupId) => api.get(`/groups/${groupId}/members`);
export const createGroup = (payload) => api.post('/groups', payload);
export const joinGroup = (groupId) => api.post(`/groups/${groupId}/join`);
export const joinGroupByCode = (code) => api.post('/groups/join-by-code', { code });
export const leaveGroup = (groupId) => api.post(`/groups/${groupId}/leave`);

// --- Dépenses ---
export const getExpenses = (groupId) => api.get(`/expenses/group/${groupId}`);
export const addExpense = (payload) => api.post('/expenses', payload);
export const scanReceipt = (formData) =>
  api.post('/expenses/scan-receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
// responseType 'text' pour recevoir le CSV brut sans tentative de parsing JSON
export const exportExpenses = (groupId) =>
  api.get(`/expenses/group/${groupId}/export`, { responseType: 'text' });

// --- Soldes ---
export const getBalances = (groupId) => api.get(`/balances/group/${groupId}`);

// --- Dépôt de garantie ---
export const getDeposit = (groupId) => api.get(`/deposit/group/${groupId}`);
export const addDeposit = (payload) => api.post('/deposit', payload);

export default api;
