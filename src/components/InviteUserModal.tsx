import { useState } from 'react';
import { X, Loader2, Mail, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Company, UserRole } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';

interface Props {
  /** Pre-fill and lock company (for admin role — their own company) */
  fixedCompany?: Company;
  /** Available companies to pick from (for super_admin) */
  companies?: Pick<Company, 'id' | 'name'>[];
  /** Roles the inviter is allowed to assign */
  allowedRoles: Exclude<UserRole, 'super_admin'>[];
  /** Query keys to invalidate after success */
  invalidateKeys?: string[][];
  onClose: () => void;
}

export function InviteUserModal({ fixedCompany, companies = [], allowedRoles, invalidateKeys = [], onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [email, setEmail]         = useState('');
  const [role, setRole]           = useState<Exclude<UserRole, 'super_admin'>>(allowedRoles[0]);
  const [companyId, setCompanyId] = useState(fixedCompany?.id ?? '');
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  const handleSubmit = async () => {
    if (!email.trim())   { setError('กรุณากรอก Email'); return; }
    if (!companyId)      { setError('กรุณาเลือกบริษัท'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('รูปแบบ Email ไม่ถูกต้อง');
      return;
    }

    setSaving(true);
    setError('');

    const { error: e } = await supabase.from('user_invitations').insert({
      email:      email.trim().toLowerCase(),
      role,
      company_id: companyId,
      invited_by: user?.id ?? null,
      note:       note.trim() || null,
    });

    setSaving(false);

    if (e) {
      setError(e.message);
      return;
    }

    invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
    setDone(true);
  };

  const inputCls  = 'w-full px-3 py-2 rounded-lg border text-sm';
  const inputStyle = { backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' };

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

        {done ? (
          /* Success state */
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Mail size={24} className="text-green-500" />
            </div>
            <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>สร้าง Invitation สำเร็จ!</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              ให้ผู้ใช้ <strong>{email}</strong> ทำการ Signup ที่หน้า Login
              ระบบจะกำหนด role <strong>{ROLE_LABELS[role]}</strong> ให้อัตโนมัติ
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
            >
              ปิด
            </button>
          </div>
        ) : (
          /* Form */
          <div className="p-6 space-y-4">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="user@company.com"
                className={inputCls}
                style={inputStyle}
                autoFocus
              />
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

            {/* Company — fixed for admin, selectable for super_admin */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                บริษัท *
              </label>
              {fixedCompany ? (
                <div
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ ...inputStyle, opacity: 0.7 }}
                >
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

            {/* Note (optional) */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                หมายเหตุ (ไม่บังคับ)
              </label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="เช่น ผู้จัดการฝ่ายคลังสินค้า"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {/* Info */}
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}
            >
              <Mail size={13} className="mt-0.5 shrink-0" />
              <span>
                ระบบจะสร้าง Invitation ไว้ใน DB (มีอายุ 30 วัน)
                เมื่อผู้ใช้ Signup ด้วย email นี้ จะได้รับ role และบริษัทที่กำหนดโดยอัตโนมัติ
              </span>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'กำลังสร้าง…' : 'สร้าง Invitation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
