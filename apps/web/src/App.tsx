import { Navigate, Route, Routes } from 'react-router-dom';
import { CashierRouteGuard } from './components/CashierRouteGuard';
import { Layout } from './components/Layout';
import { readPersistedAuth } from './lib/auth-session';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { AdminPage } from './pages/AdminPage';
import { AuditPage } from './pages/AuditPage';
import { B2bPage } from './pages/B2bPage';
import { BillingPage } from './pages/BillingPage';
import { ChainPage } from './pages/ChainPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardIndex } from './pages/DashboardIndex';
import { HomePage } from './pages/HomePage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { PreordersPage } from './pages/PreordersPage';
import { PriceListPage } from './pages/PriceListPage';
import { ProductsPage } from './pages/ProductsPage';
import { RepairsPage } from './pages/RepairsPage';
import { ReportsPage } from './pages/ReportsPage';
import { StoreCatalogPage } from './pages/StoreCatalogPage';
import { TransfersPage } from './pages/TransfersPage';
import { WarehousePage } from './pages/WarehousePage';
import { useAuthStore } from './stores/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token) ?? readPersistedAuth().token;
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
        <Route path="store-catalog" element={<StoreCatalogPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="repairs" element={<RepairsPage />} />
        <Route path="price-list" element={<PriceListPage />} />
        <Route path="preorders" element={<PreordersPage />} />
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
