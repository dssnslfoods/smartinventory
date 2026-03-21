import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useThresholds } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatDateTime } from '@/utils/format';
import { WAREHOUSES } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { data: thresholds, isLoading } = useThresholds();
  const queryClient = useQueryClient();

  // Bulk threshold form
  const [bulkItemCode, setBulkItemCode] = useState('');
  const [bulkWarehouse, setBulkWarehouse] = useState('');
  const [bulkMin, setBulkMin] = useState('');
  const [bulkReorder, setBulkReorder] = useState('');
  const [bulkMax, setBulkMax] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddThreshold = async () => {
    if (!bulkItemCode || !bulkWarehouse) return;
    setSaving(true);
    try {
      await supabase.from('stock_thresholds').upsert({
        item_code: bulkItemCode,
        warehouse: bulkWarehouse,
        min_level: Number(bulkMin) || 0,
        reorder_point: Number(bulkReorder) || 0,
        max_level: bulkMax ? Number(bulkMax) : null,
      }, { onConflict: 'item_code,warehouse' });

      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['stockAlerts'] });
      setBulkItemCode('');
      setBulkWarehouse('');
      setBulkMin('');
      setBulkReorder('');
      setBulkMax('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await supabase.from('stock_thresholds').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['thresholds'] });
    queryClient.invalidateQueries({ queryKey: ['stockAlerts'] });
  };

  const handleClearAllData = async () => {
    if (!confirm('Are you sure? This will delete ALL inventory data. This cannot be undone.')) return;
    if (!confirm('This is your final confirmation. ALL data will be permanently deleted.')) return;

    await supabase.from('inventory_transactions').delete().neq('id', 0);
    await supabase.from('stock_thresholds').delete().neq('id', 0);
    await supabase.from('items').delete().neq('item_code', '');
    await supabase.from('system_config').update({ value: '' }).eq('key', 'last_sync_at');

    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      {/* Threshold Management */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Stock Threshold Settings</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Configure minimum stock levels and reorder points per item and warehouse.
        </p>

        {/* Add New Threshold */}
        <div className="p-4 rounded-lg grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-4" style={{ backgroundColor: 'var(--bg-alt)' }}>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Item Code</label>
            <input value={bulkItemCode} onChange={(e) => setBulkItemCode(e.target.value)} className="input mt-1" placeholder="e.g. F10100002" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Warehouse</label>
            <select value={bulkWarehouse} onChange={(e) => setBulkWarehouse(e.target.value)} className="select w-full mt-1">
              <option value="">Select...</option>
              {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Min Level</label>
            <input type="number" value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Reorder Point</label>
            <input type="number" value={bulkReorder} onChange={(e) => setBulkReorder(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Max Level</label>
            <input type="number" value={bulkMax} onChange={(e) => setBulkMax(e.target.value)} className="input mt-1" placeholder="Optional" />
          </div>
          <div>
            <button onClick={handleAddThreshold} disabled={saving} className="btn btn-primary w-full">
              <Plus size={16} /> {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </div>

        {/* Thresholds Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Warehouse</th>
                  <th className="text-right">Min Level</th>
                  <th className="text-right">Reorder Point</th>
                  <th className="text-right">Max Level</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(thresholds ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{t.item_code}</td>
                    <td>{t.warehouse}</td>
                    <td className="text-right">{formatNumber(Number(t.min_level), 2)}</td>
                    <td className="text-right">{formatNumber(Number(t.reorder_point), 2)}</td>
                    <td className="text-right">{t.max_level ? formatNumber(Number(t.max_level), 2) : '-'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatDateTime(t.updated_at)}</td>
                    <td>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(thresholds ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                      No thresholds configured yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card border border-red-200 dark:border-red-900">
        <h3 className="font-semibold text-red-600 mb-2">Danger Zone</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Clear all imported data. This action cannot be undone.
        </p>
        <button onClick={handleClearAllData} className="btn btn-danger">
          <Trash2 size={16} /> Clear All Data
        </button>
      </div>
    </div>
  );
}
