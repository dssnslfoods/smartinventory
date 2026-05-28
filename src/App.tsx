import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AppLayout } from '@/components/layout/AppLayout';
import { ForcedPasswordChangeGate } from '@/components/ForcedPasswordChangeGate';

// ─── Eager-loaded (always-on critical path) ─────────────────────────────────
// LoginPage stays eager so the very first paint is fast for unauthenticated
// users; AppLayout is part of the shell and already imported above.
import { LoginPage } from '@/pages/LoginPage';

// ─── Lazy-loaded routes — each becomes its own chunk ────────────────────────
// Pattern: lazy(() => import('...').then(m => ({ default: m.NamedExport })))
// This converts named exports to default for React.lazy.
const DashboardPage       = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const StockOnHandPage     = lazy(() => import('@/pages/StockOnHandPage').then(m => ({ default: m.StockOnHandPage })));
const MovementHistoryPage = lazy(() => import('@/pages/MovementHistoryPage').then(m => ({ default: m.MovementHistoryPage })));
const AlertsPage          = lazy(() => import('@/pages/AlertsPage').then(m => ({ default: m.AlertsPage })));
const ValuationPage       = lazy(() => import('@/pages/ValuationPage').then(m => ({ default: m.ValuationPage })));
const ReportsPage         = lazy(() => import('@/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SmartReportPage     = lazy(() => import('@/pages/SmartReportPage').then(m => ({ default: m.SmartReportPage })));
const LotInventoryPage    = lazy(() => import('@/pages/LotInventoryPage').then(m => ({ default: m.LotInventoryPage })));
const ImportPage          = lazy(() => import('@/pages/admin/ImportPage').then(m => ({ default: m.ImportPage })));
const SettingsPage        = lazy(() => import('@/pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AuditLogPage        = lazy(() => import('@/pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const UsersPage           = lazy(() => import('@/pages/admin/UsersPage').then(m => ({ default: m.UsersPage })));
const PermissionsPage     = lazy(() => import('@/pages/admin/PermissionsPage').then(m => ({ default: m.PermissionsPage })));
const VVMatrixGuidePage   = lazy(() => import('@/pages/admin/VVMatrixGuidePage').then(m => ({ default: m.VVMatrixGuidePage })));
const SuppliersPage       = lazy(() => import('@/pages/procurement/SuppliersPage'));
const PurchaseOrdersPage  = lazy(() => import('@/pages/procurement/PurchaseOrdersPage'));
const GoodsInTransitPage  = lazy(() => import('@/pages/procurement/GoodsInTransitPage'));
const SuperAdminLayout    = lazy(() => import('@/pages/superadmin/SuperAdminLayout').then(m => ({ default: m.SuperAdminLayout })));
const SuperAdminDashboardPage = lazy(() => import('@/pages/superadmin/DashboardPage'));
const CompaniesPage       = lazy(() => import('@/pages/superadmin/CompaniesPage'));
const SuperAdminUsersPage = lazy(() => import('@/pages/superadmin/UsersPage'));
const FeaturesPage        = lazy(() => import('@/pages/superadmin/FeaturesPage'));

import type { PermissionKey } from '@/types/auth';

// ─── Suspense fallback ──────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" aria-label="Loading page">
      <div className="w-10 h-10 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // Keep fetched data in memory for 30 min after a query goes unused so
      // returning to a page renders instantly from cache (no reload spinner).
      gcTime: 30 * 60 * 1000,
      // Don't refetch every time the browser tab regains focus — staleTime
      // already governs freshness on navigation. Avoids a refetch storm /
      // re-render burst when the user alt-tabs back. (No logic change.)
      refetchOnWindowFocus: false,
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
                  <Suspense fallback={<PageLoader />}>
                    <SuperAdminLayout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          <Route path="/"         element={<SuperAdminDashboardPage />} />
                          <Route path="/companies" element={<CompaniesPage />} />
                          <Route path="/users"     element={<SuperAdminUsersPage />} />
                          <Route path="/features"  element={<FeaturesPage />} />
                        </Routes>
                      </Suspense>
                    </SuperAdminLayout>
                  </Suspense>
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
                  <ForcedPasswordChangeGate>
                  <AppLayout>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />

                      <Route path="/stock"     element={<RequirePermission permission="menu.stock"><StockOnHandPage /></RequirePermission>} />
                      <Route path="/movement"  element={<RequirePermission permission="menu.movement"><MovementHistoryPage /></RequirePermission>} />
                      <Route path="/alerts"    element={<RequirePermission permission="menu.alerts"><AlertsPage /></RequirePermission>} />
                      <Route path="/valuation" element={<RequirePermission permission="menu.valuation"><ValuationPage /></RequirePermission>} />
                      <Route path="/reports"   element={<RequirePermission permission="menu.reports"><ReportsPage /></RequirePermission>} />
                      <Route path="/smart-report" element={<RequirePermission permission="menu.smart_report"><SmartReportPage /></RequirePermission>} />
                      <Route path="/lots"      element={<RequirePermission permission="menu.lots"><LotInventoryPage /></RequirePermission>} />

                      <Route path="/procurement/suppliers" element={<RequirePermission permission="menu.procurement.suppliers"><SuppliersPage /></RequirePermission>} />
                      <Route path="/procurement/orders"    element={<RequirePermission permission="menu.procurement.orders"><PurchaseOrdersPage /></RequirePermission>} />
                      <Route path="/procurement/transit"   element={<RequirePermission permission="menu.procurement.transit"><GoodsInTransitPage /></RequirePermission>} />

                      <Route path="/admin/import"       element={<RequirePermission permission="menu.admin.import"><ImportPage /></RequirePermission>} />
                      <Route path="/admin/settings"     element={<RequirePermission permission="menu.admin.settings"><SettingsPage /></RequirePermission>} />
                      <Route path="/admin/users"        element={<RequirePermission permission="menu.admin.users"><UsersPage /></RequirePermission>} />
                      <Route path="/admin/permissions"  element={<RequirePermission permission="menu.admin.users"><PermissionsPage /></RequirePermission>} />
                      <Route path="/admin/audit"        element={<RequirePermission permission="menu.admin.audit"><AuditLogPage /></RequirePermission>} />
                      <Route path="/admin/vv-guide"    element={<RequirePermission permission="menu.admin.settings"><VVMatrixGuidePage /></RequirePermission>} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                  </ForcedPasswordChangeGate>
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
