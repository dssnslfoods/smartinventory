import { useAuthStore } from '@/stores/authStore';
import type { PermissionKey, UserRole } from '@/types/auth';

/** Returns true if the current user has the given permission. */
export function usePermission(key: PermissionKey): boolean {
  return useAuthStore(s => s.hasPermission(key));
}

/** Returns true if the current user has at least one of the specified roles. */
export function useHasRole(...roles: UserRole[]): boolean {
  const role = useAuthStore(s => s.profile?.role);
  if (!role) return false;
  return roles.includes(role);
}

/** Returns the current user's role, or null if not loaded. */
export function useCurrentRole(): UserRole | null {
  return useAuthStore(s => s.profile?.role ?? null);
}
