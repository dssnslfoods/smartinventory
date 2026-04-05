import { useState } from 'react';
import { Search, Loader2, Users, Save, X, UserPlus, KeyRound } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn, formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile, UserRole } from '@/types/auth';
import { ROLE_LABELS, ROLE_COLORS } from '@/types/auth';
import { CreateUserModal } from '@/components/CreateUserModal';
import { ResetPasswordModal } from '@/components/ResetPasswordModal';

function useCompanyUsers(companyId: string | null) {
  return useQuery({
    queryKey: ['admin_users', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

// ── Inline-edit row ───────────────────────────────────────────────────────────

function UserRow({ user, onSaved }: { user: UserProfile; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // admin cannot assign super_admin; can assign up to admin
  const allowedRoles: UserRole[] = ['admin', 'executive', 'supervisor', 'staff'];

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ role, is_active: active })
        .eq('id', user.id);
      onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' };

  return (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <td className="px-4 py-3">
        <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{user.email ?? '—'}</div>
        {user.full_name && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{user.full_name}</div>
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <select
            value={role}
            onChange={e => setRole(e.target.value as UserRole)}
            className="rounded-lg border px-2 py-1 text-sm"
            style={inputStyle}
          >
            {allowedRoles.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        ) : (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS[user.role])}>
            {ROLE_LABELS[user.role]}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="rounded" />
            <span className="text-sm" style={{ color: 'var(--text)' }}>Active</span>
          </label>
        ) : (
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            user.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          )}>
            {user.is_active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {formatDateTime(user.created_at)}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
            <button
              onClick={() => { setRole(user.role); setActive(user.is_active); setEditing(false); }}
              className="p-1.5 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs border hover:bg-[var(--bg-alt)] transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Edit
            </button>
            <button
              onClick={() => setShowReset(true)}
              className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--bg-alt)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              title="Reset Password"
            >
              <KeyRound size={14} />
            </button>
          </div>
        )}
      </td>

      {showReset && (
        <ResetPasswordModal
          mode="admin"
          targetUserId={user.id}
          targetEmail={user.email ?? ''}
          onClose={() => setShowReset(false)}
        />
      )}
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function UsersPage() {
  const qc = useQueryClient();
  const { company } = useAuthStore();
  const { data: users = [], isLoading } = useCompanyUsers(company?.id ?? null);
  const [search, setSearch]       = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>User Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            จัดการผู้ใช้ภายใน {company?.name ?? 'บริษัท'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
        >
          <UserPlus size={16} />
          เพิ่มผู้ใช้งาน
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา email / ชื่อ..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Users size={32} style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ไม่พบผู้ใช้</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                {['Email / ชื่อ', 'Role', 'สถานะ', 'เข้าร่วม', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['admin_users', company?.id] })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {filtered.length} / {users.length} users
      </p>

      {showCreate && company && (
        <CreateUserModal
          fixedCompany={company}
          allowedRoles={['executive', 'supervisor', 'staff']}
          invalidateKeys={[['admin_users', company.id]]}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
