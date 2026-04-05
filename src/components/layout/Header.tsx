import { useState } from 'react';
import { Moon, Sun, LogOut, User, KeyRound } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocation } from 'react-router-dom';
import { cn } from '@/utils/format';
import { ROLE_LABELS, ROLE_COLORS } from '@/types/auth';
import { ResetPasswordModal } from '@/components/ResetPasswordModal';

const pageTitles: Record<string, string> = {
  '/':                       'Executive Dashboard',
  '/stock':                  'Stock On-Hand',
  '/movement':               'Movement History',
  '/alerts':                 'Low Stock Alerts',
  '/valuation':              'Cost & Valuation',
  '/reports':                'Management Reports',
  '/procurement/suppliers':  'Suppliers',
  '/procurement/orders':     'Purchase Orders',
  '/procurement/transit':    'Goods in Transit',
  '/admin/import':           'Data Import',
  '/admin/settings':         'Settings',
  '/admin/users':            'User Management',
  '/admin/permissions':      'Role Permissions',
};

export function Header() {
  const { darkMode, toggleDarkMode } = useAppStore();
  const { user, profile, signOut } = useAuthStore();
  const location = useLocation();
  const [showResetPwd, setShowResetPwd] = useState(false);

  const title = pageTitles[location.pathname] || 'NSL-IIP';
  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'User';

  return (
    <header
      className="h-16 flex items-center justify-between px-6 border-b shrink-0"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </h1>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
          <User size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            {displayName}
          </span>
          {profile?.role && (
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium ml-1',
              ROLE_COLORS[profile.role]
            )}>
              {ROLE_LABELS[profile.role]}
            </span>
          )}
        </div>

        <button
          onClick={() => setShowResetPwd(true)}
          className="p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="เปลี่ยนรหัสผ่าน"
        >
          <KeyRound size={20} />
        </button>

        <button
          onClick={signOut}
          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>

      {showResetPwd && (
        <ResetPasswordModal
          mode="self"
          targetEmail={user?.email ?? ''}
          onClose={() => setShowResetPwd(false)}
        />
      )}
    </header>
  );
}
