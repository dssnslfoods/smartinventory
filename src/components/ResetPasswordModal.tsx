import { useState } from 'react';
import { X, Loader2, KeyRound, Eye, EyeOff, RefreshCw, Copy, Check } from 'lucide-react';
import { adminSupabase, supabase } from '@/lib/supabase';

interface Props {
  /** 'admin' = reset another user (uses service role) | 'self' = reset own password */
  mode: 'admin' | 'self';
  /** Required when mode='admin' */
  targetUserId?: string;
  targetEmail?: string;
  onClose: () => void;
}

function generatePassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function ResetPasswordModal({ mode, targetUserId, targetEmail, onClose }: Props) {
  const [password, setPassword]   = useState(generatePassword());
  const [showPwd,  setShowPwd]    = useState(false);
  const [saving,   setSaving]     = useState(false);
  const [error,    setError]      = useState('');
  const [done,     setDone]       = useState(false);
  const [copied,   setCopied]     = useState(false);

  const inputStyle = { backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' };

  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleReset = async () => {
    if (password.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    setSaving(true);
    setError('');
    try {
      if (mode === 'admin') {
        if (!targetUserId) throw new Error('ไม่พบ User ID');
        const { error: err } = await adminSupabase.auth.admin.updateUserById(targetUserId, { password });
        if (err) throw new Error(err.message);
      } else {
        // self-reset uses current session
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw new Error(err.message);
      }
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Reset ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-sm" style={{ backgroundColor: 'var(--bg-card)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-[var(--color-primary)]" />
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>
              {mode === 'self' ? 'เปลี่ยนรหัสผ่านของฉัน' : 'Reset รหัสผ่าน'}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">

          {/* Target info (admin mode) */}
          {mode === 'admin' && targetEmail && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
              <KeyRound size={14} />
              <span className="font-mono">{targetEmail}</span>
            </div>
          )}

          {done ? (
            /* Success */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <Check size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm text-green-700 dark:text-green-400">Reset สำเร็จ!</p>
                  {mode === 'self'
                    ? <p className="text-xs text-green-600 dark:text-green-500">รหัสผ่านของคุณถูกเปลี่ยนแล้ว</p>
                    : <p className="text-xs text-green-600 dark:text-green-500">แจ้ง credentials ให้ผู้ใช้นำไป login</p>
                  }
                </div>
              </div>

              {mode === 'admin' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Email</span>
                    <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{targetEmail}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>New Password</span>
                    <span className="text-sm font-mono font-bold tracking-wider" style={{ color: 'var(--text)' }}>{password}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                * แนะนำให้เปลี่ยนรหัสผ่านอีกครั้งหลัง login
              </p>
              <button onClick={onClose} className="w-full py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white">
                ปิด
              </button>
            </div>

          ) : (
            /* Form */
            <>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                  {mode === 'self' ? 'รหัสผ่านใหม่' : 'รหัสผ่านใหม่'} *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm pr-10"
                      style={inputStyle}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
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
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>อย่างน้อย 8 ตัวอักษร</p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

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
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'กำลัง Reset…' : 'Reset รหัสผ่าน'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
