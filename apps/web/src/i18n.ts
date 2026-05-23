import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enMessages, getI18nResources, zhMessages } from '@lz3c/shared';

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lz3c_locale') : null;

void i18n.use(initReactI18next).init({
  resources: getI18nResources(),
  lng: saved === 'zh' || saved === 'en' ? saved : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function applyCompanyLocaleOverrides(
  overrides?: Record<string, Record<string, unknown>>,
) {
  const resources = getI18nResources(overrides);
  for (const loc of ['en', 'zh'] as const) {
    i18n.removeResourceBundle(loc, 'translation');
    i18n.addResourceBundle(loc, 'translation', resources[loc].translation, true, true);
  }
}

export function resetBaseLocaleCatalog() {
  i18n.removeResourceBundle('en', 'translation');
  i18n.removeResourceBundle('zh', 'translation');
  i18n.addResourceBundle('en', 'translation', enMessages, true, true);
  i18n.addResourceBundle('zh', 'translation', zhMessages, true, true);
}

export default i18n;
