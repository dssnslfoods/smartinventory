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

  setUser:     (user: User | null) => void;
  setSession:  (session: Session | null) => void;
  setLoading:  (loading: boolean) => void;

  signIn:      (email: string, password: string) => Promise<{ error: string | null }>;
  signOut:     () => Promise<void>;
  initialize:  () => Promise<void>;
  loadProfile: (userId: string) => Promise<void>;
  hasPermission: (key: PermissionKey) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:        null,
  session:     null,
  profile:     null,
  company:     null,
  permissions: new Set(),
  loading:     true,

  setUser:    (user)    => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),

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
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, company: null, permissions: new Set() });
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
