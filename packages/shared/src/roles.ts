/** Dashboard paths cashiers must not access (Overview + admin/network/account). */
export const CASHIER_BLOCKED_NAV_PATHS = [
  '/dashboard/b2b',
  '/dashboard/chain',
  '/dashboard/audit',
  '/dashboard/billing',
  '/dashboard/admin',
] as const;

export type MembershipLike = {
  role?: string;
  companyId?: { _id?: string } | string;
  storeId?: { _id?: string } | string | null;
};

/**
 * Store-bound users (cashier, warehouse_staff) return their single assigned store id.
 * Company-wide roles (admin, company manager) return null.
 */
export function resolveBoundStoreId(
  memberships: MembershipLike[],
  companyId: string,
): string | null {
  const inCompany = memberships.filter((m) => {
    const c = typeof m.companyId === 'object' ? m.companyId?._id : m.companyId;
    return String(c) === companyId;
  });
  if (!inCompany.length) return null;
  if (inCompany.some((m) => m.role === 'admin' && !m.storeId)) return null;
  if (inCompany.some((m) => m.role === 'manager' && !m.storeId)) return null;
  const bound = inCompany.filter((m) => m.storeId);
  if (!bound.length) return null;
  const ids = [
    ...new Set(
      bound.map((m) => {
        const s = typeof m.storeId === 'object' ? m.storeId?._id : m.storeId;
        return String(s);
      }),
    ),
  ];
  return ids.length === 1 ? ids[0]! : null;
}

export function isStoreBoundRole(
  memberships: MembershipLike[],
  companyId: string,
): boolean {
  return resolveBoundStoreId(memberships, companyId) != null;
}

/** True when every membership is store cashier (no admin / company manager). */
export function isCashierOnlyUser(memberships: MembershipLike[]): boolean {
  return (
    memberships.length > 0 &&
    memberships.every((m) => m.role === 'cashier')
  );
}

/** Post-login route: cashiers land on POS; admins/managers on overview. */
export function resolveLoginLandingPath(memberships: MembershipLike[]): string {
  if (!memberships.length) return '/dashboard';
  const hasElevated = memberships.some(
    (m) => m.role === 'admin' || (m.role === 'manager' && !m.storeId),
  );
  if (hasElevated) return '/dashboard';
  if (isCashierOnlyUser(memberships)) return '/dashboard/pos';
  return '/dashboard';
}

function normalizeDashboardPath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

/** Sidebar + router: store ops under /dashboard/* except blocked admin/network paths. */
export function isCashierNavPath(pathname: string): boolean {
  const path = normalizeDashboardPath(pathname);
  if (path === '/dashboard') return false;
  if (!(CASHIER_BLOCKED_NAV_PATHS as readonly string[]).includes(path)) {
    if (path.startsWith('/dashboard/')) return true;
  }
  return false;
}

export function isCashierRouteAllowed(pathname: string): boolean {
  return isCashierNavPath(pathname);
}

export function membershipCompanyId(m: MembershipLike): string | null {
  const c = typeof m.companyId === 'object' ? m.companyId?._id : m.companyId;
  return c != null ? String(c) : null;
}
