import { Link, useLocation, Navigate } from 'react-router-dom';
import { Building2, Users, LayoutDashboard, LogOut, Moon, Sun, ChevronLeft, Sliders } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/utils/format';

const navItems = [
  { path: '/superadmin',           label: 'Overview',        icon: LayoutDashboard, exact: true },
  { path: '/superadmin/companies', label: 'Companies',       icon: Building2 },
  { path: '/superadmin/users',     label: 'All Users',       icon: Users },
  { path: '/superadmin/features',  label: 'Feature Access',  icon: Sliders },
];

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuthStore();
  const { darkMode, toggleDarkMode } = useAppStore();
  const location = useLocation();

  if (profile && profile.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside className="w-60 flex flex-col shrink-0" style={{ backgroundColor: '#1e1b4b' }}>
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center font-bold text-white text-sm">
            S
          </div>
          <div>
            <div className="font-bold text-white text-sm">Super Admin</div>
            <div className="text-xs text-white/50">NSL-IIP Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(item => {
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to app */}
        <div className="p-3 border-t border-white/10 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="h-16 flex items-center justify-between px-6 border-b shrink-0"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--text)' }}>
            Super Admin Console
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="text-sm px-3 py-1 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text)' }}>
              {profile?.email ?? profile?.full_name ?? 'Super Admin'}
            </span>
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: 'var(--bg-alt)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
