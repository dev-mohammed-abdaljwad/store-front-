import { create } from 'zustand';

const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem('auth_user');
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const getStoredStore = () => {
  try {
    const rawStore = localStorage.getItem('auth_store');
    return rawStore ? JSON.parse(rawStore) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('auth_token'),
  user: getStoredUser(),
  store: getStoredStore(),

  login: (token, user, store = null) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_store', JSON.stringify(store));
    set({ token, user, store });
  },

  updateStore: (store) => {
    localStorage.setItem('auth_store', JSON.stringify(store));
    set({ store });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_store');
    set({ token: null, user: null, store: null });
    window.location.href = '/login';
  },
}));