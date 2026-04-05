import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl        = import.meta.env.VITE_SUPABASE_URL             || '';
const supabaseAnonKey    = import.meta.env.VITE_SUPABASE_ANON_KEY        || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

function initSupabase(): SupabaseClient {
  if (!supabaseUrl || supabaseUrl === 'your-supabase-url-here' || !supabaseAnonKey || supabaseAnonKey === 'your-supabase-anon-key-here') {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/** Admin client — bypasses RLS. Use only in super_admin / admin pages. */
function initAdminSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabase      = initSupabase();
export const adminSupabase = initAdminSupabase();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl) && supabaseUrl !== 'your-supabase-url-here' && Boolean(supabaseAnonKey) && supabaseAnonKey !== 'your-supabase-anon-key-here';
}
