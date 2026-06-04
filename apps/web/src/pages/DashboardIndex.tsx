import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { isStoreBoundManagerUser, STORE_MANAGER_LANDING_PATH } from '@lz3c/shared';
import {
  normalizeMemberships,
  resolveCashierOnlySession,
} from '../lib/auth-session';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { DashboardPage } from './DashboardPage';

/** Overview — never shown to cashier-only accounts */
export function DashboardIndex() {
  const token = useAuthStore((s) => s.token);
  const persistedCashierOnly = useAuthStore((s) => s.cashierOnly);

  const { data: me, isLoading, isFetched } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
    staleTime: 60_000,
  });

  const memberships = normalizeMemberships(me?.memberships);
  const isCashierOnly = resolveCashierOnlySession(
    isFetched ? memberships : undefined,
    persistedCashierOnly,
  );

  if (isCashierOnly) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  if (isFetched && isStoreBoundManagerUser(memberships)) {
    return <Navigate to={STORE_MANAGER_LANDING_PATH} replace />;
  }

  if (isLoading) {
    return null;
  }

  return <DashboardPage />;
}
