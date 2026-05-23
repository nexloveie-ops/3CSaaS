export const SUPPORTED_LOCALES = ['en', 'zh'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';

export function isValidLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** User preference → company default → fallback */
export function resolveLocale(
  userLocale?: string,
  companyDefault?: string,
  enabledLocales?: string[],
): AppLocale {
  const enabled = enabledLocales?.length ? enabledLocales : [...SUPPORTED_LOCALES];
  if (userLocale && isValidLocale(userLocale) && enabled.includes(userLocale)) {
    return userLocale;
  }
  if (companyDefault && isValidLocale(companyDefault) && enabled.includes(companyDefault)) {
    return companyDefault;
  }
  return DEFAULT_LOCALE;
}

export function deepMergeMessages<T extends Record<string, unknown>>(
  base: T,
  patch?: Record<string, unknown>,
): T {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = out[key];
    if (
      pv &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv)
    ) {
      out[key] = deepMergeMessages(
        bv as Record<string, unknown>,
        pv as Record<string, unknown>,
      );
    } else if (pv !== undefined) {
      out[key] = pv;
    }
  }
  return out as T;
}
