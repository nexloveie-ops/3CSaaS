import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { isCashierRouteAllowed } from '@lz3c/shared';
import {
  readPersistedAuth,
  readPersistedCashierOnly,
  normalizeMemberships,
  resolveCashierOnlySession,
} from '../lib/auth-session';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export function CashierRouteGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const token = useAuthStore((s) => s.token) ?? readPersistedAuth().token;
  const persistedCashierOnly =
    useAuthStore((s) => s.cashierOnly) || readPersistedCashierOnly();
  const setSessionFromMemberships = useAuthStore((s) => s.setSessionFromMemberships);
  const logout = useAuthStore((s) => s.logout);

  const { data: me, isLoading, isError, error, isFetched, refetch } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
    staleTime: 60_000,
    retry: 1,
  });

  const memberships = normalizeMemberships(me?.memberships);
  const isCashier = resolveCashierOnlySession(
    isFetched && memberships.length ? memberships : undefined,
    persistedCashierOnly,
  );

  useEffect(() => {
    if (!isFetched || !memberships.length) return;
    setSessionFromMemberships(memberships);
  }, [isFetched, memberships, setSessionFromMemberships]);

  if (isCashier && !isCashierRouteAllowed(location.pathname)) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  if (token && isLoading) {
    return (
      <div className="page-content" style={{ padding: '2rem' }}>
        <p>{t('common.checking')}</p>
      </div>
    );
  }

  if (token && isError) {
    return (
      <div className="page-content" style={{ padding: '2rem' }}>
        <p className="status-fail">{(error as Error).message}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()}>
            {t('common.retry')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => logout()}>
            {t('common.logout')}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
