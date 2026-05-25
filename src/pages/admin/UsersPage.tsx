import { useMemo, useState } from 'react';
import { Search, Loader2, Users, Save, X, UserPlus, KeyRound, AlertTriangle, UserCheck, UserX, ShieldAlert } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn, formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile, UserRole } from '@/types/auth';
import { ROLE_LABELS, ROLE_COLORS } from '@/types/auth';
import { CreateUserModal } from '@/components/CreateUserModal';
import { ResetPasswordModal } from '@/components/ResetPasswordModal';
import { BulkResetPasswordModal } from '@/components/BulkResetPasswordModal';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpLegend } from '@/components/HelpButton';

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

function UserRow({
  user, selected, onToggleSelect, onSaved, canSelect,
}: {
  user: UserProfile;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSaved: () => void;
  canSelect: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Role governance: admin may only assign basic roles (executive/supervisor/
  // staff). Creating/changing admin or super_admin is super_admin-only and is
  // enforced server-side by the user_profiles role-change trigger + edge fn.
  const allowedRoles: UserRole[] = ['executive', 'supervisor', 'staff'];

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
    <tr className="border-b last:border-0 transition-colors"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: selected ? 'rgba(31,56,100,0.06)' : undefined,
        }}>
      <td className="px-3 py-3 w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(user.id)}
          disabled={!canSelect}
          title={canSelect ? 'เลือกสำหรับ bulk action' : 'ไม่สามารถเลือก super_admin ได้'}
          className="rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{user.email ?? '—'}</div>
            {user.full_name && (
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{user.full_name}</div>
            )}
          </div>
          {user.must_change_password && (
            <span
              title="ผู้ใช้นี้จะถูกบังคับให้เปลี่ยนรหัสผ่านในการ login ครั้งถัดไป"
              className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ backgroundColor: 'rgba(234,88,12,0.12)', color: '#9a3412' }}
            >
              <AlertTriangle size={10} /> รอเปลี่ยนรหัสผ่าน
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <select
            value={role}
            onChange={e => setRole(e.target.value as UserRole)}
            className="rounded-lg border px-2 py-1 text-sm"
            style={inputStyle}
          >
            {(allowedRoles.includes(user.role) ? allowedRoles : [user.role, ...allowedRoles]).map(r => (
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
            'px-2 py-0.5 rounded-full text-xs font-semibold ring-1',
            user.is_active
              ? 'bg-emerald-600 text-white ring-emerald-700/20 dark:bg-emerald-500'
              : 'bg-slate-500 text-white ring-slate-700/20 dark:bg-slate-600'
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
          onClose={() => { setShowReset(false); onSaved(); }}
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
  const [search, setSearch]         = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkReset, setShowBulkReset] = useState(false);
  /** Confirmation modal for bulk activate / deactivate: null = closed,
   *  otherwise the target is_active value about to be applied. */
  const [bulkActivate, setBulkActivate] = useState<boolean | null>(null);
  const [bulkSaving, setBulkSaving]   = useState(false);
  const [bulkResult, setBulkResult]   = useState<{ ok: number; failed: number } | null>(null);
  /** ids of selected rows (excludes super_admins which can't be bulk-edited by admin) */
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  const filtered = useMemo(() => users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  ), [users, search]);

  const canSelect = (u: UserProfile) => u.role !== 'super_admin';
  const selectableInView = filtered.filter(canSelect);
  const allSelected = selectableInView.length > 0 && selectableInView.every(u => selected.has(u.id));
  const someSelected = selectableInView.some(u => selected.has(u.id)) && !allSelected;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        selectableInView.forEach(u => next.delete(u.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        selectableInView.forEach(u => next.add(u.id));
        return next;
      });
    }
  };

  const selectedUsers = users.filter(u => selected.has(u.id));

  /** Activate or deactivate all selected (non-super_admin) users in bulk.
   *  Single UPDATE statement via the .in() filter — RLS already restricts
   *  admin to their own company so no per-user permission check needed. */
  const applyBulkActiveState = async (nextValue: boolean) => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const ids = Array.from(selected);
      const { error, count } = await supabase
        .from('user_profiles')
        .update({ is_active: nextValue }, { count: 'exact' })
        .in('id', ids)
        .neq('role', 'super_admin');  // defence-in-depth — RLS also blocks
      if (error) throw error;
      setBulkResult({ ok: count ?? ids.length, failed: ids.length - (count ?? ids.length) });
      qc.invalidateQueries({ queryKey: ['admin_users', company?.id] });
      setSelected(new Set());
    } catch (e: any) {
      setBulkResult({ ok: 0, failed: selected.size });
      // eslint-disable-next-line no-console
      console.error('[users] bulk activate failed:', e);
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={`จัดการผู้ใช้ภายใน ${company?.name ?? 'บริษัท'}`}
        helpTitle="User Management (จัดการผู้ใช้)"
        helpBody={(<>
          <HelpSection title="หน้านี้ทำอะไรได้">
            สร้าง / แก้ไข / Reset Password ผู้ใช้ภายในบริษัทของคุณ
          </HelpSection>
          <HelpSection title="Roles ที่ Admin สร้างได้">
            <HelpLegend items={[
              { color: '#1F3864', label: 'Admin',      meaning: 'จัดการระบบเต็มภายในบริษัท' },
              { color: '#D97706', label: 'Executive',  meaning: 'ผู้บริหาร ดูข้อมูลทั้งหมด แต่ไม่แก้ไข' },
              { color: '#16A34A', label: 'Supervisor', meaning: 'หัวหน้างาน — Import + ตั้ง Threshold' },
              { color: '#6B7280', label: 'Staff',      meaning: 'พนักงาน — ดู Dashboard / Stock / Alerts' },
            ]} />
          </HelpSection>
          <HelpSection title="ขั้นตอนสร้างผู้ใช้">
            <ol className="list-decimal ml-5 text-xs space-y-1">
              <li>กดปุ่ม "เพิ่มผู้ใช้งาน" มุมขวาบน</li>
              <li>กรอกชื่อ-นามสกุล + Email</li>
              <li>เลือก Role ที่ต้องการ</li>
              <li>กด "สร้างผู้ใช้" — ระบบจะสุ่มรหัสผ่านให้</li>
              <li>คัดลอก credentials ส่งให้ผู้ใช้นำไป login ครั้งแรก</li>
              <li><strong>ผู้ใช้ใหม่จะถูกบังคับให้เปลี่ยนรหัสผ่านในครั้งแรกที่ login</strong></li>
            </ol>
          </HelpSection>
          <HelpSection title="Bulk Actions (จัดการผู้ใช้แบบกลุ่ม)">
            <p className="text-xs mb-2">ติ๊ก checkbox หลายรายการ → toolbar สีน้ำเงินจะปรากฏ → เลือก action ที่ต้องการ:</p>
            <ul className="list-disc ml-5 text-xs space-y-1">
              <li><strong>🟢 Activate (N)</strong> — เปิดใช้งานผู้ใช้ที่เลือกทั้งหมดในคราวเดียว</li>
              <li><strong>🟠 Deactivate (N)</strong> — ระงับผู้ใช้ที่เลือกทั้งหมด (จะ logout ในรอบ session ถัดไป)</li>
              <li><strong>🔑 Reset Password (N)</strong> — สุ่มรหัสร่วม 1 ชุด · ทุกคนต้องเปลี่ยนรหัสตอน login ครั้งถัดไป</li>
            </ul>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              ใช้ได้กับทุก role (admin / supervisor / executive / staff) — super_admin ติ๊กไม่ได้
            </p>
          </HelpSection>
          <HelpSection title="Reset Password / Edit Role">
            กดไอคอน 🔑 = Reset Password เฉพาะคน, ปุ่ม "Edit" = แก้ Role + Active/Inactive
          </HelpSection>
          <HelpSection title="🔒 ข้อจำกัด">
            <ul className="list-disc ml-5 text-xs space-y-1">
              <li>Admin สร้าง super_admin ไม่ได้</li>
              <li>Admin reset password ของ super_admin ไม่ได้ (ทั้งเดี่ยวและกลุ่ม)</li>
              <li>การลบผู้ใช้ทำได้เฉพาะ Super Admin</li>
            </ul>
          </HelpSection>
        </>)}
        trailing={(
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
          >
            <UserPlus size={16} />
            เพิ่มผู้ใช้งาน
          </button>
        )}
      />
      <div className="mb-6" />

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

      {/* Bulk action toolbar — sticky-feel banner that appears when ≥1 row selected */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border"
             style={{
               backgroundColor: 'rgba(31,56,100,0.06)',
               borderColor: 'var(--color-primary)',
             }}>
          <KeyRound size={15} style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            เลือกแล้ว <strong>{selected.size}</strong> ผู้ใช้
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              onClick={() => setBulkActivate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: '#16a34a', color: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)' }}
              title="เปิดใช้งานผู้ใช้ที่เลือกทั้งหมด"
            >
              <UserCheck size={13} /> Activate ({selected.size})
            </button>
            <button
              onClick={() => setBulkActivate(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: '#94a3b8', color: '#475569', backgroundColor: 'rgba(148,163,184,0.10)' }}
              title="ระงับผู้ใช้ที่เลือกทั้งหมด"
            >
              <UserX size={13} /> Deactivate ({selected.size})
            </button>
            <button
              onClick={() => setShowBulkReset(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            >
              <KeyRound size={13} /> Reset Password ({selected.size})
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border hover:bg-[var(--bg-alt)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <X size={12} /> ล้าง
            </button>
          </div>
        </div>
      )}

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
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    title="เลือก / ยกเลิกการเลือกทั้งหมดในรายการที่เห็น (ยกเว้น super_admin)"
                    className="rounded cursor-pointer"
                  />
                </th>
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
                  selected={selected.has(u.id)}
                  onToggleSelect={toggleSelect}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['admin_users', company?.id] })}
                  canSelect={canSelect(u)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {filtered.length} / {users.length} users
        {selected.size > 0 && <> · เลือกแล้ว {selected.size}</>}
      </p>

      {showCreate && company && (
        <CreateUserModal
          fixedCompany={company}
          allowedRoles={['executive', 'supervisor', 'staff']}
          invalidateKeys={[['admin_users', company.id]]}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showBulkReset && (
        <BulkResetPasswordModal
          targets={selectedUsers.map(u => ({ id: u.id, email: u.email, full_name: u.full_name }))}
          onClose={() => setShowBulkReset(false)}
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ['admin_users', company?.id] });
            setSelected(new Set());
          }}
        />
      )}

      {/* ── Bulk activate / deactivate confirmation ───────────────────── */}
      {bulkActivate !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
               style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <ShieldAlert size={18} style={{ color: bulkActivate ? '#16a34a' : '#ea580c' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text)' }}>
                {bulkActivate ? 'ยืนยันการเปิดใช้งานผู้ใช้' : 'ยืนยันการระงับผู้ใช้'}
              </h2>
            </div>
            <div className="p-6 space-y-3">
              {bulkResult ? (
                <div className="px-3 py-3 rounded-lg text-sm leading-relaxed"
                     style={{
                       backgroundColor: bulkResult.failed === 0 ? 'rgba(22,163,74,0.10)' : 'rgba(234,88,12,0.10)',
                       borderLeft: `3px solid ${bulkResult.failed === 0 ? '#16a34a' : '#ea580c'}`,
                       color: bulkResult.failed === 0 ? '#15803d' : '#9a3412',
                     }}>
                  <p className="font-semibold mb-1">
                    {bulkActivate ? 'เปิดใช้งานสำเร็จ' : 'ระงับสำเร็จ'} {bulkResult.ok} ผู้ใช้
                  </p>
                  {bulkResult.failed > 0 && (
                    <p className="text-xs">ล้มเหลว {bulkResult.failed} ราย — ตรวจสอบใน console</p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>
                    {bulkActivate
                      ? <>กำลังจะ <strong>เปิดใช้งาน</strong> ผู้ใช้ <strong>{selected.size}</strong> ราย — ทุกคนจะกลับมาเข้าใช้ระบบได้</>
                      : <>กำลังจะ <strong>ระงับ</strong> ผู้ใช้ <strong>{selected.size}</strong> ราย — ทุกคนจะไม่สามารถเข้าใช้ระบบได้</>
                    }
                  </p>
                  <div className="rounded-lg border max-h-32 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                    <ul className="px-3 py-2 text-xs space-y-0.5">
                      {selectedUsers.slice(0, 8).map(u => (
                        <li key={u.id} className="flex items-center gap-2">
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', ROLE_COLORS[u.role])}>
                            {ROLE_LABELS[u.role]}
                          </span>
                          <span className="font-mono truncate" style={{ color: 'var(--text)' }}>{u.email}</span>
                        </li>
                      ))}
                      {selectedUsers.length > 8 && (
                        <li className="text-[11px]" style={{ color: 'var(--text-muted)' }}>… อีก {selectedUsers.length - 8} ราย</li>
                      )}
                    </ul>
                  </div>
                  {!bulkActivate && (
                    <p className="text-[11px] leading-relaxed px-3 py-2 rounded"
                       style={{ backgroundColor: 'rgba(234,88,12,0.08)', color: '#9a3412' }}>
                      ⚠ ผู้ใช้ที่ถูกระงับจะถูก redirect ไปหน้า "บัญชีถูกระงับ" ทันทีที่ session refresh —
                      session ปัจจุบันยังใช้ได้จนกว่าจะ expire
                    </p>
                  )}
                </>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setBulkActivate(null); setBulkResult(null); }}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  {bulkResult ? 'ปิด' : 'ยกเลิก'}
                </button>
                {!bulkResult && (
                  <button
                    onClick={() => applyBulkActiveState(bulkActivate)}
                    disabled={bulkSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: bulkActivate ? '#16a34a' : '#ea580c' }}
                  >
                    {bulkSaving && <Loader2 size={14} className="animate-spin" />}
                    {bulkSaving ? 'กำลังบันทึก…' : (bulkActivate ? `Activate ${selected.size} ผู้ใช้` : `Deactivate ${selected.size} ผู้ใช้`)}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
