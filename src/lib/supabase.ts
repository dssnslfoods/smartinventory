import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function initSupabase(): SupabaseClient {
  if (!supabaseUrl || supabaseUrl === 'your-supabase-url-here' || !supabaseAnonKey || supabaseAnonKey === 'your-supabase-anon-key-here') {
    // Return a dummy client that won't crash but won't work either
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = initSupabase();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl) && supabaseUrl !== 'your-supabase-url-here' && Boolean(supabaseAnonKey) && supabaseAnonKey !== 'your-supabase-anon-key-here';
}
