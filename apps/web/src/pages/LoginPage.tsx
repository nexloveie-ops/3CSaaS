import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isValidLocale } from '@lz3c/shared';
import { applyPostAuthRouting, navigateAfterAuth } from '../lib/auth-routing';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useLocaleStore } from '../stores/locale';

export function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  const { locale, setLocale } = useLocaleStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, displayName, locale);

      qc.removeQueries({ queryKey: ['me'] });

      setToken(res.accessToken);

      const loginPayload = res as {
        accessToken: string;
        user: { locale?: string };
        memberships?: unknown[];
      };
      const me =
        mode === 'login' && loginPayload.memberships?.length
          ? { user: loginPayload.user, memberships: loginPayload.memberships }
          : await api.me();
      qc.setQueryData(meQueryKey(res.accessToken), me);

      const userLocale = me.user.locale;
      if (userLocale && isValidLocale(userLocale)) {
        setLocale(userLocale, false);
      }

      const path = applyPostAuthRouting(me.memberships ?? []);
      navigateAfterAuth(path);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
        <p className="subtitle">{t('app.tagline')}</p>
        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <div className="form-field">
              <label>{t('auth.displayName')}</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-field">
            <label>{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="form-field">
            <label>{t('common.language')}</label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'en' | 'zh', false)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <button type="submit" className="btn-block" style={{ marginTop: '0.5rem' }}>
            {mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
          </button>
        </form>
        <button
          type="button"
          className="btn-secondary btn-block"
          style={{ marginTop: '0.75rem' }}
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}
        </button>
        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem' }}>
          <Link to="/">{t('auth.backHome')}</Link>
        </p>
      </div>
    </div>
  );
}
