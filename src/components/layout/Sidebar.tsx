import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  AlertTriangle,
  DollarSign,
  BarChart2,
  Upload,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  ShoppingCart,
  Truck,
  Users,
  ShieldCheck,
  Shield,
  UserCog,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useStockAlerts, useGoodsInTransit } from '@/hooks/useSupabaseQuery';
import { cn } from '@/utils/format';
import type { PermissionKey } from '@/types/auth';
import { PERMISSIONS } from '@/types/auth';

// ── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
  permission?: PermissionKey;
  badge?: 'critical' | 'transit';
  external?: boolean;  // link to /superadmin/* (different layout)
};

type MenuEntry = { type: 'divider' } | NavItem;

// ── Main app menu (filterd by permission) ─────────────────────────────────────

const mainMenu: MenuEntry[] = [
  { path: '/',          label: 'Dashboard',          icon: LayoutDashboard, permission: PERMISSIONS.MENU_DASHBOARD },
  { path: '/stock',     label: 'Stock On-Hand',      icon: Package,         permission: PERMISSIONS.MENU_STOCK },
  { path: '/movement',  label: 'Movement History',   icon: ArrowLeftRight,  permission: PERMISSIONS.MENU_MOVEMENT },
  { path: '/alerts',    label: 'Low Stock Alerts',   icon: AlertTriangle,   permission: PERMISSIONS.MENU_ALERTS,   badge: 'critical' },
  { path: '/valuation', label: 'Cost & Valuation',   icon: DollarSign,      permission: PERMISSIONS.MENU_VALUATION },
  { path: '/reports',   label: 'Management Reports', icon: BarChart2,       permission: PERMISSIONS.MENU_REPORTS },
  { type: 'divider' },
  { path: '/procurement/suppliers', label: 'Suppliers',        icon: Building2,    permission: PERMISSIONS.MENU_SUPPLIERS },
  { path: '/procurement/orders',    label: 'Purchase Orders',  icon: ShoppingCart, permission: PERMISSIONS.MENU_ORDERS },
  { path: '/procurement/transit',   label: 'Goods in Transit', icon: Truck,        permission: PERMISSIONS.MENU_TRANSIT, badge: 'transit' },
  { type: 'divider' },
  { path: '/admin/import',   label: 'Data Import', icon: Upload,    permission: PERMISSIONS.MENU_IMPORT },
  { path: '/admin/settings', label: 'Settings',    icon: Settings,  permission: PERMISSIONS.MENU_SETTINGS },
];

// ── User management items per role ───────────────────────────────────────────

const adminUserMenu: NavItem[] = [
  { path: '/admin/users',       label: 'ผู้ใช้งาน',        icon: Users },
  { path: '/admin/permissions', label: 'สิทธิ์การเข้าถึง', icon: ShieldCheck },
];

const superAdminUserMenu: NavItem[] = [
  { path: '/superadmin/users',     label: 'ผู้ใช้ทั้งระบบ',  icon: Users,     external: true },
  { path: '/superadmin/companies', label: 'บริษัท',           icon: Building2, external: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  sidebarOpen,
  badgeCount,
}: {
  item: NavItem;
  isActive: boolean;
  sidebarOpen: boolean;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  const showBadge = badgeCount !== undefined && badgeCount > 0;

  const cls = cn(
    'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors relative',
    isActive
      ? 'bg-white/15 text-white font-medium'
      : 'text-white/70 hover:bg-white/5 hover:text-white'
  );

  return (
    <Link to={item.path} className={cls}>
      <Icon size={18} className="shrink-0" />
      {sidebarOpen && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.external && !isActive && (
            <ExternalLink size={12} className="shrink-0 opacity-40" />
          )}
          {showBadge && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {badgeCount}
            </span>
          )}
        </>
      )}
      {!sidebarOpen && showBadge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const location  = useLocation();
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const { profile, company, hasPermission } = useAuthStore();
  const { data: alerts }  = useStockAlerts();
  const { data: transit } = useGoodsInTransit();

  const criticalCount  = alerts?.filter(a => a.status === 'critical').length ?? 0;
  const overdueTransit = transit?.filter(t => t.arrival_status === 'overdue').length ?? 0;

  const role         = profile?.role;
  const isSuperAdmin = role === 'super_admin';
  const isAdmin      = role === 'admin';
  const showUserMgmt = isSuperAdmin || isAdmin;

  // Filter main menu by permissions and clean up orphan dividers
  const visibleMain = mainMenu.filter(item => {
    if ('type' in item) return true;
    return item.permission ? hasPermission(item.permission) : true;
  });

  const cleanMain = visibleMain.reduce<MenuEntry[]>((acc, item) => {
    if ('type' in item && item.type === 'divider') {
      const prev = acc[acc.length - 1];
      if (!prev || ('type' in prev)) return acc;
    }
    acc.push(item);
    return acc;
  }, []);
  while (cleanMain.length && 'type' in cleanMain[cleanMain.length - 1]) cleanMain.pop();

  // Company logo letter
  const companyName    = company?.name ?? (isSuperAdmin ? 'Platform' : 'NSL-IIP');
  const companyInitial = companyName.charAt(0).toUpperCase();

  const userMenuItems = isSuperAdmin ? superAdminUserMenu : adminUserMenu;

  const isActivePath = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
      style={{ backgroundColor: 'var(--sidebar-bg)' }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center h-16 px-4 border-b border-white/10 shrink-0">
        {sidebarOpen ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0',
              isSuperAdmin ? 'bg-purple-500' : 'bg-white/10'
            )}>
              {companyInitial}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white text-sm truncate leading-tight">{companyName}</div>
              <div className="text-xs text-white/40 leading-tight">Inventory Intelligence</div>
            </div>
          </div>
        ) : (
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm mx-auto',
            isSuperAdmin ? 'bg-purple-500' : 'bg-white/10'
          )}>
            {companyInitial}
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 overflow-y-auto flex flex-col gap-0.5">

        {/* Main menu */}
        {cleanMain.map((item, idx) => {
          if ('type' in item) {
            return <div key={`d-${idx}`} className="my-1.5 mx-4 border-t border-white/10" />;
          }
          const badgeCount =
            item.badge === 'critical' ? criticalCount :
            item.badge === 'transit'  ? overdueTransit : undefined;

          return (
            <NavLink
              key={item.path}
              item={item}
              isActive={isActivePath(item.path)}
              sidebarOpen={sidebarOpen}
              badgeCount={badgeCount}
            />
          );
        })}

        {/* ── User Management section (admin / super_admin only) ── */}
        {showUserMgmt && (
          <>
            {/* Section divider + label */}
            <div className="mt-2 mb-1 mx-2">
              {sidebarOpen ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <UserCog size={13} className="text-white/40 shrink-0" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40 truncate">
                    จัดการผู้ใช้งาน
                  </span>
                </div>
              ) : (
                <div className="border-t border-white/10 mx-2" />
              )}
            </div>

            {/* User management links */}
            {userMenuItems.map(item => (
              <NavLink
                key={item.path}
                item={item}
                isActive={isActivePath(item.path)}
                sidebarOpen={sidebarOpen}
              />
            ))}

            {/* Super Admin Console button (super_admin only) */}
            {isSuperAdmin && (
              <Link
                to="/superadmin"
                className={cn(
                  'flex items-center gap-3 mx-2 mt-1 px-3 py-2.5 rounded-lg text-sm transition-colors border border-white/10',
                  location.pathname === '/superadmin'
                    ? 'bg-purple-500/30 border-purple-500/40 text-purple-200 font-medium'
                    : 'text-purple-300/70 hover:bg-purple-500/15 hover:border-purple-500/30 hover:text-purple-200'
                )}
              >
                <Shield size={18} className="shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate">Super Admin Console</span>
                    <ExternalLink size={12} className="shrink-0 opacity-50" />
                  </>
                )}
              </Link>
            )}
          </>
        )}
      </nav>

      {/* ── Collapse toggle ── */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-12 border-t border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-colors shrink-0"
      >
        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
    </aside>
  );
}
