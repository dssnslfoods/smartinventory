import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { StockOnHandPage } from '@/pages/StockOnHandPage';
import { MovementHistoryPage } from '@/pages/MovementHistoryPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { ValuationPage } from '@/pages/ValuationPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ImportPage } from '@/pages/admin/ImportPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { PermissionsPage } from '@/pages/admin/PermissionsPage';
import { VVMatrixGuidePage } from '@/pages/admin/VVMatrixGuidePage';
import SuppliersPage from '@/pages/procurement/SuppliersPage';
import PurchaseOrdersPage from '@/pages/procurement/PurchaseOrdersPage';
import GoodsInTransitPage from '@/pages/procurement/GoodsInTransitPage';
import { SuperAdminLayout } from '@/pages/superadmin/SuperAdminLayout';
import SuperAdminDashboardPage from '@/pages/superadmin/DashboardPage';
import CompaniesPage from '@/pages/superadmin/CompaniesPage';
import SuperAdminUsersPage from '@/pages/superadmin/UsersPage';
import FeaturesPage from '@/pages/superadmin/FeaturesPage';
import type { PermissionKey } from '@/types/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// ── Route guards ──────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  if (!isSupabaseConfigured()) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Requires the user to be active (profile.is_active) */
function ActiveUserRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();

  if (!isSupabaseConfigured()) return <>{children}</>;
  if (loading) return null;
  if (profile && !profile.is_active) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center p-8">
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>บัญชีถูกระงับ</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Requires the user to have a specific permission (or be admin/super_admin) */
function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: React.ReactNode;
}) {
  const { hasPermission, loading } = useAuthStore();
  if (!isSupabaseConfigured()) return <>{children}</>;
  if (loading) return null;
  if (!hasPermission(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Requires super_admin role */
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();
  if (!isSupabaseConfigured()) return <>{children}</>;
  if (loading) return null;
  if (profile && profile.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Super Admin routes (separate layout) */}
          <Route
            path="/superadmin/*"
            element={
              <ProtectedRoute>
                <RequireSuperAdmin>
                  <SuperAdminLayout>
                    <Routes>
                      <Route path="/"         element={<SuperAdminDashboardPage />} />
                      <Route path="/companies" element={<CompaniesPage />} />
                      <Route path="/users"     element={<SuperAdminUsersPage />} />
                      <Route path="/features"  element={<FeaturesPage />} />
                    </Routes>
                  </SuperAdminLayout>
                </RequireSuperAdmin>
              </ProtectedRoute>
            }
          />

          {/* Main app routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <ActiveUserRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />

                      <Route path="/stock"     element={<RequirePermission permission="menu.stock"><StockOnHandPage /></RequirePermission>} />
                      <Route path="/movement"  element={<RequirePermission permission="menu.movement"><MovementHistoryPage /></RequirePermission>} />
                      <Route path="/alerts"    element={<RequirePermission permission="menu.alerts"><AlertsPage /></RequirePermission>} />
                      <Route path="/valuation" element={<RequirePermission permission="menu.valuation"><ValuationPage /></RequirePermission>} />
                      <Route path="/reports"   element={<RequirePermission permission="menu.reports"><ReportsPage /></RequirePermission>} />

                      <Route path="/procurement/suppliers" element={<RequirePermission permission="menu.procurement.suppliers"><SuppliersPage /></RequirePermission>} />
                      <Route path="/procurement/orders"    element={<RequirePermission permission="menu.procurement.orders"><PurchaseOrdersPage /></RequirePermission>} />
                      <Route path="/procurement/transit"   element={<RequirePermission permission="menu.procurement.transit"><GoodsInTransitPage /></RequirePermission>} />

                      <Route path="/admin/import"       element={<RequirePermission permission="menu.admin.import"><ImportPage /></RequirePermission>} />
                      <Route path="/admin/settings"     element={<RequirePermission permission="menu.admin.settings"><SettingsPage /></RequirePermission>} />
                      <Route path="/admin/users"        element={<RequirePermission permission="menu.admin.users"><UsersPage /></RequirePermission>} />
                      <Route path="/admin/permissions"  element={<RequirePermission permission="menu.admin.users"><PermissionsPage /></RequirePermission>} />
                      <Route path="/admin/vv-guide"    element={<RequirePermission permission="menu.admin.settings"><VVMatrixGuidePage /></RequirePermission>} />
                    </Routes>
                  </AppLayout>
                </ActiveUserRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
