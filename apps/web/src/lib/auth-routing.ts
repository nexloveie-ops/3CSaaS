import {
  membershipCompanyId,
  resolveBoundStoreId,
  resolveLoginLandingPath,
} from '@lz3c/shared';
import { normalizeMemberships } from './auth-session';
import { useAuthStore } from '../stores/auth';
import { useContextStore } from '../stores/context';

/** Apply company/store context and return landing path after auth. */
export function applyPostAuthRouting(memberships: unknown[]): string {
  const normalized = normalizeMemberships(memberships);
  useAuthStore.getState().setSessionFromMemberships(normalized);
  const path = resolveLoginLandingPath(normalized);
  const { setCompanyId, setStoreId } = useContextStore.getState();

  if (path === '/dashboard/pos' && normalized.length > 0) {
    const cashierMembership =
      normalized.find((m) => m.role === 'cashier') ?? normalized[0]!;
    const companyId = membershipCompanyId(cashierMembership);
    if (companyId) {
      setCompanyId(companyId);
      const bound = resolveBoundStoreId(normalized, companyId);
      if (bound) setStoreId(bound);
    }
  }

  return path;
}

/** Hard navigation — avoids React Router + stale query race for cashiers. */
export function navigateAfterAuth(path: string): void {
  if (useAuthStore.getState().cashierOnly || path === '/dashboard/pos') {
    window.location.replace('/dashboard/pos');
    return;
  }
  window.location.replace(path);
}
