import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { readPersistedCashierOnly, normalizeMemberships, sessionIsCashierOnly } from '../lib/auth-session';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { DashboardPage } from './DashboardPage';

/** Overview — never shown to cashier-only accounts */
export function DashboardIndex() {
  const token = useAuthStore((s) => s.token);
  const cashierOnly = useAuthStore((s) => s.cashierOnly);

  if (cashierOnly || readPersistedCashierOnly()) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  const { data: me, isPending, isFetched } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
  });

  if (isFetched && sessionIsCashierOnly(normalizeMemberships(me?.memberships))) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  if (isPending) {
    return null;
  }

  return <DashboardPage />;
}
