import { isCashierOnlyUser, type MembershipLike } from '@lz3c/shared';

const AUTH_STORAGE_KEY = 'lz3c-auth';

export function readPersistedAuth(): { token: string | null; cashierOnly: boolean } {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { token: null, cashierOnly: false };
    const parsed = JSON.parse(raw) as {
      state?: { token?: string | null; cashierOnly?: boolean };
    };
    return {
      token: parsed.state?.token ?? null,
      cashierOnly: !!parsed.state?.cashierOnly,
    };
  } catch {
    return { token: null, cashierOnly: false };
  }
}

/** Read cashier flag synchronously from persisted auth (avoids flash before zustand hydrates). */
export function readPersistedCashierOnly(): boolean {
  return readPersistedAuth().cashierOnly;
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

/** Prefer live memberships over a stale persisted cashier flag (e.g. after role upgrade). */
export function resolveCashierOnlySession(
  memberships: MembershipLike[] | undefined,
  persistedCashierOnly: boolean,
): boolean {
  if (memberships?.length) return isCashierOnlyUser(memberships);
  return persistedCashierOnly;
}
