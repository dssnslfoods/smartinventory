import { useState } from 'react';
import { X, Loader2, UserPlus, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { adminSupabase, supabase } from '@/lib/supabase';
import type { Company, UserRole } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';

interface Props {
  /** Pre-fill and lock company (admin role — their own company) */
  fixedCompany?: Company;
  /** Companies to pick from (super_admin) */
  companies?: Pick<Company, 'id' | 'name'>[];
  /** Roles the creator is allowed to assign */
  allowedRoles: Exclude<UserRole, 'super_admin'>[];
  /** TanStack Query keys to invalidate on success */
  invalidateKeys?: string[][];
  onClose: () => void;
}

function generatePassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function CreateUserModal({ fixedCompany, companies = [], allowedRoles, invalidateKeys = [], onClose }: Props) {
  const qc = useQueryClient();

  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState(generatePassword());
  const [showPwd,    setShowPwd]    = useState(false);
  const [role,       setRole]       = useState<Exclude<UserRole, 'super_admin'>>(allowedRoles[0]);
  const [companyId,  setCompanyId]  = useState(fixedCompany?.id ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [created,    setCreated]    = useState<{ email: string; password: string } | null>(null);

  const inputCls   = 'w-full px-3 py-2 rounded-lg border text-sm';
  const inputStyle = { backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' };

  const handleCreate = async () => {
    if (!fullName.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return; }
    if (!email.trim())    { setError('กรุณากรอก Email'); return; }
    if (!companyId)       { setError('กรุณาเลือกบริษัท'); return; }
    if (password.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('รูปแบบ Email ไม่ถูกต้อง'); return; }

    setSaving(true);
    setError('');

    try {
      // 1. Create auth user (service role — skips email confirmation)
      const { data: authData, error: authErr } = await adminSupabase.auth.admin.createUser({
        email:            email.trim().toLowerCase(),
        password,
        email_confirm:    true,
        user_metadata:    { full_name: fullName.trim() },
      });

      if (authErr) throw new Error(authErr.message);

      const userId = authData.user.id;

      // 2. Upsert profile with correct role + company
      //    (handle_new_user trigger may have already created it with defaults)
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id:         userId,
            role,
            company_id: companyId,
            full_name:  fullName.trim(),
            email:      email.trim().toLowerCase(),
            is_active:  true,
          },
          { onConflict: 'id' }
        );

      if (profileErr) throw new Error(profileErr.message);

      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
      setCreated({ email: email.trim(), password });

    } catch (e: any) {
      setError(e.message ?? 'สร้างผู้ใช้ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-md" style={{ backgroundColor: 'var(--bg-card)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-[var(--color-primary)]" />
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>เพิ่มผู้ใช้งาน</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {created ? (
          /* Success — show credentials */
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <UserPlus size={16} className="text-white" />
              </div>
              <div>
                <p className="font-medium text-sm text-green-700 dark:text-green-400">สร้างผู้ใช้สำเร็จ!</p>
                <p className="text-xs text-green-600 dark:text-green-500">แจ้ง credentials ให้ผู้ใช้นำไป login</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Email</span>
                <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{created.email}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Password</span>
                <span className="text-sm font-mono font-bold tracking-widest" style={{ color: 'var(--text)' }}>{created.password}</span>
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              * แนะนำให้ผู้ใช้เปลี่ยนรหัสผ่านหลัง login ครั้งแรก
            </p>

            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
            >
              ปิด
            </button>
          </div>

        ) : (
          /* Form */
          <div className="p-6 space-y-4">

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                ชื่อ-นามสกุล *
              </label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="ชื่อ นามสกุล"
                className={inputCls}
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@company.com"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                รหัสผ่าน *
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={inputCls + ' pr-10'}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="px-3 rounded-lg border transition-colors hover:bg-[var(--bg-alt)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  title="สร้างรหัสผ่านใหม่"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Role *
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Exclude<UserRole, 'super_admin'>)}
                className={inputCls}
                style={inputStyle}
              >
                {allowedRoles.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                บริษัท *
              </label>
              {fixedCompany ? (
                <div className={inputCls} style={{ ...inputStyle, opacity: 0.7 }}>
                  {fixedCompany.name}
                </div>
              ) : (
                <select
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="">— เลือกบริษัท —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'กำลังสร้าง…' : 'สร้างผู้ใช้'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
