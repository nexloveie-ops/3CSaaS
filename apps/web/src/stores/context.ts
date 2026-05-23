import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModuleId } from '@lz3c/shared';

interface ContextState {
  companyId: string | null;
  storeId: string | null;
  enabledModules: ModuleId[] | null;
  subscriptionStatus: string | null;
  setCompanyId: (id: string | null) => void;
  setStoreId: (id: string | null) => void;
  setCompanyMeta: (meta: {
    enabledModules?: ModuleId[] | null;
    subscriptionStatus?: string | null;
  }) => void;
  clearCompanyMeta: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set) => ({
      companyId: null,
      storeId: null,
      enabledModules: null,
      subscriptionStatus: null,
      setCompanyId: (companyId) =>
        set({ companyId, storeId: null, enabledModules: null, subscriptionStatus: null }),
      setStoreId: (storeId) => set({ storeId }),
      setCompanyMeta: (meta) =>
        set({
          enabledModules: meta.enabledModules ?? null,
          subscriptionStatus: meta.subscriptionStatus ?? null,
        }),
      clearCompanyMeta: () => set({ enabledModules: null, subscriptionStatus: null }),
    }),
    { name: 'lz3c-context' },
  ),
);
