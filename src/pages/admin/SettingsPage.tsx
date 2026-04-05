import { useState, useEffect } from 'react';
import { Trash2, Plus, Clock, Check, Info, Target, RotateCcw } from 'lucide-react';
import { useThresholds, useSystemConfig, useUpdateSystemConfig, useItemGroups } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatDateTime } from '@/utils/format';
import { WAREHOUSES } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { data: thresholds, isLoading } = useThresholds();
  const { data: config } = useSystemConfig();
  const { data: itemGroups = [], isLoading: groupsLoading } = useItemGroups();
  const updateConfig = useUpdateSystemConfig();
  const queryClient = useQueryClient();

  const [thresholdValue, setThresholdValue] = useState<string>('90');

  // ── VV Matrix Config ──
  const DEFAULT_VV = {
    // Validity score thresholds (days): score 5 if > v5, score 4 if > v4, etc.
    validity_v5: '180', validity_v4: '90', validity_v3: '60', validity_v2: '30',
    validity_no_expiry: '3',  // score assigned when no expiry date
    // Value score percentile bands (0-1, cumulative from top)
    value_p5: '0.20', value_p4: '0.40', value_p3: '0.60', value_p2: '0.80',
    // Class thresholds (final score)
    class_a: '4.0', class_b: '2.5',
    // Weights (must sum to 1)
    weight_value: '0.5', weight_validity: '0.5',
    // Urgent rule
    urgent_value_min: '4', urgent_validity_max: '2',
  };

  const [vv, setVv] = useState<typeof DEFAULT_VV>(DEFAULT_VV);
  const [vvSaving, setVvSaving] = useState(false);
  const [vvSaved,  setVvSaved]  = useState(false);
  const [vvError,  setVvError]  = useState('');

  // Shelf Life per Group
  const [shelfEdits, setShelfEdits] = useState<Record<number, string>>({});
  const [shelfSaving, setShelfSaving] = useState<Record<number, boolean>>({});
  const [shelfSaved, setShelfSaved] = useState<Record<number, boolean>>({});
  const [globalShelfLife, setGlobalShelfLife] = useState<string>('365');
  const [globalShelfSaving, setGlobalShelfSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setThresholdValue(config.find(c => c.key === 'active_item_threshold_days')?.value || '90');
      const rawGlobal = config.find(c => c.key === 'default_shelf_life_days')?.value;
      if (rawGlobal) setGlobalShelfLife(rawGlobal);

      // Load VV Matrix config keys
      setVv(prev => {
        const next = { ...prev };
        Object.keys(DEFAULT_VV).forEach(k => {
          const stored = config.find(c => c.key === `vv_${k}`)?.value;
          if (stored) (next as any)[k] = stored;
        });
        return next;
      });
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync shelfEdits when groups load
  useEffect(() => {
    const init: Record<number, string> = {};
    itemGroups.forEach((g: any) => {
      init[g.group_code] = g.shelf_life_days != null ? String(g.shelf_life_days) : '';
    });
    setShelfEdits(init);
  }, [itemGroups]);


  const handleSaveThreshold = () => {
    if (!thresholdValue) return;
    updateConfig.mutate({ key: 'active_item_threshold_days', value: thresholdValue });
  };

  // ── VV Matrix save ──
  const handleSaveVV = async () => {
    // Basic validation
    const wV = Number(vv.weight_value);
    const wVa = Number(vv.weight_validity);
    if (Math.abs(wV + wVa - 1) > 0.01) {
      setVvError('Weight รวมต้องเท่ากับ 1.0 (เช่น 0.5 + 0.5)');
      return;
    }
    const v5 = Number(vv.validity_v5), v4 = Number(vv.validity_v4),
          v3 = Number(vv.validity_v3), v2 = Number(vv.validity_v2);
    if (v5 <= v4 || v4 <= v3 || v3 <= v2 || v2 <= 0) {
      setVvError('Validity thresholds ต้องเรียงจากมากไปน้อย: v5 > v4 > v3 > v2 > 0');
      return;
    }
    const p5 = parseFloat(vv.value_p5), p4 = parseFloat(vv.value_p4),
          p3 = parseFloat(vv.value_p3), p2 = parseFloat(vv.value_p2);
    if (!(0 < p5 && p5 < p4 && p4 < p3 && p3 < p2 && p2 < 1)) {
      setVvError('Value percentile bands ต้องเรียง: 0 < p5 < p4 < p3 < p2 < 1');
      return;
    }
    const cA = parseFloat(vv.class_a), cB = parseFloat(vv.class_b);
    if (!(cA > cB && cB > 1 && cA <= 5)) {
      setVvError('Class thresholds ต้องอยู่ในช่วง 1–5 และ A > B');
      return;
    }
    setVvError('');
    setVvSaving(true);
    try {
      await Promise.all(
        Object.entries(vv).map(([k, v]) =>
          supabase.from('system_config').upsert({ key: `vv_${k}`, value: String(v) }, { onConflict: 'key' })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      setVvSaved(true);
      setTimeout(() => setVvSaved(false), 3000);
    } finally {
      setVvSaving(false);
    }
  };

  const handleResetVV = () => {
    setVv(DEFAULT_VV);
    setVvError('');
  };

  // ── Shelf Life handlers ──
  const handleSaveShelfLife = async (groupCode: number) => {
    const val = Number(shelfEdits[groupCode]);
    if (!val || val <= 0) return;
    setShelfSaving(p => ({ ...p, [groupCode]: true }));
    try {
      const { error } = await supabase
        .from('item_groups')
        .update({ shelf_life_days: val })
        .eq('group_code', groupCode);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['itemGroups'] });
      setShelfSaved(p => ({ ...p, [groupCode]: true }));
      setTimeout(() => setShelfSaved(p => ({ ...p, [groupCode]: false })), 2000);
    } finally {
      setShelfSaving(p => ({ ...p, [groupCode]: false }));
    }
  };

  const handleSaveGlobalShelfLife = async () => {
    const val = Number(globalShelfLife);
    if (!val || val <= 0) return;
    setGlobalShelfSaving(true);
    try {
      await supabase
        .from('system_config')
        .upsert({ key: 'default_shelf_life_days', value: String(val) }, { onConflict: 'key' });
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
    } finally {
      setGlobalShelfSaving(false);
    }
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


      {/* VV Matrix Configuration */}
      <div className="card">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(31,56,100,0.10)' }}>
              <Target size={18} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>VV Matrix — Scoring Configuration</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                ปรับเกณฑ์การให้คะแนน Value Score, Validity Score, การแบ่ง Class และน้ำหนัก
              </p>
            </div>
          </div>
          <button
            onClick={handleResetVV}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-red-50"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            <RotateCcw size={12} /> Reset Default
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Validity Score Thresholds ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
              Validity Score (Days to Expiry)
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              กำหนดช่วงวันก่อนหมดอายุสำหรับแต่ละ Score (1–5)
            </p>
            <div className="space-y-2">
              {([
                { label: 'Score 5 — มากกว่า', field: 'validity_v5', color: '#16a34a', unit: 'วัน' },
                { label: 'Score 4 — มากกว่า', field: 'validity_v4', color: '#65a30d', unit: 'วัน' },
                { label: 'Score 3 — มากกว่า', field: 'validity_v3', color: '#d97706', unit: 'วัน' },
                { label: 'Score 2 — มากกว่า', field: 'validity_v2', color: '#ea580c', unit: 'วัน' },
              ] as { label: string; field: keyof typeof vv; color: string; unit: string }[]).map(({ label, field, color }) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number" min="1"
                      value={vv[field]}
                      onChange={e => setVv(p => ({ ...p, [field]: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>วัน</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#94a3b8' }} />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Score 1 — ≤ Score 2 threshold</span>
                </div>
                <span className="text-xs font-medium tabular-nums px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#94a3b8' }} />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>ไม่มีข้อมูล Expire Date → Score</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number" min="1" max="5"
                    value={vv.validity_no_expiry}
                    onChange={e => setVv(p => ({ ...p, validity_no_expiry: e.target.value }))}
                    className="input w-20 text-center text-xs tabular-nums"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/5</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Value Score Percentile Bands ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide" style={{ color: '#2E75B6' }}>
              Value Score (Stock Value Percentile)
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Cumulative percentile จากมูลค่าสูงสุด (0 = อันดับ 1)
            </p>
            <div className="space-y-2">
              {([
                { label: 'Score 5 — top 0% ถึง', field: 'value_p5', color: '#16a34a' },
                { label: 'Score 4 — ถึง', field: 'value_p4', color: '#65a30d' },
                { label: 'Score 3 — ถึง', field: 'value_p3', color: '#d97706' },
                { label: 'Score 2 — ถึง', field: 'value_p2', color: '#ea580c' },
              ] as { label: string; field: keyof typeof vv; color: string }[]).map(({ label, field, color }) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number" min="0.01" max="0.99" step="0.05"
                      value={vv[field]}
                      onChange={e => setVv(p => ({ ...p, [field]: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      ({(parseFloat(vv[field]) * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#dc2626' }} />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Score 1 — ที่เหลือ (&gt; {(parseFloat(vv.value_p2) * 100).toFixed(0)}%)</span>
                </div>
                <span className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
            </div>
          </div>

          {/* ── Class Thresholds + Weights ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide text-emerald-600">
              Classification Thresholds
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Final Score = (Value × Weight) + (Validity × Weight)
            </p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>A</span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Class A — Score ≥</span>
                </div>
                <input
                  type="number" min="1" max="5" step="0.1"
                  value={vv.class_a}
                  onChange={e => setVv(p => ({ ...p, class_a: e.target.value }))}
                  className="input w-20 text-center text-xs tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#d97706' }}>B</span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Class B — Score ≥</span>
                </div>
                <input
                  type="number" min="1" max="5" step="0.1"
                  value={vv.class_b}
                  onChange={e => setVv(p => ({ ...p, class_b: e.target.value }))}
                  className="input w-20 text-center text-xs tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#dc2626' }}>C</span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Class C — Score &lt; {vv.class_b}</span>
                </div>
                <span className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Score Weights (รวม = 1.0)</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Value Weight</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" max="1" step="0.1"
                      value={vv.weight_value}
                      onChange={e => setVv(p => ({ ...p, weight_value: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({(parseFloat(vv.weight_value) * 100).toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Validity Weight</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" max="1" step="0.1"
                      value={vv.weight_validity}
                      onChange={e => setVv(p => ({ ...p, weight_validity: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({(parseFloat(vv.weight_validity) * 100).toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 text-xs font-semibold"
                  style={{ color: Math.abs(parseFloat(vv.weight_value) + parseFloat(vv.weight_validity) - 1) > 0.01 ? '#dc2626' : '#16a34a' }}>
                  <span>รวม</span>
                  <span>{(parseFloat(vv.weight_value) + parseFloat(vv.weight_validity)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Urgent Rule ── */}
          <div className="p-4 rounded-xl border border-red-200" style={{ backgroundColor: 'rgba(220,38,38,0.03)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide text-red-600">
              ⚠ Urgent Risk Rule
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              สินค้าที่ติด Urgent คือสินค้าที่มีมูลค่าสูง <strong>แต่</strong> ใกล้หมดอายุ — ต้องเร่งจัดการ
            </p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--text)' }}>Value Score ≥</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="1" max="5"
                    value={vv.urgent_value_min}
                    onChange={e => setVv(p => ({ ...p, urgent_value_min: e.target.value }))}
                    className="input w-20 text-center text-xs tabular-nums"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/5</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--text)' }}>AND Validity Score ≤</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="1" max="5"
                    value={vv.urgent_validity_max}
                    onChange={e => setVv(p => ({ ...p, urgent_validity_max: e.target.value }))}
                    className="input w-20 text-center text-xs tabular-nums"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/5</span>
                </div>
              </div>
            </div>
            <div className="mt-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(220,38,38,0.06)', color: '#b91c1c' }}>
              สินค้าที่ได้ Value ≥ {vv.urgent_value_min} และ Validity ≤ {vv.urgent_validity_max} จะถูกแสดง ⚠ Urgent
            </div>
          </div>
        </div>

        {/* Error + Save button */}
        {vvError && (
          <p className="mt-4 text-sm text-red-600 font-medium">{vvError}</p>
        )}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleSaveVV}
            disabled={vvSaving}
            className={`flex items-center gap-2 btn ${vvSaved ? 'btn-secondary' : 'btn-primary'}`}
          >
            {vvSaving ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : vvSaved ? (
              <><Check size={15} /> บันทึกแล้ว!</>
            ) : (
              'บันทึก VV Matrix Config'
            )}
          </button>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Config จะถูกใช้ทันทีในหน้า Reports → VV Matrix
          </p>
        </div>
      </div>

      {/* Shelf Life Settings */}
      <div className="card">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Clock size={18} className="text-emerald-500" />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Shelf Life ตามกลุ่มสินค้า</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              หากนำเข้าสินค้าโดยไม่มี Expire Date ระบบจะคำนวณ Expire Date อัตโนมัติ
              จาก <strong>วันที่ Import + Shelf Life ของกลุ่ม</strong>
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg border text-xs"
          style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)' }}>
          <Info size={13} className="mt-0.5 shrink-0 text-blue-400" />
          <span style={{ color: 'var(--text-muted)' }}>
            ลำดับการคำนวณ: <strong>1)</strong> ใช้ Expire Date จาก Excel ถ้ามี →
            <strong> 2)</strong> Shelf Life ของกลุ่มสินค้านั้น →
            <strong> 3)</strong> ค่า Global Fallback ด้านล่าง
          </span>
        </div>

        {/* Per-group table */}
        {groupsLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>กลุ่มสินค้า</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>รหัสกลุ่ม</th>
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Shelf Life (วัน)</th>
                  <th className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>เทียบเท่า</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {itemGroups.map((g: any) => {
                  const days = Number(shelfEdits[g.group_code]) || 0;
                  const years = days > 0 ? (days / 365).toFixed(1) : '-';
                  const saved = shelfSaved[g.group_code];
                  const saving = shelfSaving[g.group_code];
                  return (
                    <tr key={g.group_code} className="border-t transition-colors hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10"
                      style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{g.group_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                          style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                          {g.group_code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={shelfEdits[g.group_code] ?? ''}
                            onChange={e => setShelfEdits(p => ({ ...p, [g.group_code]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleSaveShelfLife(g.group_code)}
                            placeholder="เช่น 365"
                            className="input w-28 text-center tabular-nums"
                          />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>วัน</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {days > 0 ? `≈ ${years} ปี` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSaveShelfLife(g.group_code)}
                          disabled={saving || !shelfEdits[g.group_code]}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            saved
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'btn btn-primary'
                          }`}
                        >
                          {saving ? (
                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : saved ? (
                            <><Check size={12} /> บันทึกแล้ว</>
                          ) : (
                            'บันทึก'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Global fallback */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            🌐 Global Fallback — ใช้เมื่อกลุ่มสินค้าไม่ได้กำหนด Shelf Life ไว้
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              value={globalShelfLife}
              onChange={e => setGlobalShelfLife(e.target.value)}
              className="input w-28 text-center tabular-nums"
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>วัน</span>
            <button
              onClick={handleSaveGlobalShelfLife}
              disabled={globalShelfSaving}
              className="btn btn-primary"
            >
              {globalShelfSaving ? 'Saving...' : 'บันทึก Global'}
            </button>
          </div>
        </div>
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
