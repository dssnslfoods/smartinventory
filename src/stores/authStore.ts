import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { UserProfile, Company, PermissionKey } from '@/types/auth';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@/types/auth';

interface AuthState {
  user:        User | null;
  session:     Session | null;
  profile:     UserProfile | null;
  company:     Company | null;
  permissions: Set<string>;
  loading:     boolean;
  /** Timestamp (ms) at which the current user successfully cleared their
   *  must_change_password flag. Used to suppress stale reads from a
   *  concurrent loadProfile() that started before the RPC committed. */
  pwdClearedAt: number | null;

  setUser:     (user: User | null) => void;
  setSession:  (session: Session | null) => void;
  setLoading:  (loading: boolean) => void;

  signIn:      (email: string, password: string) => Promise<{ error: string | null }>;
  signOut:     () => Promise<void>;
  initialize:  () => Promise<void>;
  loadProfile: (userId: string) => Promise<void>;
  /** Optimistically flip must_change_password=false locally and remember
   *  the timestamp so any in-flight loadProfile() reading stale data
   *  won't re-flip it back to true. */
  markPasswordChanged: () => void;
  hasPermission: (key: PermissionKey) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:         null,
  session:      null,
  profile:      null,
  company:      null,
  permissions:  new Set(),
  loading:      true,
  pwdClearedAt: null,

  setUser:    (user)    => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),

  /** See type doc — used by ForcedPasswordChangeGate after a successful
   *  password update + clear_must_change_password() RPC. */
  markPasswordChanged: () => {
    set(state => ({
      pwdClearedAt: Date.now(),
      profile: state.profile
        ? { ...state.profile, must_change_password: false }
        : null,
    }));
  },

  hasPermission: (key: PermissionKey) => {
    const { profile, permissions } = get();
    if (!profile) return false;
    // super_admin bypasses all checks
    if (profile.role === 'super_admin') return true;
    // admin and lower: check permissions set (which already respects company_features)
    return permissions.has(key);
  },

  loadProfile: async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, company:companies(*)')
        .eq('id', userId)
        .single();

      if (!profile) {
        set({ profile: null, company: null, permissions: new Set() });
        return;
      }

      // ── Stale-read guard ──────────────────────────────────────────────────
      // If the user just cleared their must_change_password flag locally (via
      // markPasswordChanged within the last 60 s), don't let a stale DB read
      // from a concurrent loadProfile() flip it back to TRUE — the actual row
      // is or is about to be FALSE, but a SELECT that started before the RPC
      // committed will return the old value.
      const { pwdClearedAt } = get();
      if (
        pwdClearedAt &&
        Date.now() - pwdClearedAt < 60_000 &&
        profile.must_change_password
      ) {
        profile.must_change_password = false;
      }

      const company = (profile.company as Company) ?? null;
      const permSet = new Set<string>();

      if (profile.role !== 'super_admin' && profile.company_id) {
        // 1. Load company_features (super_admin controls which features are on/off per company)
        const { data: features } = await supabase
          .from('company_features')
          .select('feature_key, is_enabled')
          .eq('company_id', profile.company_id);

        const disabledFeatures = new Set(
          features?.filter(f => !f.is_enabled).map(f => f.feature_key) ?? []
        );

        if (profile.role === 'admin') {
          // admin gets all permissions EXCEPT those disabled by super_admin
          Object.values(PERMISSIONS)
            .filter(p => !disabledFeatures.has(p))
            .forEach(p => permSet.add(p));
        } else {
          // executive / supervisor / staff: role permissions + company_features filter
          const { data: rolePerms } = await supabase
            .from('role_permissions')
            .select('permission_key, is_enabled')
            .eq('company_id', profile.company_id)
            .eq('role', profile.role);

          const roleKey = profile.role as 'executive' | 'supervisor' | 'staff';

          if (rolePerms && rolePerms.length > 0) {
            rolePerms
              .filter(p => p.is_enabled && !disabledFeatures.has(p.permission_key))
              .forEach(p => permSet.add(p.permission_key));
          } else {
            (DEFAULT_ROLE_PERMISSIONS[roleKey] ?? [])
              .filter(p => !disabledFeatures.has(p))
              .forEach(p => permSet.add(p));
          }
        }
      }

      set({ profile: { ...profile, company: company ?? undefined }, company, permissions: permSet });
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  },

  signIn: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    // Best-effort server-side sign-out. If the access token is already invalid
    // (e.g. expired or revoked) Supabase throws AuthSessionMissingError — we
    // still want to clear local state and bounce the user to /login.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[auth] signOut server call failed, clearing local session anyway:', e);
    }

    // Clear in-memory state
    set({ user: null, session: null, profile: null, company: null, permissions: new Set(), pwdClearedAt: null });

    // Belt-and-braces: wipe any persisted Supabase auth tokens that might
    // survive a failed signOut, then hard-redirect to /login.
    try {
      for (const store of [localStorage, sessionStorage]) {
        Object.keys(store)
          .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
          .forEach(k => store.removeItem(k));
      }
    } catch { /* ignore storage errors (private mode etc.) */ }

    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },

  initialize: async () => {
    try {
      if (!isSupabaseConfigured()) {
        set({ loading: false });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        await get().loadProfile(session.user.id);
      }

      set({ loading: false });

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          await get().loadProfile(session.user.id);
        } else {
          set({ profile: null, company: null, permissions: new Set() });
        }
      });
    } catch {
      set({ loading: false });
    }
  },
}));
