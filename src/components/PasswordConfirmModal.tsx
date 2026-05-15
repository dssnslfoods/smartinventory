import { useState } from 'react';
import { X, AlertTriangle, Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  /** Title shown at the top of the modal */
  title: string;
  /** Plain explanation of what's about to happen */
  message: string;
  /** Lines of consequence — rendered as warning bullets */
  consequences?: string[];
  /** Text the user must type verbatim to enable the confirm button (optional). */
  typeToConfirm?: string;
  /** Label of the destructive confirm button (default: "ดำเนินการ") */
  confirmLabel?: string;
  /** Called after the password is verified — caller does the destructive work */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/**
 * Confirms a destructive action by re-verifying the current admin's password.
 * Used as a guard rail around Clear-All-Data and similar.
 */
export function PasswordConfirmModal({
  title, message, consequences = [], typeToConfirm,
  confirmLabel = 'ดำเนินการ',
  onConfirm, onClose,
}: Props) {
  const { user } = useAuthStore();
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    password.length >= 1 &&
    !busy &&
    (!typeToConfirm || typed === typeToConfirm);

  const handleSubmit = async () => {
    if (!user?.email) { setError('ไม่พบ email ของคุณ — กรุณา login ใหม่'); return; }
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      // Re-verify the admin's password before letting them through. signInWithPassword
      // refreshes the session if successful which is fine — they're already signed in.
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authErr) {
        setError('รหัสผ่านไม่ถูกต้อง');
        setBusy(false);
        return;
      }
      await onConfirm();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-xl shadow-2xl w-full max-w-md" style={{ backgroundColor: 'var(--bg-card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-red-600">
            <ShieldAlert size={20} />
            <h2 className="font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} disabled={busy} style={{ color: 'var(--text-muted)' }} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Warning banner */}
          <div className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/15 dark:border-red-900">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
            <div className="text-sm">
              <p className="font-medium text-red-700 dark:text-red-300">{message}</p>
              {consequences.length > 0 && (
                <ul className="mt-2 list-disc ml-5 text-xs text-red-700/90 dark:text-red-300/80 space-y-0.5">
                  {consequences.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>
          </div>

          {/* Type-to-confirm */}
          {typeToConfirm && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                พิมพ์ <code className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text)' }}>{typeToConfirm}</code> เพื่อยืนยัน
              </label>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                disabled={busy}
                autoFocus
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
          )}

          {/* Password — always required */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              รหัสผ่านของคุณ ({user?.email ?? 'admin'})
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                disabled={busy}
                autoFocus={!typeToConfirm}
                className="w-full px-3 py-2 pr-10 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
                aria-label={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-end gap-2 rounded-b-xl"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt, #f8fafc)' }}>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? 'กำลังตรวจสอบ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
