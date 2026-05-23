import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sessionIsCashierOnly, normalizeMemberships } from '../lib/auth-session';

interface AuthState {
  token: string | null;
  cashierOnly: boolean;
  setToken: (token: string | null) => void;
  setSessionFromMemberships: (memberships: unknown[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      cashierOnly: false,
      setToken: (token) =>
        set({
          token,
          ...(token ? {} : { cashierOnly: false }),
        }),
      setSessionFromMemberships: (memberships) =>
        set({ cashierOnly: sessionIsCashierOnly(normalizeMemberships(memberships)) }),
      logout: () => set({ token: null, cashierOnly: false }),
    }),
    {
      name: 'lz3c-auth',
      partialize: (s) => ({ token: s.token, cashierOnly: s.cashierOnly }),
    },
  ),
);
