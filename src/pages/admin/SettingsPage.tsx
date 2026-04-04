import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useThresholds, useSystemConfig, useUpdateSystemConfig } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatDateTime } from '@/utils/format';
import { WAREHOUSES } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { data: thresholds, isLoading } = useThresholds();
  const { data: config } = useSystemConfig();
  const updateConfig = useUpdateSystemConfig();
  const queryClient = useQueryClient();

  const [thresholdValue, setThresholdValue] = useState<string>('90');

  // ABC thresholds (stored as percent string e.g. "80")
  const [abcA, setAbcA] = useState<string>('80');
  const [abcB, setAbcB] = useState<string>('95');
  const [abcSaving, setAbcSaving] = useState(false);
  const [abcError, setAbcError] = useState<string>('');

  useEffect(() => {
    if (config) {
      setThresholdValue(config.find(c => c.key === 'active_item_threshold_days')?.value || '90');
      const rawA = config.find(c => c.key === 'abc_threshold_a')?.value;
      const rawB = config.find(c => c.key === 'abc_threshold_b')?.value;
      if (rawA) setAbcA(String(Math.round(parseFloat(rawA) * 100)));
      if (rawB) setAbcB(String(Math.round(parseFloat(rawB) * 100)));
    }
  }, [config]);

  const handleSaveAbcThresholds = async () => {
    const a = Number(abcA);
    const b = Number(abcB);
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0 || a >= 100 || b >= 100) {
      setAbcError('กรุณาใส่ตัวเลขระหว่าง 1–99');
      return;
    }
    if (a >= b) {
      setAbcError('เกณฑ์ A ต้องน้อยกว่าเกณฑ์ B');
      return;
    }
    setAbcError('');
    setAbcSaving(true);
    try {
      await Promise.all([
        supabase.from('system_config').upsert({ key: 'abc_threshold_a', value: String(a / 100) }, { onConflict: 'key' }),
        supabase.from('system_config').upsert({ key: 'abc_threshold_b', value: String(b / 100) }, { onConflict: 'key' }),
      ]);
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      queryClient.invalidateQueries({ queryKey: ['abcAnalysis'] });
    } finally {
      setAbcSaving(false);
    }
  };

  const handleSaveThreshold = () => {
    if (!thresholdValue) return;
    updateConfig.mutate({ key: 'active_item_threshold_days', value: thresholdValue });
  };

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
      {/* System Settings */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>System Configuration</h3>
        <div className="flex flex-wrap items-center gap-6">
          <div className="max-w-[200px]">
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Active Item Threshold (Days)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={thresholdValue}
                onChange={(e) => setThresholdValue(e.target.value)}
                className="input"
                min="1"
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>days</span>
            </div>
            <button
              onClick={handleSaveThreshold}
              disabled={updateConfig.isPending}
              className="btn btn-primary mt-3 w-full"
            >
              {updateConfig.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="flex-1 min-w-[300px]">
            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
              * สินค้าที่ไม่มีการเคลื่อนไหว (รับ/จ่าย) เกินจำนวนวันที่กำหนด จะไม่ถูกนับรวมในตัวเลข "สินค้า Active" บน Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* ABC Analysis Thresholds */}
      <div className="card">
        <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>ABC Analysis Thresholds</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          กำหนดเกณฑ์ Cumulative Value % สำหรับแบ่งกลุ่มสินค้า A / B / C
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Class A */}
          <div className="p-4 rounded-xl border-l-4" style={{ borderLeftColor: '#1F3864', backgroundColor: 'var(--bg-alt)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: '#1F3864' }}>A</span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>High-value items</span>
            </div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Cumulative % สะสม ≤
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={abcA}
                onChange={e => setAbcA(e.target.value)}
                className="input w-24"
                min="1" max="99"
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
            </div>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              สินค้าที่มีมูลค่าสะสมใน {abcA || '?'}% แรก
            </p>
          </div>

          {/* Class B */}
          <div className="p-4 rounded-xl border-l-4" style={{ borderLeftColor: '#2E75B6', backgroundColor: 'var(--bg-alt)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: '#2E75B6' }}>B</span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>Mid-value items</span>
            </div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Cumulative % สะสม ≤
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={abcB}
                onChange={e => setAbcB(e.target.value)}
                className="input w-24"
                min="1" max="99"
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
            </div>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              สินค้าที่มีมูลค่าสะสมใน {abcA || '?'}–{abcB || '?'}%
            </p>
          </div>

          {/* Class C */}
          <div className="p-4 rounded-xl border-l-4" style={{ borderLeftColor: '#808080', backgroundColor: 'var(--bg-alt)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: '#808080' }}>C</span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>Low-value items</span>
            </div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Cumulative % สะสม &gt;
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{abcB || '?'}</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
            </div>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              สินค้าที่เหลือ ({abcB ? 100 - Number(abcB) : '?'}% สุดท้าย) — คำนวณอัตโนมัติ
            </p>
          </div>
        </div>

        {abcError && (
          <p className="text-sm text-red-500 mt-3">{abcError}</p>
        )}

        <button
          onClick={handleSaveAbcThresholds}
          disabled={abcSaving}
          className="btn btn-primary mt-4"
        >
          {abcSaving ? 'Saving...' : 'Save ABC Thresholds'}
        </button>
      </div>

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
