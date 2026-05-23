import { isCashierOnlyUser, type MembershipLike } from '@lz3c/shared';

const AUTH_STORAGE_KEY = 'lz3c-auth';

/** Read cashier flag synchronously from persisted auth (avoids flash before zustand hydrates). */
export function readPersistedCashierOnly(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { cashierOnly?: boolean } };
    return !!parsed.state?.cashierOnly;
  } catch {
    return false;
  }
}

export function normalizeMemberships(raw: unknown[] | undefined): MembershipLike[] {
  if (!raw?.length) return [];
  return raw.map((row) => {
    const m = row as MembershipLike & { role?: string };
    return {
      role: m.role,
      companyId: m.companyId,
      storeId: m.storeId ?? null,
    };
  });
}

export function sessionIsCashierOnly(memberships: MembershipLike[]): boolean {
  return isCashierOnlyUser(memberships);
}
