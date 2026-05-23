import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isValidLocale, type AppLocale } from '@lz3c/shared';
import i18n from '../i18n';
import { api } from '../lib/api';
import { useAuthStore } from './auth';

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale, persistToServer?: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale, persistToServer = true) => {
        if (!isValidLocale(locale)) return;
        void i18n.changeLanguage(locale);
        set({ locale });
        if (persistToServer && useAuthStore.getState().token) {
          void api.updateUserLocale(locale).catch(() => undefined);
        }
      },
    }),
    { name: 'lz3c-locale' },
  ),
);
