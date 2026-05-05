import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function initSupabase(): SupabaseClient {
  if (!supabaseUrl || supabaseUrl === 'your-supabase-url-here' || !supabaseAnonKey || supabaseAnonKey === 'your-supabase-anon-key-here') {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
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
  const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
  if (error) {
    // Edge Function returned non-2xx — try to surface the structured error message
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail || error.message || 'Edge function call failed');
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}
