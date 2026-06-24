import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** Flag (in localStorage) recording whether the user ticked "remember device". */
const REMEMBER_KEY = 'si-remember-device';

export function setRememberDevice(remember: boolean) {
  try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Hybrid auth-token storage:
 *  - "remember device" ON  → localStorage (survives browser close)
 *  - "remember device" OFF → sessionStorage (survives REFRESH, cleared on tab close)
 *
 * Reads check sessionStorage first then localStorage, so a refresh always finds
 * the token regardless of which store holds it. This fixes the previous bug
 * where a `beforeunload` handler wiped the token on every refresh.
 */
const hybridAuthStorage = {
  getItem: (key: string): string | null => {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
    catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try {
      const remember = localStorage.getItem(REMEMBER_KEY) === '1';
      if (remember) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch { /* ignore storage errors (private mode etc.) */ }
  },
  removeItem: (key: string): void => {
    try { sessionStorage.removeItem(key); localStorage.removeItem(key); }
    catch { /* ignore */ }
  },
};

function initSupabase(): SupabaseClient {
  if (!supabaseUrl || supabaseUrl === 'your-supabase-url-here' || !supabaseAnonKey || supabaseAnonKey === 'your-supabase-anon-key-here') {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: hybridAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = initSupabase();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl) && supabaseUrl !== 'your-supabase-url-here' && Boolean(supabaseAnonKey) && supabaseAnonKey !== 'your-supabase-anon-key-here';
}

/**
 * Invoke privileged user-management actions via the `admin-users` Edge Function.
 * Service role stays on the server — caller's JWT is verified inside the function.
 */
export async function invokeAdminUsers<T = { ok: true; user_id?: string }>(
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: payload,
      signal: controller.signal as AbortSignal,
    });
    clearTimeout(timer);

    if (error) {
      const detail = (data as { error?: string } | null)?.error;
      throw new Error(detail || error.message || 'Edge function call failed');
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String((data as { error: string }).error));
    }
    return data as T;
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('การเชื่อมต่อหมดเวลา (30 วินาที) — กรุณาลองใหม่อีกครั้ง');
    }
    throw e;
  }
}
