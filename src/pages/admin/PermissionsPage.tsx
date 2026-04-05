import { useState, useEffect, useMemo } from 'react';
import { Loader2, Save, RotateCcw, Check, Info, Lock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/format';
import type { RolePermission, UserRole, PermissionKey, CompanyFeature } from '@/types/auth';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_COLORS,
} from '@/types/auth';

type ConfigRole = Exclude<UserRole, 'super_admin' | 'admin'>;
const CONFIG_ROLES: ConfigRole[] = ['executive', 'supervisor', 'staff'];

function useRolePermissions(companyId: string | null) {
  return useQuery({
    queryKey: ['role_permissions', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data as RolePermission[];
    },
  });
}

function useCompanyFeatures(companyId: string | null) {
  return useQuery({
    queryKey: ['company_features', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_features')
        .select('*')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data as CompanyFeature[];
    },
  });
}

// Build local state: Record<role, Set<permissionKey>>
function buildPermMap(
  dbPerms: RolePermission[],
  useDefaults: boolean
): Record<ConfigRole, Set<string>> {
  const result = {} as Record<ConfigRole, Set<string>>;

  CONFIG_ROLES.forEach(role => {
    const dbForRole = dbPerms.filter(p => p.role === role);
    if (dbForRole.length > 0) {
      // Use DB config
      result[role] = new Set(dbForRole.filter(p => p.is_enabled).map(p => p.permission_key));
    } else if (useDefaults) {
      // Fall back to defaults
      result[role] = new Set(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
    } else {
      result[role] = new Set();
    }
  });

  return result;
}

export function PermissionsPage() {
  const qc = useQueryClient();
  const { company, user } = useAuthStore();
  const { data: dbPerms = [], isLoading } = useRolePermissions(company?.id ?? null);
  const { data: companyFeatures = [] } = useCompanyFeatures(company?.id ?? null);

  // Set of feature keys disabled by super_admin
  const disabledByAdmin = useMemo(() =>
    new Set(companyFeatures.filter(f => !f.is_enabled).map(f => f.feature_key)),
    [companyFeatures]
  );

  // Filter PERMISSION_GROUPS to only show features super_admin allows
  const allowedGroups = useMemo(() =>
    PERMISSION_GROUPS.map(group => ({
      ...group,
      keys: group.keys.filter(k => !disabledByAdmin.has(k)),
    })).filter(group => group.keys.length > 0),
    [disabledByAdmin]
  );

  const [permMap, setPermMap] = useState<Record<ConfigRole, Set<string>>>({
    executive: new Set(),
    supervisor: new Set(),
    staff: new Set(),
  });
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Initialise state once DB data loads
  useEffect(() => {
    if (!isLoading) {
      setPermMap(buildPermMap(dbPerms, true));
      setIsDirty(false);
    }
  }, [dbPerms, isLoading]);

  const toggle = (role: ConfigRole, key: PermissionKey) => {
    setPermMap(prev => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      if (next[role].has(key)) next[role].delete(key);
      else next[role].add(key);
      return next;
    });
    setIsDirty(true);
    setSavedOk(false);
  };

  const resetToDefaults = () => {
    setPermMap(buildPermMap([], true));
    setIsDirty(true);
    setSavedOk(false);
  };

  const handleSave = async () => {
    if (!company?.id) return;
    setSaving(true);
    try {
      const rows: { company_id: string; role: string; permission_key: string; is_enabled: boolean; updated_by: string | null }[] = [];

      CONFIG_ROLES.forEach(role => {
        // Only write keys that super_admin allows for this company
        const allKeys = allowedGroups.flatMap(g => g.keys);
        allKeys.forEach(key => {
          rows.push({
            company_id:     company.id,
            role,
            permission_key: key,
            is_enabled:     permMap[role].has(key),
            updated_by:     user?.id ?? null,
          });
        });
      });

      const { error } = await supabase
        .from('role_permissions')
        .upsert(rows, { onConflict: 'company_id,role,permission_key' });

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['role_permissions', company.id] });
      setIsDirty(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  const hasDbConfig = dbPerms.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Role Permissions</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            กำหนดสิทธิ์การเข้าถึงสำหรับแต่ละ role ใน {company?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-[var(--bg-alt)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors',
              savedOk
                ? 'bg-green-500 text-white'
                : 'bg-[var(--color-primary)] text-white disabled:opacity-50'
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : savedOk ? <Check size={14} /> : <Save size={14} />}
            {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      {!hasDbConfig && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-5 border"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            กำลังใช้ค่า <strong>Default permissions</strong> — กดบันทึกเพื่อบันทึกการตั้งค่าของบริษัทนี้
          </p>
        </div>
      )}

      {/* Disabled-by-admin banner */}
      {disabledByAdmin.size > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-5 border"
          style={{ backgroundColor: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}
        >
          <Lock size={16} className="mt-0.5 shrink-0" style={{ color: '#7c3aed' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: '#7c3aed' }}>Super Admin</strong> ได้ปิด {disabledByAdmin.size} feature(s) สำหรับบริษัทนี้ — features เหล่านั้นถูกซ่อนจากหน้านี้แล้ว
          </p>
        </div>
      )}

      {/* Permission Matrix */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        {/* Role header */}
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: '1fr repeat(3, 130px)',
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-alt)',
          }}
        >
          <div className="px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Permission
          </div>
          {CONFIG_ROLES.map(role => (
            <div key={role} className="px-4 py-3 text-center">
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </span>
            </div>
          ))}
        </div>

        {/* Permission groups — only features allowed by super_admin */}
        {allowedGroups.map(group => (
          <div key={group.label}>
            {/* Group header */}
            <div
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b"
              style={{
                backgroundColor: 'var(--bg-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              {group.label}
            </div>

            {/* Permission rows */}
            {group.keys.map((key, idx) => (
              <div
                key={key}
                className={cn(
                  'grid border-b last:border-0 items-center',
                  idx % 2 === 1 ? 'bg-[var(--bg-alt)]/40' : ''
                )}
                style={{
                  gridTemplateColumns: '1fr repeat(3, 130px)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="px-4 py-2.5 text-sm" style={{ color: 'var(--text)' }}>
                  {PERMISSION_LABELS[key]}
                </div>

                {CONFIG_ROLES.map(role => (
                  <div key={role} className="px-4 py-2.5 flex justify-center">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permMap[role]?.has(key) ?? false}
                        onChange={() => toggle(role, key)}
                        className="w-4 h-4 rounded accent-[var(--color-primary)] cursor-pointer"
                      />
                    </label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        * การเปลี่ยนแปลงจะมีผลในครั้งถัดไปที่ user login
      </p>
    </div>
  );
}
