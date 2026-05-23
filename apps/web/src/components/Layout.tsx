import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  isCashierNavPath,
  isCashierOnlyUser,
  isCashierRouteAllowed,
  membershipCompanyId,
  NAV_MODULE_REQUIREMENTS,
  resolveBoundStoreId,
  type MembershipLike,
} from '@lz3c/shared';
import { applyCompanyLocaleOverrides } from '../i18n';
import { meQueryKey } from '../lib/query-keys';
import { readPersistedCashierOnly } from '../lib/auth-session';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useContextStore } from '../stores/context';
import { LanguageSwitcher } from './LanguageSwitcher';

const SIDEBAR_VISIBLE_KEY = 'lz3c-sidebar-visible';

function readSidebarVisible(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== '0';
  } catch {
    return true;
  }
}

type NavItem = {
  to: string;
  key: string;
  module: string | null;
  roles?: readonly string[];
  end?: boolean;
};

const NAV_GROUPS: { id: string; labelKey: string; items: NavItem[] }[] = [
  {
    id: 'overview',
    labelKey: 'nav.groupOverview',
    items: [{ to: '/dashboard', key: 'nav.overview', module: null, end: true }],
  },
  {
    id: 'main',
    labelKey: 'nav.groupSales',
    items: [
      { to: '/dashboard/pos', key: 'nav.pos', module: NAV_MODULE_REQUIREMENTS['/dashboard/pos'] },
      { to: '/dashboard/repairs', key: 'nav.repairs', module: NAV_MODULE_REQUIREMENTS['/dashboard/repairs'] },
      { to: '/dashboard/preorders', key: 'nav.preorders', module: NAV_MODULE_REQUIREMENTS['/dashboard/preorders'] },
      { to: '/dashboard/products', key: 'nav.products', module: NAV_MODULE_REQUIREMENTS['/dashboard/products'] },
      { to: '/dashboard/inventory', key: 'nav.inventory', module: NAV_MODULE_REQUIREMENTS['/dashboard/inventory'] },
      { to: '/dashboard/transfers', key: 'nav.transfers', module: NAV_MODULE_REQUIREMENTS['/dashboard/transfers'] },
      { to: '/dashboard/price-list', key: 'nav.priceList', module: NAV_MODULE_REQUIREMENTS['/dashboard/price-list'] },
      { to: '/dashboard/reports', key: 'nav.reports', module: NAV_MODULE_REQUIREMENTS['/dashboard/reports'] },
      { to: '/dashboard/credit-notes', key: 'nav.creditNotes', module: NAV_MODULE_REQUIREMENTS['/dashboard/credit-notes'] },
    ],
  },
  {
    id: 'warehouse',
    labelKey: 'nav.groupCatalog',
    items: [
      { to: '/dashboard/warehouse', key: 'nav.warehouse', module: NAV_MODULE_REQUIREMENTS['/dashboard/warehouse'] },
    ],
  },
  {
    id: 'network',
    labelKey: 'nav.groupNetwork',
    items: [
      { to: '/dashboard/b2b', key: 'nav.b2b', module: NAV_MODULE_REQUIREMENTS['/dashboard/b2b'] },
      { to: '/dashboard/chain', key: 'nav.chain', module: NAV_MODULE_REQUIREMENTS['/dashboard/chain'] },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.groupInsights',
    items: [
      { to: '/dashboard/audit', key: 'nav.audit', module: null, roles: ['admin', 'manager'] },
    ],
  },
  {
    id: 'account',
    labelKey: 'nav.groupAccount',
    items: [
      { to: '/dashboard/billing', key: 'nav.billing', module: null },
    ],
  },
];

export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const {
    companyId,
    storeId,
    enabledModules,
    subscriptionStatus,
    setCompanyId,
    setStoreId,
    setCompanyMeta,
  } = useContextStore();

  const { data: me } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
    staleTime: 0,
  });
  const isSuperAdmin = !!(me as { user?: { isSuperAdmin?: boolean } })?.user?.isSuperAdmin;
  const displayName = (me as { user?: { displayName?: string; email?: string } })?.user?.displayName;

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.listCompanies(),
    enabled: !!token,
  });

  const { data: stores } = useQuery({
    queryKey: ['stores', companyId],
    queryFn: () => api.listStores(),
    enabled: !!token && !!companyId,
  });

  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => api.getCompany(companyId!),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (company?.localeOverrides) {
      applyCompanyLocaleOverrides(company.localeOverrides);
    }
  }, [company?.localeOverrides]);

  useEffect(() => {
    if (company) {
      setCompanyMeta({
        enabledModules: company.enabledModules as typeof enabledModules,
        subscriptionStatus: company.subscriptionStatus,
      });
    }
  }, [company, setCompanyMeta]);

  const memberships = (me as { memberships?: MembershipLike[] })?.memberships ?? [];
  const cashierOnlyFlag = useAuthStore((s) => s.cashierOnly);
  const isCashierAccount =
    cashierOnlyFlag ||
    readPersistedCashierOnly() ||
    isCashierOnlyUser(memberships);

  const boundStoreId = useMemo(
    () => (companyId ? resolveBoundStoreId(memberships, companyId) : null),
    [memberships, companyId],
  );

  useEffect(() => {
    if (!memberships.length) return;
    if (isCashierAccount || memberships.length === 1) {
      const m = memberships[0]!;
      const cid = membershipCompanyId(m);
      if (cid && companyId !== cid) setCompanyId(cid);
    }
  }, [memberships, companyId, setCompanyId, isCashierAccount]);

  useEffect(() => {
    if (boundStoreId && storeId !== boundStoreId) {
      setStoreId(boundStoreId);
    }
  }, [boundStoreId, storeId, setStoreId]);

  const effectiveRole = useMemo(() => {
    if (!companyId || !memberships?.length) return null;
    const cid = companyId;
    const companyAdmin = memberships.find((m) => {
      const c = typeof m.companyId === 'object' ? m.companyId?._id : m.companyId;
      return String(c) === cid && m.role === 'admin' && !m.storeId;
    });
    if (companyAdmin) return 'admin';
    if (storeId) {
      const sm = memberships.find((m) => {
        const c = typeof m.companyId === 'object' ? m.companyId?._id : m.companyId;
        const s = typeof m.storeId === 'object' ? m.storeId?._id : m.storeId;
        return String(c) === cid && String(s) === storeId;
      });
      if (sm?.role) return sm.role;
    }
    const any = memberships.find((m) => {
      const c = typeof m.companyId === 'object' ? m.companyId?._id : m.companyId;
      return String(c) === cid;
    });
    return any?.role ?? null;
  }, [me, companyId, storeId]);

  const visibleGroups = useMemo(() => {
    const mods = enabledModules ?? company?.enabledModules;
    const groups = NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((n) => {
        if (isCashierAccount && !isCashierNavPath(n.to)) {
          return false;
        }
        if (n.roles && (!effectiveRole || !n.roles.includes(effectiveRole))) return false;
        if (n.module && mods?.length && !mods.includes(n.module)) return false;
        return true;
      }),
    })).filter((g) => g.items.length > 0);
    return groups;
  }, [enabledModules, company?.enabledModules, effectiveRole]);

  const readOnly =
    subscriptionStatus === 'read_only' || company?.subscriptionStatus === 'read_only';

  const isCashier = isCashierAccount || effectiveRole === 'cashier';
  const companyList = companies as { _id: string; name: string }[] | undefined;
  const companyName = companyList?.find((c) => c._id === companyId)?.name;
  const storeName = (stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined)?.find(
    (s) => s._id === storeId,
  )?.name;
  const staffName =
    displayName ??
    (me as { user?: { email?: string } })?.user?.email ??
    '';
  const brandTitle =
    storeName && staffName
      ? `${storeName} - ${staffName}`
      : (storeName ?? (staffName || t('app.title')));
  const brandSubtitle = storeName
    ? (companyName ?? '')
    : (companyName ?? t('app.taglineShort'));
  const showSidebarContext = !isCashier || !boundStoreId;
  const [sidebarVisible, setSidebarVisible] = useState(() => readSidebarVisible());

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_VISIBLE_KEY, sidebarVisible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarVisible]);

  if (isCashier && !isCashierRouteAllowed(location.pathname)) {
    return <Navigate to="/dashboard/pos" replace />;
  }

  return (
    <div className={sidebarVisible ? 'app-shell' : 'app-shell app-shell--sidebar-hidden'}>
      <aside className="sidebar" aria-hidden={!sidebarVisible}>
        <div className="sidebar-brand">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarVisible(false)}
            aria-label={t('nav.hideSidebar')}
            title={t('nav.hideSidebar')}
          >
            ‹
          </button>
          <h1 title={brandTitle}>{brandTitle}</h1>
          <p title={brandSubtitle}>{brandSubtitle}</p>
        </div>
        <nav className="sidebar-nav">
          {visibleGroups.map((group) => (
            <div key={group.id}>
              <div className="nav-group-label">{t(group.labelKey)}</div>
              {group.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  {t(n.key)}
                </NavLink>
              ))}
            </div>
          ))}
          {isSuperAdmin && (
            <>
              <div className="nav-group-label">{t('nav.groupSystem')}</div>
              <NavLink
                to="/dashboard/admin"
                className={({ isActive }) =>
                  isActive ? 'nav-link admin active' : 'nav-link admin'
                }
              >
                {t('nav.superAdmin')}
              </NavLink>
            </>
          )}
        </nav>

        {showSidebarContext ? (
          <div className="sidebar-context">
            <select
              className="sidebar-context-select"
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(e.target.value || null)}
              aria-label={t('common.companySelect')}
            >
              <option value="">{t('common.companySelect')}</option>
              {companyList?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="sidebar-context-select"
              value={storeId ?? ''}
              onChange={(e) => setStoreId(e.target.value || null)}
              disabled={!companyId}
              aria-label={t('common.storeSelect')}
            >
              <option value="">{t('common.storeSelect')}</option>
              {(stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined)?.map(
                (s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.warehouseEnabled ? ' · WH' : ''}
                  </option>
                ),
              )}
            </select>
          </div>
        ) : null}

        <div className="sidebar-footer">
          <LanguageSwitcher variant="sidebar" />
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => {
              qc.removeQueries({ queryKey: ['me'] });
              logout();
              navigate('/login');
            }}
          >
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="main-area">
        {!sidebarVisible && (
          <button
            type="button"
            className="sidebar-reveal"
            onClick={() => setSidebarVisible(true)}
            aria-label={t('nav.showSidebar')}
            title={t('nav.showSidebar')}
          >
            ›
          </button>
        )}
        {readOnly ? (
          <div style={{ padding: '0 1.5rem' }}>
            <div className="alert alert-warning">{t('common.subscriptionReadOnly')}</div>
          </div>
        ) : null}

        {!companyId || !storeId ? (
          <div style={{ padding: '0 1.5rem' }}>
            <div className="alert alert-info">{t('common.setContextFirst')}</div>
          </div>
        ) : null}

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
