import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, ShieldAlert, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/**
 * Fullscreen blocker that appears when the current user's profile has
 * must_change_password = TRUE. Sits between the auth guard and AppLayout
 * so no part of the app is reachable until the user picks a new password.
 *
 * Flow:
 *   1. Admin creates / resets the user → must_change_password = true
 *   2. User logs in with the admin-issued password
 *   3. This component renders fullscreen, blocks every route
 *   4. User picks a new password → supabase.auth.updateUser({ password })
 *   5. RPC clear_must_change_password() flips the flag on user_profiles
 *   6. loadProfile() re-runs → modal disappears, app unlocks
 */
export function ForcedPasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { profile, markPasswordChanged, signOut } = useAuthStore();
  const [pwd1, setPwd1]     = useState('');
  const [pwd2, setPwd2]     = useState('');
  const [show, setShow]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // No profile yet, or profile doesn't require change — render the app normally
  if (!profile || !profile.must_change_password) return <>{children}</>;

  // Light strength check: ≥ 8 chars, at least one letter + one digit
  const lengthOK   = pwd1.length >= 8;
  const hasLetter  = /[A-Za-z]/.test(pwd1);
  const hasDigit   = /\d/.test(pwd1);
  const matches    = pwd1 === pwd2 && pwd2.length > 0;
  const formValid  = lengthOK && hasLetter && hasDigit && matches;

  const handleSubmit = async () => {
    if (!formValid) {
      setError('รหัสผ่านยังไม่ผ่านเกณฑ์ — ตรวจสอบเงื่อนไขด้านล่าง');
      return;
    }
    setSaving(true);
    setError('');

    // Watchdog — if we somehow get stuck for over 20 s, give the user a way out.
    const watchdog = window.setTimeout(() => {
      setError('การบันทึกใช้เวลานานผิดปกติ — ลองอีกครั้ง หรือ refresh หน้าเว็บ');
      setSaving(false);
    }, 20_000);

    try {
      // 1. Update auth password (Supabase enforces JWT for this — only self)
      const { error: authErr } = await supabase.auth.updateUser({ password: pwd1 });
      if (authErr) throw new Error(authErr.message);

      // 2. Clear the must_change_password flag in the profile row
      const { error: rpcErr } = await supabase.rpc('clear_must_change_password');
      if (rpcErr) throw new Error(rpcErr.message);

      // 3. Optimistically unmount the gate. We deliberately do NOT await a
      //    full loadProfile() round-trip here:
      //
      //    - supabase.auth.updateUser fires USER_UPDATED → the auth listener
      //      in authStore.initialize() starts its own loadProfile in parallel.
      //    - If we then await another loadProfile, both round-trips block the
      //      submit button. On a slow network this looks like the app hung.
      //    - markPasswordChanged() flips the local profile flag immediately
      //      (gate unmounts) AND sets pwdClearedAt so the listener's stale
      //      read (must_change_password=true, captured before the RPC) gets
      //      ignored in loadProfile().
      window.clearTimeout(watchdog);
      markPasswordChanged();
      // No setSaving(false) — this component is about to unmount.
    } catch (e: any) {
      window.clearTimeout(watchdog);
      setError(e?.message ?? 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      setSaving(false);
    }
  };

  const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-center gap-1.5 text-xs"
        style={{ color: ok ? '#16a34a' : 'var(--text-muted)' }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ok ? '#16a34a' : 'var(--text-muted)' }} />
      {children}
    </li>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(15,23,42,0.85)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
           style={{ backgroundColor: 'var(--bg-card)' }}>
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-start gap-3"
             style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(220,38,38,0.06)' }}>
          <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(220,38,38,0.12)' }}>
            <ShieldAlert size={20} style={{ color: '#dc2626' }} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
              ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน
            </h2>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              รหัสผ่านปัจจุบันถูกตั้งโดยผู้ดูแลระบบ —
              เพื่อความปลอดภัย กรุณากำหนดรหัสผ่านใหม่ของคุณก่อนเข้าสู่ระบบ
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
               style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            <KeyRound size={13} />
            <span className="font-mono truncate">{profile.email ?? '—'}</span>
          </div>

          {/* New password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              รหัสผ่านใหม่ *
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd1}
                onChange={e => setPwd1(e.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className="w-full px-3 py-2 pr-10 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              ยืนยันรหัสผ่าน *
            </label>
            <input
              type={show ? 'text' : 'password'}
              value={pwd2}
              onChange={e => setPwd2(e.target.value)}
              placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              onKeyDown={e => { if (e.key === 'Enter' && formValid && !saving) handleSubmit(); }}
            />
          </div>

          {/* Live checklist */}
          <ul className="space-y-1 px-2 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
            <Check ok={lengthOK}>มีอย่างน้อย 8 ตัวอักษร</Check>
            <Check ok={hasLetter}>มีตัวอักษร (a-z / A-Z)</Check>
            <Check ok={hasDigit}>มีตัวเลข (0-9)</Check>
            <Check ok={matches}>รหัสผ่านทั้งสองช่องตรงกัน</Check>
          </ul>

          {error && (
            <p className="text-xs px-2.5 py-2 rounded-lg"
               style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!formValid || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่และเข้าสู่ระบบ'}
          </button>

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border transition-colors hover:bg-[var(--bg-alt)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <LogOut size={12} />
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
