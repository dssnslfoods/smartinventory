/**
 * Audit log helper — records destructive admin actions with full context.
 *
 * What we capture:
 *   - user_id / user_email / user_role  (from auth)
 *   - action                            (caller-supplied string)
 *   - resource                          (what was acted on)
 *   - ip_address                        (best-effort from public IP service)
 *   - user_agent                        (browser UA)
 *   - payload                           (free-form JSON context)
 *   - status / error_message            (success/failure)
 *
 * Why no MAC address: browsers do NOT expose MAC addresses to JS for
 * privacy/security reasons. We capture User-Agent + IP + authenticated
 * user identity instead, which is more reliable for accountability anyway
 * (MACs can be spoofed; signed JWTs can't easily).
 */

import { supabase } from '@/lib/supabase';

export type AuditAction =
  | 'CLEAR_ALL_DATA'
  | 'CLEAR_ALL_DATA_FROM_SETTINGS'
  | 'CLEAR_ALL_DATA_FROM_IMPORT'
  | 'DELETE_USER'
  | 'RESET_USER_PASSWORD'
  | 'CHANGE_USER_ROLE'
  | 'IMPORT_DATA'
  | 'BULK_DELETE';

interface RecordAuditOptions {
  action: AuditAction;
  resource?: string;
  payload?: Record<string, unknown>;
  status?: 'success' | 'failed';
  error_message?: string;
}

// Cache the public IP for the session so we don't hit the IP service on every event.
let cachedIp: string | null = null;
let ipFetchAttempted = false;

async function getClientIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  if (ipFetchAttempted) return null;
  ipFetchAttempted = true;

  // Best-effort: ipify is free, no API key. Falls back gracefully if blocked.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    cachedIp = data.ip ?? null;
    return cachedIp;
  } catch {
    return null;
  }
}

/**
 * Record an audit event. Fire-and-forget: never throws — audit logging
 * must not break the user's primary action.
 */
export async function recordAudit(opts: RecordAuditOptions): Promise<void> {
  try {
    // Pull authenticated user info
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[audit] cannot record — no authenticated user');
      return;
    }

    // Get role from profile (denormalized at the time of the action)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    // Best-effort IP fetch (may be null if blocked / offline)
    const ip = await getClientIp();

    const row = {
      user_id:       user.id,
      user_email:    user.email ?? '(unknown)',
      user_role:     profile?.role ?? null,
      action:        opts.action,
      resource:      opts.resource ?? null,
      ip_address:    ip,
      user_agent:    typeof navigator !== 'undefined' ? navigator.userAgent : null,
      payload:       opts.payload ?? null,
      status:        opts.status ?? 'success',
      error_message: opts.error_message ?? null,
      company_id:    profile?.company_id ?? null,
    };

    const { error } = await supabase.from('audit_log').insert(row);
    if (error) {
      console.error('[audit] insert failed:', error);
    }
  } catch (err) {
    console.error('[audit] recordAudit threw:', err);
  }
}
