import { deepMergeMessages, type AppLocale, DEFAULT_LOCALE, isValidLocale } from '../locale';
import { enMessages, type Messages } from './en';
import { zhMessages } from './zh';

export { enMessages, zhMessages, type Messages };

const catalogs: Record<AppLocale, Messages> = {
  en: enMessages,
  zh: zhMessages,
};

export function getMessages(locale: string): Messages {
  return isValidLocale(locale) ? catalogs[locale] : catalogs[DEFAULT_LOCALE];
}

export function getI18nResources(
  companyOverrides?: Record<string, Record<string, unknown>>,
): Record<string, { translation: Messages }> {
  const resources: Record<string, { translation: Messages }> = {
    en: { translation: enMessages },
    zh: { translation: zhMessages },
  };
  if (companyOverrides) {
    for (const loc of Object.keys(companyOverrides)) {
      if (!isValidLocale(loc)) continue;
      const patch = companyOverrides[loc];
      resources[loc] = {
        translation: deepMergeMessages(catalogs[loc], patch) as Messages,
      };
    }
  }
  return resources;
}
