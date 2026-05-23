import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { applyPostAuthRouting, navigateAfterAuth } from '../lib/auth-routing';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useLocaleStore } from '../stores/locale';

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const inviteToken = params.get('token') ?? '';
  const authToken = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const { locale } = useLocaleStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [error, setError] = useState('');

  const { data: preview, isLoading } = useQuery({
    queryKey: ['invite', inviteToken],
    queryFn: () => api.previewInvite(inviteToken),
    enabled: !!inviteToken,
  });

  useEffect(() => {
    if (preview?.email) setEmail(preview.email);
  }, [preview?.email]);

  async function finishSession(accessToken: string) {
    qc.removeQueries({ queryKey: ['me'] });
    setToken(accessToken);
    const me = await api.me();
    qc.setQueryData(meQueryKey(accessToken), me);
    const path = applyPostAuthRouting(me.memberships ?? []);
    navigateAfterAuth(path);
  }

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(inviteToken),
    onSuccess: async () => {
      const token = useAuthStore.getState().token;
      if (token) await finishSession(token);
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!inviteToken) {
      setError(t('invite.missingToken'));
      return;
    }
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, displayName, locale);
      await api.acceptInvite(inviteToken);
      await finishSession(res.accessToken);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!inviteToken) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="alert alert-danger">{t('invite.missingToken')}</div>
          <Link to="/login">{t('auth.loginTitle')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <h1>{t('invite.title')}</h1>
        {isLoading && <p>{t('common.checking')}</p>}
        {preview && (
          <div className="section-card" style={{ marginBottom: '1rem' }}>
            <p>{t('invite.joinCompany', { name: preview.companyName })}</p>
            <p>
              {t('invite.role')}: <strong>{preview.role}</strong>
            </p>
            <p>
              {t('auth.email')}: {preview.email}
            </p>
            {!preview.valid && (
              <div className="alert alert-danger">
                {preview.accepted
                  ? t('invite.alreadyAccepted')
                  : preview.expired
                    ? t('invite.expired')
                    : t('invite.invalid')}
              </div>
            )}
          </div>
        )}

        {preview?.valid && (
          <>
            {authToken ? (
              <div className="section-card">
                <button type="button" className="btn-block" onClick={() => accept.mutate()} disabled={accept.isPending}>
                  {t('invite.acceptNow')}
                </button>
                {accept.error && (
                  <div className="alert alert-danger" style={{ marginTop: '0.75rem' }}>
                    {(accept.error as Error).message}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <p className="subtitle">{t('invite.signInFirst')}</p>
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
                {error ? <div className="alert alert-danger">{error}</div> : null}
                <button type="submit" className="btn-block">
                  {mode === 'login' ? t('invite.loginAndAccept') : t('invite.registerAndAccept')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-block"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}
                </button>
              </form>
            )}
          </>
        )}

        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem' }}>
          <Link to="/">{t('auth.backHome')}</Link>
        </p>
      </div>
    </div>
  );
}
