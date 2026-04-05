import { useState } from 'react';
import { Search, Loader2, Users, Save, X, UserPlus, KeyRound } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn } from '@/utils/format';
import { formatDateTime } from '@/utils/format';
import type { UserProfile, Company, UserRole } from '@/types/auth';
import { ROLE_LABELS, ROLE_COLORS } from '@/types/auth';
import { CreateUserModal } from '@/components/CreateUserModal';
import { ResetPasswordModal } from '@/components/ResetPasswordModal';

function useAllUsers() {
  return useQuery({
    queryKey: ['superadmin_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, company:companies(id, name, slug)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

function useCompaniesForSelect() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Pick<Company, 'id' | 'name' | 'slug'>[];
    },
  });
}

// ── Inline-edit row ───────────────────────────────────────────────────────────

function UserRow({
  user,
  companies,
  onSaved,
}: {
  user: UserProfile;
  companies: Pick<Company, 'id' | 'name' | 'slug'>[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<UserRole>(user.role);
  const [companyId, setCompanyId] = useState(user.company_id ?? '');
  const [active, setActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from('user_profiles')
        .update({
          role,
          company_id: companyId || null,
          is_active: active,
        })
        .eq('id', user.id);
      onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setRole(user.role);
    setCompanyId(user.company_id ?? '');
    setActive(user.is_active);
    setEditing(false);
  };

  const inputCls = 'rounded-lg border px-2 py-1 text-sm w-full';
  const inputStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' };

  const allRoles: UserRole[] = ['super_admin', 'admin', 'executive', 'supervisor', 'staff'];

  return (
    <tr className="border-b last:border-0 hover:bg-[var(--bg-alt)/50]" style={{ borderColor: 'var(--border)' }}>
      {/* Email */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{user.email ?? '—'}</div>
        {user.full_name && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{user.full_name}</div>
        )}
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        {editing ? (
          <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={inputCls} style={inputStyle}>
            {allRoles.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        ) : (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS[user.role])}>
            {ROLE_LABELS[user.role]}
          </span>
        )}
      </td>

      {/* Company */}
      <td className="px-4 py-3">
        {editing ? (
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— ไม่ระบุ —</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            {(user.company as any)?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
          </span>
        )}
      </td>

      {/* Active */}
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

      {/* Joined */}
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {formatDateTime(user.created_at)}
      </td>

      {/* Actions */}
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
            <button onClick={handleCancel} className="p-1.5 rounded-lg border transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs border transition-colors hover:bg-[var(--bg-alt)]"
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

export default function SuperAdminUsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useAllUsers();
  const { data: companies = [] } = useCompaniesForSelect();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');
  const [filterCompany, setFilterCompany] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = users.filter(u => {
    const matchSearch =
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchRole    = !filterRole    || u.role === filterRole;
    const matchCompany = !filterCompany || u.company_id === filterCompany;
    return matchSearch && matchRole && matchCompany;
  });

  const allRoles: UserRole[] = ['super_admin', 'admin', 'executive', 'supervisor', 'staff'];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>All Users</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            จัดการผู้ใช้ทั้งหมดในระบบ — กำหนด role และบริษัท
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา email / ชื่อ..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as UserRole | '')}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All Roles</option>
          {allRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select
          value={filterCompany}
          onChange={e => setFilterCompany(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No users found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                {['Email / Name', 'Role', 'Company', 'Status', 'Joined', 'Actions'].map(h => (
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
                  companies={companies}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['superadmin_users'] })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {filtered.length} / {users.length} users
      </p>

      {showCreate && (
        <CreateUserModal
          companies={companies}
          allowedRoles={['admin', 'executive', 'supervisor', 'staff']}
          invalidateKeys={[['superadmin_users']]}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
