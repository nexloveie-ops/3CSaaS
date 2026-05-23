import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { isCashierRouteAllowed } from '@lz3c/shared';
import {
  readPersistedCashierOnly,
  normalizeMemberships,
  sessionIsCashierOnly,
} from '../lib/auth-session';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export function CashierRouteGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const cashierOnly = useAuthStore((s) => s.cashierOnly);
  const persistedCashier = readPersistedCashierOnly();

  const { data: me, isPending, isFetched } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
    staleTime: 0,
  });

  const isCashier =
    cashierOnly ||
    persistedCashier ||
    (isFetched && sessionIsCashierOnly(normalizeMemberships(me?.memberships)));

  if (isCashier && !isCashierRouteAllowed(location.pathname)) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  if (isPending && !!token && !cashierOnly && !persistedCashier) {
    return (
      <div className="page-content" style={{ padding: '2rem' }}>
        <p>{t('common.checking')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
