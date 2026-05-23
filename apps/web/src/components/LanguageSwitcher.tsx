import { SUPPORTED_LOCALES } from '@lz3c/shared';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '../stores/locale';

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'sidebar' }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocaleStore();
  const className =
    variant === 'sidebar' ? 'sidebar-locale' : 'form-field topbar-locale';

  return (
    <label className={className} style={{ marginBottom: 0, minWidth: 0 }}>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as 'en' | 'zh')}
        aria-label={t('common.language')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {loc === 'zh' ? '中文' : 'English'}
          </option>
        ))}
      </select>
    </label>
  );
}
