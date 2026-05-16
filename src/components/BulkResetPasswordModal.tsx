import { useState } from 'react';
import { X, Loader2, KeyRound, Eye, EyeOff, RefreshCw, Copy, Check, ShieldAlert, Users } from 'lucide-react';
import { invokeAdminUsers } from '@/lib/supabase';

interface Props {
  /** List of users that will receive the new shared password. */
  targets: { id: string; email: string | null; full_name: string | null }[];
  onClose:    () => void;
  /** Optional callback fired after a successful bulk reset (for invalidation). */
  onComplete?: () => void;
}

function generatePassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Multi-user password reset.
 *
 * Sets the SAME new password for every selected user, and flips their
 * must_change_password flag so they are forced to pick their own
 * password on next login. The shared password is shown once to the
 * admin to communicate out-of-band.
 */
export function BulkResetPasswordModal({ targets, onClose, onComplete }: Props) {
  const [password, setPassword] = useState(generatePassword());
  const [show,     setShow]     = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [result,   setResult]   = useState<{ success: number; failed: { id: string; error?: string }[] } | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleReset = async () => {
    if (password.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    if (targets.length === 0) { setError('ไม่มีผู้ใช้ที่เลือก'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await invokeAdminUsers<{
        ok: boolean; success: number; failed_count: number;
        failed: { id: string; error?: string }[];
      }>({
        action:   'bulk-reset-password',
        user_ids: targets.map(t => t.id),
        password,
      });
      setResult({ success: res.success ?? 0, failed: res.failed ?? [] });
      onComplete?.();
    } catch (e: any) {
      setError(e?.message ?? 'Reset แบบกลุ่มไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
           style={{ backgroundColor: 'var(--bg-card)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-[var(--color-primary)]" />
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>
              Reset Password แบบกลุ่ม
            </h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">

          {result ? (
            /* ─────────────── Success result ─────────────── */
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg"
                   style={{ backgroundColor: 'rgba(22,163,74,0.10)', borderLeft: '3px solid #16a34a' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#16a34a' }}>
                  <Check size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm" style={{ color: '#15803d' }}>
                    Reset สำเร็จ {result.success} / {targets.length} ผู้ใช้
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    ผู้ใช้ทุกคนจะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งถัดไป
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  รหัสผ่านชั่วคราว (แจ้งผู้ใช้แบบส่วนตัว)
                </p>
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                     style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <span className="text-sm font-mono font-bold tracking-wider truncate"
                        style={{ color: 'var(--text)' }}>{password}</span>
                  <button
                    onClick={handleCopy}
                    className="px-2 py-1 rounded text-xs border transition-colors hover:bg-[var(--bg)]"
                    style={{ borderColor: 'var(--border)', color: copied ? '#16a34a' : 'var(--text-muted)' }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              {result.failed.length > 0 && (
                <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: '#991b1b' }}>
                    ไม่สำเร็จ {result.failed.length} ราย:
                  </p>
                  <ul className="text-[11px] space-y-0.5" style={{ color: '#991b1b' }}>
                    {result.failed.slice(0, 5).map(f => (
                      <li key={f.id} className="font-mono truncate">
                        {f.id.slice(0, 8)}… — {f.error ?? 'unknown error'}
                      </li>
                    ))}
                    {result.failed.length > 5 && <li>… อีก {result.failed.length - 5} ราย</li>}
                  </ul>
                </div>
              )}

              <button onClick={onClose}
                      className="w-full py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                ปิด
              </button>
            </>
          ) : (
            /* ─────────────── Form ─────────────── */
            <>
              {/* Selected user list */}
              <div className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <div className="px-3 py-2 border-b flex items-center gap-2"
                     style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                  <Users size={13} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                    ผู้ใช้ที่เลือก ({targets.length} ราย)
                  </span>
                </div>
                <ul className="max-h-32 overflow-y-auto px-3 py-2 text-xs space-y-1">
                  {targets.slice(0, 8).map(t => (
                    <li key={t.id} className="flex items-center gap-2">
                      <span className="font-mono truncate" style={{ color: 'var(--text)' }}>
                        {t.email ?? t.id}
                      </span>
                      {t.full_name && (
                        <span className="truncate" style={{ color: 'var(--text-muted)' }}>· {t.full_name}</span>
                      )}
                    </li>
                  ))}
                  {targets.length > 8 && (
                    <li style={{ color: 'var(--text-muted)' }}>… อีก {targets.length - 8} ราย</li>
                  )}
                </ul>
              </div>

              {/* New shared password */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                  รหัสผ่านใหม่ (ใช้ร่วมกันชั่วคราว) *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={show ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShow(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPassword(generatePassword())}
                    className="px-2.5 rounded-lg border transition-colors hover:bg-[var(--bg-alt)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    title="สร้างรหัสผ่านใหม่"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 rounded-lg border transition-colors hover:bg-[var(--bg-alt)]"
                    style={{ borderColor: 'var(--border)', color: copied ? '#16a34a' : 'var(--text-muted)' }}
                    title="Copy"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  อย่างน้อย 8 ตัวอักษร — แนะนำให้สุ่มและส่งให้ผู้ใช้แบบส่วนตัว
                </p>
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                   style={{ backgroundColor: 'rgba(234,88,12,0.08)', borderLeft: '3px solid #ea580c' }}>
                <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#ea580c' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#9a3412' }}>
                  ผู้ใช้ทั้ง <strong>{targets.length}</strong> รายจะถูก reset เป็นรหัสผ่านชั่วคราวนี้ ·
                  ทุกคนต้องเปลี่ยนรหัสผ่านของตัวเองทันทีที่ login ครั้งถัดไป ·
                  Session เดิมของผู้ใช้ที่กำลัง login อยู่จะหมดอายุภายในเวลาไม่นาน
                </p>
              </div>

              {error && (
                <p className="text-xs px-2.5 py-2 rounded-lg"
                   style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
                  {error}
                </p>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving || targets.length === 0 || password.length < 8}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'กำลัง Reset…' : `Reset ${targets.length} ผู้ใช้`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
