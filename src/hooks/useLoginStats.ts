/**
 * Pre-auth public stats for the login page ticker.
 *
 * Calls the Postgres SECURITY DEFINER function `get_login_public_stats()`
 * which returns only safe aggregates — no row-level data, no prices,
 * no customer-specific information.
 *
 * Falls back gracefully (returns null) if the call fails so the login
 * page still renders with mock values.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface LoginPublicStats {
  warehouse_count:    number;
  group_count:        number;
  active_sku_count:   number;
  total_sku_count:    number;
  lot_count:          number;
  tx_count:           number;
  tx_last_30d:        number;
  expired_lots:       number;
  lots_expiring_30d:  number;
  last_master_update: string | null;
  last_tx_date:       string | null;
  last_snapshot_date: string | null;
  group_codes:        string[] | null;
  server_time:        string;
}

export function useLoginStats() {
  return useQuery<LoginPublicStats | null>({
    queryKey: ['loginPublicStats'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_login_public_stats');
        if (error) {
          console.warn('[useLoginStats] RPC error:', error.message);
          return null;
        }
        // Function returns a SETOF (single row) — take first
        const row = Array.isArray(data) ? data[0] : data;
        return (row as LoginPublicStats) ?? null;
      } catch (err) {
        console.warn('[useLoginStats] threw:', err);
        return null;
      }
    },
    // Stats change slowly — cache aggressively to avoid hammering on a public page
    staleTime: 5 * 60 * 1000,        // 5 minutes
    gcTime:    30 * 60 * 1000,       // 30 minutes
    retry:     1,                     // 1 retry then fallback
    refetchOnWindowFocus: false,      // ticker doesn't need to live-refresh
  });
}
