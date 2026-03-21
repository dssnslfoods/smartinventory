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
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useStockAlerts } from '@/hooks/useSupabaseQuery';
import { cn } from '@/utils/format';

const menuItems = [
  { path: '/',          label: 'Dashboard',        icon: LayoutDashboard },
  { path: '/stock',     label: 'Stock On-Hand',    icon: Package },
  { path: '/movement',  label: 'Movement History', icon: ArrowLeftRight },
  { path: '/alerts',   label: 'Low Stock Alerts', icon: AlertTriangle },
  { path: '/valuation', label: 'Cost & Valuation', icon: DollarSign },
  { path: '/reports',  label: 'Management Reports', icon: BarChart2 },
  { type: 'divider' as const },
  { path: '/admin/import',    label: 'Data Import', icon: Upload },
  { path: '/admin/settings',  label: 'Settings',    icon: Settings },
] as const;

export function Sidebar() {
  const location = useLocation();
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const { data: alerts } = useStockAlerts();
  const criticalCount = alerts?.filter(a => a.status === 'critical').length ?? 0;

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16'}`}
      style={{ backgroundColor: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        {sidebarOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-white text-sm">
              N
            </div>
            <div>
              <div className="font-bold text-white text-sm">NSL-IIP</div>
              <div className="text-xs text-white/50">Inventory Intelligence</div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-white text-sm mx-auto">
            N
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {menuItems.map((item, index) => {
          if ('type' in item && item.type === 'divider') {
            return <div key={index} className="my-2 mx-4 border-t border-white/10" />;
          }

          if (!('path' in item)) return null;

          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          const Icon = item.icon;
          const showBadge = item.path === '/alerts' && criticalCount > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors relative',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon size={20} className="shrink-0" />
              {sidebarOpen && (
                <>
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {criticalCount}
                    </span>
                  )}
                </>
              )}
              {!sidebarOpen && showBadge && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {criticalCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-12 border-t border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
      >
        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
    </aside>
  );
}
