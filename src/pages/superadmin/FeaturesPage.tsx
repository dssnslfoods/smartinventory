import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/format';
import { ToggleLeft, ToggleRight, Building2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { Company, CompanyFeature } from '@/types/auth';
import { FEATURE_GROUPS, PERMISSION_LABELS } from '@/types/auth';

function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Company[];
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

export default function FeaturesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { data: companies = [], isLoading: loadingCompanies } = useCompanies();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null); // key being toggled

  const selected = companies.find(c => c.id === selectedId) ?? null;
  const { data: features = [], isLoading: loadingFeatures } = useCompanyFeatures(selectedId);

  const isEnabled = (key: string): boolean => {
    const row = features.find(f => f.feature_key === key);
    return row ? row.is_enabled : true; // default = enabled
  };

  const enabledCount = () => {
    let count = 0;
    FEATURE_GROUPS.forEach(g => g.keys.forEach(k => { if (isEnabled(k)) count++; }));
    return count;
  };

  const totalCount = FEATURE_GROUPS.reduce((s, g) => s + g.keys.length, 0);

  const toggle = async (key: string) => {
    if (!selectedId || toggling) return;
    setToggling(key);
    const current = isEnabled(key);
    try {
      await supabase
        .from('company_features')
        .upsert(
          { company_id: selectedId, feature_key: key, is_enabled: !current, updated_by: user?.id },
          { onConflict: 'company_id,feature_key' }
        );
      qc.invalidateQueries({ queryKey: ['company_features', selectedId] });
    } finally {
      setToggling(null);
    }
  };

  const enableAll = async () => {
    if (!selectedId || toggling) return;
    setToggling('__all__');
    const allKeys = FEATURE_GROUPS.flatMap(g => g.keys);
    await supabase.from('company_features').upsert(
      allKeys.map(key => ({ company_id: selectedId, feature_key: key, is_enabled: true, updated_by: user?.id })),
      { onConflict: 'company_id,feature_key' }
    );
    qc.invalidateQueries({ queryKey: ['company_features', selectedId] });
    setToggling(null);
  };

  const disableAll = async () => {
    if (!selectedId || toggling) return;
    setToggling('__all__');
    const allKeys = FEATURE_GROUPS.flatMap(g => g.keys);
    await supabase.from('company_features').upsert(
      allKeys.map(key => ({ company_id: selectedId, feature_key: key, is_enabled: false, updated_by: user?.id })),
      { onConflict: 'company_id,feature_key' }
    );
    qc.invalidateQueries({ queryKey: ['company_features', selectedId] });
    setToggling(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Feature Access Control</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          เลือกบริษัท แล้วเปิด/ปิด features ที่ต้องการ
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Company List (left panel) */}
        <div className="w-64 shrink-0 rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
            Companies
          </div>
          {loadingCompanies ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Building2 size={28} style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No companies</p>
            </div>
          ) : (
            <div className="py-1">
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
                    selectedId === c.id
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'hover:bg-[var(--bg-alt)]'
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={selectedId === c.id
                      ? { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }
                      : { backgroundColor: 'var(--bg-alt)', color: 'var(--color-primary)' }
                    }
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className={cn('text-sm font-medium truncate', selectedId === c.id ? 'text-white' : '')} style={selectedId !== c.id ? { color: 'var(--text)' } : {}}>
                      {c.name}
                    </div>
                    <div className={cn('text-xs truncate', selectedId === c.id ? 'text-white/70' : '')} style={selectedId !== c.id ? { color: 'var(--text-muted)' } : {}}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Feature Toggles (right panel) */}
        <div className="flex-1 min-w-0">
          {!selectedId ? (
            <div className="rounded-xl border flex flex-col items-center justify-center py-24 gap-3"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <Building2 size={36} style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>เลือกบริษัททางซ้ายเพื่อจัดการ features</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h2 className="font-semibold" style={{ color: 'var(--text)' }}>{selected?.name}</h2>
                  {!loadingFeatures && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      เปิดใช้งาน <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{enabledCount()}</span> / {totalCount} features
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={enableAll}
                    disabled={!!toggling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50"
                    style={{ borderColor: '#16a34a', color: '#16a34a' }}
                  >
                    <CheckCircle2 size={13} />
                    Enable All
                  </button>
                  <button
                    onClick={disableAll}
                    disabled={!!toggling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    style={{ borderColor: '#dc2626', color: '#dc2626' }}
                  >
                    <XCircle size={13} />
                    Disable All
                  </button>
                </div>
              </div>

              {/* Feature groups */}
              {loadingFeatures ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : (
                <div className="p-5 space-y-6">
                  {FEATURE_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          {group.label}
                        </h3>
                        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {group.keys.filter(k => isEnabled(k)).length}/{group.keys.length} on
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.keys.map(key => {
                          const on = isEnabled(key);
                          const busy = toggling === key || toggling === '__all__';
                          return (
                            <div
                              key={key}
                              className={cn(
                                'flex items-center justify-between px-4 py-3 rounded-lg border transition-all',
                                on
                                  ? 'border-green-200 dark:border-green-800'
                                  : ''
                              )}
                              style={on
                                ? { backgroundColor: 'rgba(22,163,74,0.05)', borderColor: 'rgba(22,163,74,0.3)' }
                                : { backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)' }
                              }
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: on ? '#16a34a' : 'var(--text-muted)' }}
                                />
                                <span className="text-sm truncate" style={{ color: 'var(--text)' }}>
                                  {PERMISSION_LABELS[key]}
                                </span>
                              </div>
                              <button
                                onClick={() => toggle(key)}
                                disabled={busy}
                                className={cn('shrink-0 transition-all ml-3', busy && 'opacity-50')}
                              >
                                {busy && toggling === key ? (
                                  <Loader2 size={22} className="animate-spin text-gray-400" />
                                ) : on ? (
                                  <ToggleRight size={26} className="text-green-500" />
                                ) : (
                                  <ToggleLeft size={26} className="text-gray-400" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
