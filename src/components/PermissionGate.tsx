import { usePermission, useHasRole } from '@/hooks/usePermission';
import type { PermissionKey, UserRole } from '@/types/auth';

interface PermissionGateProps {
  permission?: PermissionKey;
  role?: UserRole | UserRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders children only when the user has the specified permission and/or role.
 * Use `permission` to check a specific action/menu access.
 * Use `role` to check for one or more roles directly.
 * Both can be combined (both must pass).
 */
export function PermissionGate({ permission, role, fallback = null, children }: PermissionGateProps) {
  const roles: UserRole[] = role ? (Array.isArray(role) ? role : [role]) : [];
  const allRoles: UserRole[] = ['super_admin', 'admin', 'executive', 'supervisor', 'staff'];
  const roleOk    = useHasRole(...(roles.length ? roles : allRoles));
  const permOk    = usePermission((permission ?? 'menu.dashboard') as PermissionKey);

  const allowed = (role ? roleOk : true) && (permission ? permOk : true);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
