import { useState } from 'react';
import { Plus, Edit2, ToggleLeft, ToggleRight, Sliders, X, Loader2, Building2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/format';
import type { Company, CompanyFeature } from '@/types/auth';
import { FEATURE_GROUPS, PERMISSION_LABELS } from '@/types/auth';

// ── Data hooks ────────────────────────────────────────────────────────────────

function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at');
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

// ── Modal: Create / Edit Company ──────────────────────────────────────────────

function CompanyModal({
  company,
  onClose,
}: {
  company: Company | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(company?.name ?? '');
  const [slug, setSlug] = useState(company?.slug ?? '');
  const [desc, setDesc] = useState(company?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required'); return; }
    setSaving(true);
    setError('');
    try {
      if (company) {
        const { error: e } = await supabase
          .from('companies')
          .update({ name: name.trim(), slug: slug.trim(), description: desc.trim() || null })
          .eq('id', company.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('companies')
          .insert({ name: name.trim(), slug: slug.trim(), description: desc.trim() || null });
        if (e) throw e;
      }
      qc.invalidateQueries({ queryKey: ['companies'] });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-md p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>
            {company ? 'Edit Company' : 'New Company'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Company Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
              placeholder="NSL Food Service"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Slug (unique) *</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
              style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
              placeholder="nsl-food-service"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Manage Company Features ────────────────────────────────────────────

function FeaturesModal({
  company,
  onClose,
}: {
  company: Company;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { data: features = [] } = useCompanyFeatures(company.id);
  const [saving, setSaving] = useState(false);

  const isEnabled = (key: string): boolean => {
    const row = features.find(f => f.feature_key === key);
    return row ? row.is_enabled : true; // default = enabled
  };

  const toggle = async (key: string) => {
    setSaving(true);
    const current = isEnabled(key);
    try {
      await supabase
        .from('company_features')
        .upsert(
          { company_id: company.id, feature_key: key, is_enabled: !current, updated_by: user?.id },
          { onConflict: 'company_id,feature_key' }
        );
      qc.invalidateQueries({ queryKey: ['company_features', company.id] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-lg" style={{ backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
              Feature Access — {company.name}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              ปิด feature = ไม่มีใครใน บริษัทนี้เข้าถึงได้
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {FEATURE_GROUPS.map(group => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.keys.map(key => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-alt)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      {PERMISSION_LABELS[key]}
                    </span>
                    <button
                      onClick={() => toggle(key)}
                      disabled={saving}
                      className="transition-colors"
                    >
                      {isEnabled(key)
                        ? <ToggleRight size={24} className="text-green-500" />
                        : <ToggleLeft size={24} className="text-gray-400" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const qc = useQueryClient();
  const { data: companies = [], isLoading } = useCompanies();
  const [showCreate, setShowCreate] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [featureCompany, setFeatureCompany] = useState<Company | null>(null);

  const toggleActive = async (c: Company) => {
    await supabase.from('companies').update({ is_active: !c.is_active }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['companies'] });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Companies</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            จัดการบริษัททั้งหมดในระบบ
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
        >
          <Plus size={16} />
          New Company
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Building2 size={32} style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No companies yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                {['Company', 'Slug', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <tr
                  key={c.id}
                  className={cn('border-b last:border-0', i % 2 === 1 ? '' : '')}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--text)' }}>{c.name}</div>
                    {c.description && (
                      <div className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{c.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {c.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      c.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    )}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDateTime(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditCompany(c)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setFeatureCompany(c)}
                        className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-500 transition-colors"
                        title="Manage Features"
                      >
                        <Sliders size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          c.is_active
                            ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                            : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500'
                        )}
                        title={c.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {c.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {(showCreate || editCompany) && (
        <CompanyModal
          company={editCompany}
          onClose={() => { setShowCreate(false); setEditCompany(null); }}
        />
      )}
      {featureCompany && (
        <FeaturesModal
          company={featureCompany}
          onClose={() => setFeatureCompany(null)}
        />
      )}
    </div>
  );
}
