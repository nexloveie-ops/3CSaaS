import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CashierRouteGuard } from './components/CashierRouteGuard';
import { Layout } from './components/Layout';
import { api } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { DashboardIndex } from './pages/DashboardIndex';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { PosPage } from './pages/PosPage';
import { CustomersPage } from './pages/CustomersPage';
import { RepairsPage } from './pages/RepairsPage';
import { PreordersPage } from './pages/PreordersPage';
import { CreditNotesPage } from './pages/CreditNotesPage';
import { PriceListPage } from './pages/PriceListPage';
import { B2bPage } from './pages/B2bPage';
import { TransfersPage } from './pages/TransfersPage';
import { ReportsPage } from './pages/ReportsPage';
import { BillingPage } from './pages/BillingPage';
import { AdminPage } from './pages/AdminPage';
import { WarehousePage } from './pages/WarehousePage';
import { ChainPage } from './pages/ChainPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { AuditPage } from './pages/AuditPage';
import { useAuthStore } from './stores/auth';
import { normalizeMemberships, readPersistedCashierOnly } from './lib/auth-session';
import { meQueryKey } from './lib/query-keys';
import { resolveLoginLandingPath } from '@lz3c/shared';

function HealthCard() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 30000,
  });

  return (
    <div className="card" style={{ textAlign: 'left', width: '100%', maxWidth: 420 }}>
      <h3>{t('home.apiMongo')}</h3>
      {isLoading && <p>{t('common.checking')}</p>}
      {error && <p className="status-fail">{(error as Error).message}</p>}
      {data && (
        <pre className={`code-block ${data.status === 'ok' ? 'status-ok' : 'status-fail'}`}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function HomePage() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const cashierOnly = useAuthStore((s) => s.cashierOnly);
  const { data: me } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
  });
  const dashboardPath =
    cashierOnly || readPersistedCashierOnly()
      ? '/dashboard/pos'
      : me
        ? resolveLoginLandingPath(normalizeMemberships(me.memberships))
        : '/dashboard';

  return (
    <div className="marketing-page">
      <div className="marketing-hero">
        <h1>{t('app.title')}</h1>
        <p>{t('app.tagline')}</p>
        {token ? (
          <Link to={dashboardPath} className="btn btn-primary" style={{ display: 'inline-block' }}>
            {t('home.dashboardLink')}
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>
            {t('home.loginLink')}
          </Link>
        )}
      </div>
      <HealthCard />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <CashierRouteGuard>
              <Layout />
            </CashierRouteGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardIndex />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="repairs" element={<RepairsPage />} />
        <Route path="price-list" element={<PriceListPage />} />
        <Route path="preorders" element={<PreordersPage />} />
        <Route path="credit-notes" element={<CreditNotesPage />} />
        <Route path="b2b" element={<B2bPage />} />
        <Route path="warehouse" element={<WarehousePage />} />
        <Route path="chain" element={<ChainPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}
