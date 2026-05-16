import { useState, useEffect } from 'react';
import { Trash2, Clock, Check, Info, Target, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpFormula, HelpLegend } from '@/components/HelpButton';
import { PasswordConfirmModal } from '@/components/PasswordConfirmModal';
import { useSystemConfig, useItemGroups } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { data: config } = useSystemConfig();
  const { data: itemGroups = [], isLoading: groupsLoading } = useItemGroups();
  const queryClient = useQueryClient();

  // ── VV Matrix Config ──
  const DEFAULT_VV = {
    // Validity score thresholds (days)
    validity_v5: '180', validity_v4: '90', validity_v3: '60', validity_v2: '30',
    validity_no_expiry: '3',
    // Value score percentile bands (0–1, cumulative from top by stock value)
    value_p5: '0.20', value_p4: '0.40', value_p3: '0.60', value_p2: '0.80',
    // Exponential model
    vv_alpha: '2',           // exponential factor α (1=linear, 2=moderate, 3=aggressive)
    exp_class_a: '3.5',      // exp score ≥ this → Class A
    exp_class_b: '1.5',      // exp score ≥ this → Class B (else C)
    // Simple (weighted-average) model — shown as reference only
    class_a: '4.0', class_b: '2.5',
    weight_value: '0.5', weight_validity: '0.5',
    // Risk flagging
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


  // ── VV Matrix save ──
  const handleSaveVV = async () => {
    // Validity thresholds validation
    const v5 = Number(vv.validity_v5), v4 = Number(vv.validity_v4),
          v3 = Number(vv.validity_v3), v2 = Number(vv.validity_v2);
    if (v5 <= v4 || v4 <= v3 || v3 <= v2 || v2 <= 0) {
      setVvError('Validity thresholds ต้องเรียงจากมากไปน้อย: v5 > v4 > v3 > v2 > 0');
      return;
    }
    // Value percentile validation
    const p5 = parseFloat(vv.value_p5), p4 = parseFloat(vv.value_p4),
          p3 = parseFloat(vv.value_p3), p2 = parseFloat(vv.value_p2);
    if (!(0 < p5 && p5 < p4 && p4 < p3 && p3 < p2 && p2 < 1)) {
      setVvError('Value percentile bands ต้องเรียง: 0 < p5 < p4 < p3 < p2 < 1');
      return;
    }
    // Alpha validation
    const alpha = Number(vv.vv_alpha);
    if (![1, 2, 3].includes(alpha)) {
      setVvError('Alpha (α) ต้องเป็น 1, 2 หรือ 3');
      return;
    }
    // Exp class thresholds validation (exp score range 0–5)
    const expA = parseFloat(vv.exp_class_a), expB = parseFloat(vv.exp_class_b);
    if (!(expA > expB && expB > 0 && expA <= 5)) {
      setVvError('Exp Class thresholds: 0 < B < A ≤ 5 (เช่น A=3.5, B=1.5)');
      return;
    }
    // Simple model weights (reference only — still validate they sum to 1)
    const wV = Number(vv.weight_value), wVa = Number(vv.weight_validity);
    if (Math.abs(wV + wVa - 1) > 0.01) {
      setVvError('Simple Model Weight รวมต้องเท่ากับ 1.0');
      return;
    }
    setVvError('');
    setVvSaving(true);
    try {
      // Build all rows as one batch — much faster + atomic + easier to error-handle
      // than firing 18 parallel upserts.
      const rows = Object.entries(vv).map(([k, v]) => ({
        key:   `vv_${k}`,
        value: String(v),
      }));

      // Race the network request against a 15-second timeout so the UI never
      // hangs indefinitely on a stuck connection.
      const upsert = supabase
        .from('system_config')
        .upsert(rows, { onConflict: 'key' });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout (15s) — กรุณาลองอีกครั้ง')), 15_000),
      );

      const { error } = await Promise.race([upsert, timeout]) as Awaited<typeof upsert>;
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      setVvSaved(true);
      setTimeout(() => setVvSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVvError(`บันทึกไม่สำเร็จ: ${msg}`);
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
    } catch (err) {
      alert(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setShelfSaving(p => ({ ...p, [groupCode]: false }));
    }
  };

  const handleSaveGlobalShelfLife = async () => {
    const val = Number(globalShelfLife);
    if (!val || val <= 0) return;
    setGlobalShelfSaving(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({ key: 'default_shelf_life_days', value: String(val) }, { onConflict: 'key' });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
    } catch (err) {
      alert(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGlobalShelfSaving(false);
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const performClearAllData = async () => {
    await supabase.from('inventory_lots').delete().neq('id', 0);
    await supabase.from('inventory_transactions').delete().neq('id', 0);
    await supabase.from('stock_thresholds').delete().neq('id', 0);
    await supabase.from('items').delete().neq('item_code', '');
    await supabase.from('system_config').update({ value: '' }).eq('key', 'last_sync_at');

    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="ตั้งค่าระบบ — VV Matrix, Shelf Life"
        helpTitle="Settings (ตั้งค่าระบบ)"
        helpBody={(<>
          <HelpSection title="VV Matrix Configuration">
            ปรับเกณฑ์การคำนวณ Class A/B/C สำหรับสินค้า — มีผลกับหน้า Reports → VV Matrix ทันที
            <HelpFormula>Final Score = ValueScore × (ValidityScore / 5)^α</HelpFormula>
            <HelpLegend items={[
              { color: '#1F3864', label: 'Validity Thresholds', meaning: 'จำนวนวันก่อนหมดอายุที่ใช้แบ่ง score 1-5' },
              { color: '#2E75B6', label: 'Value Percentile',     meaning: 'top X% ของมูลค่า = score 5, 4, 3, 2, 1' },
              { color: '#6366f1', label: 'Alpha (α)',             meaning: '1 = Linear, 2 = Moderate, 3 = Aggressive (แนะนำสำหรับอาหาร)' },
              { color: '#16a34a', label: 'Class A/B Threshold',  meaning: 'Score ≥ A = Class A, ≥ B = Class B, ที่เหลือ = C' },
            ]} />
          </HelpSection>
          <HelpSection title="Shelf Life ตามกลุ่มสินค้า">
            ตั้ง Shelf Life แยกแต่ละ Item Group — ระบบใช้คำนวณ Expire Date อัตโนมัติเมื่อ Excel ไม่มีค่า
            <p className="text-xs mt-1 italic">FFG=365 / FRM=548 / FBY=730 / FPKG=365 (วัน)</p>
          </HelpSection>
          <HelpSection title="ตั้ง Stock Threshold (Min / Reorder / Max)">
            ปรับ Threshold ของแต่ละสินค้าได้ที่หน้า <strong>Low Stock Alerts</strong> โดยตรง — จะเห็นจำนวนคงเหลือจริงประกอบการตัดสินใจ
          </HelpSection>
          <HelpSection title="⚠️ Danger Zone">
            ปุ่ม "Clear All Data" — ลบข้อมูล Transactions / Items / Thresholds / Item Groups / Warehouses ทั้งหมด ห้ามใช้ระหว่างปฏิบัติงาน
          </HelpSection>
        </>)}
      />


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

        {/* Formula banner */}
        <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <span className="text-base">🧮</span>
          <div className="text-xs" style={{ color: 'var(--text)' }}>
            <span className="font-semibold">Exponential Scoring Formula: </span>
            <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: 'rgba(99,102,241,0.1)' }}>
              Final Score = ValueScore × (ValidityScore / 5) ^ α
            </code>
            <span className="ml-2" style={{ color: 'var(--text-muted)' }}>— ค่า α ยิ่งสูง ยิ่งลงโทษ validity ต่ำมากขึ้น</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Validity Score Thresholds ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
              Validity Score (วันก่อนหมดอายุ)
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              กำหนดช่วงวันสำหรับแต่ละ Score 1–5 · ยิ่งสด ยิ่งคะแนนสูง
            </p>
            <div className="space-y-2">
              {([
                { label: 'Score 5 — มากกว่า', field: 'validity_v5', color: '#16a34a' },
                { label: 'Score 4 — มากกว่า', field: 'validity_v4', color: '#65a30d' },
                { label: 'Score 3 — มากกว่า', field: 'validity_v3', color: '#d97706' },
                { label: 'Score 2 — มากกว่า', field: 'validity_v2', color: '#ea580c' },
              ] as { label: string; field: keyof typeof vv; color: string }[]).map(({ label, field, color }) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="number" min="1"
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
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Score 1 — ≤ {vv.validity_v2} วัน หรือหมดอายุแล้ว</span>
                </div>
                <span className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#94a3b8' }} />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>ไม่มีข้อมูล Expire Date → Score</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input type="number" min="1" max="5"
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
              Value Score (Percentile ตามมูลค่า Stock)
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              จัดอันดับสินค้าตามมูลค่า stock จากสูงสุด → กำหนดว่า top X% ได้ Score 5, 4, 3, 2, 1
            </p>
            <div className="space-y-2">
              {([
                { label: 'Score 5 — top 0% ถึง', field: 'value_p5', color: '#16a34a' },
                { label: 'Score 4 — ถึง',         field: 'value_p4', color: '#65a30d' },
                { label: 'Score 3 — ถึง',         field: 'value_p3', color: '#d97706' },
                { label: 'Score 2 — ถึง',         field: 'value_p2', color: '#ea580c' },
              ] as { label: string; field: keyof typeof vv; color: string }[]).map(({ label, field, color }) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="number" min="0.01" max="0.99" step="0.05"
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
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Score 1 — ที่เหลือ (ต่ำกว่า {(parseFloat(vv.value_p2) * 100).toFixed(0)}%)</span>
                </div>
                <span className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
            </div>
            <div className="mt-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(46,117,182,0.06)', color: '#1e40af' }}>
              ✓ Percentile-based ranking ถูกต้องสำหรับ VV Matrix — ปรับตามการกระจายข้อมูลจริง ไม่ต้องกำหนดค่าตายตัว
            </div>
          </div>

          {/* ── Exponential Factor (α) ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'rgba(99,102,241,0.3)', backgroundColor: 'rgba(99,102,241,0.04)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide" style={{ color: '#6366f1' }}>
              Exponential Factor (α) — ค่าเริ่มต้น
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              ควบคุมความรุนแรงของการลงโทษ validity ต่ำ — ผู้ใช้ยังสามารถเปลี่ยนค่าชั่วคราวในหน้า Reports ได้
            </p>
            <div className="flex gap-2 mb-4">
              {([
                { val: '1', label: 'α = 1', sub: 'Linear', desc: 'เหมือน weighted average' },
                { val: '2', label: 'α = 2', sub: 'Moderate', desc: 'ค่า default — สมดุล' },
                { val: '3', label: 'α = 3', sub: 'Aggressive', desc: 'แนะนำสำหรับอาหาร/ของสด' },
              ]).map(({ val, label, sub, desc }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setVv(p => ({ ...p, vv_alpha: val }))}
                  className="flex-1 p-2.5 rounded-lg border text-center transition-all"
                  style={vv.vv_alpha === val
                    ? { backgroundColor: '#6366f1', borderColor: '#6366f1', color: '#fff' }
                    : { borderColor: 'var(--border)', color: 'var(--text)' }
                  }
                >
                  <div className="text-sm font-bold">{label}</div>
                  <div className="text-xs font-medium mt-0.5" style={{ opacity: vv.vv_alpha === val ? 0.85 : 1, color: vv.vv_alpha === val ? '#fff' : '#6366f1' }}>{sub}</div>
                  <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>{desc}</div>
                </button>
              ))}
            </div>
            {/* Preview of multipliers */}
            <div className="pt-3 border-t" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Validity Multiplier ที่ α={vv.vv_alpha} (คูณกับ Value Score)
              </p>
              <div className="grid grid-cols-5 gap-1 text-center">
                {[1,2,3,4,5].map(s => {
                  const mult = Math.pow(s / 5, Number(vv.vv_alpha));
                  return (
                    <div key={s} className="px-1 py-1.5 rounded text-xs"
                      style={{ backgroundColor: 'var(--bg-alt)' }}>
                      <div className="font-semibold" style={{ color: ['#dc2626','#ea580c','#d97706','#65a30d','#16a34a'][s-1] }}>Sc.{s}</div>
                      <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text)' }}>×{mult.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Exp Classification Thresholds ── */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide text-emerald-600">
              Exp Classification Thresholds
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              กำหนดเกณฑ์ A/B/C จาก <strong>Exp Score</strong> (ช่วง 0–5 ขึ้นอยู่กับ α)
            </p>
            <div className="space-y-2.5">
              {[
                { cls: 'A', color: '#16a34a', field: 'exp_class_a' as keyof typeof vv, label: 'Class A — Exp Score ≥' },
                { cls: 'B', color: '#d97706', field: 'exp_class_b' as keyof typeof vv, label: 'Class B — Exp Score ≥' },
              ].map(({ cls, color, field, label }) => (
                <div key={cls} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: color }}>{cls}</span>
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
                  </div>
                  <input type="number" min="0.1" max="5" step="0.1"
                    value={vv[field]}
                    onChange={e => setVv(p => ({ ...p, [field]: e.target.value }))}
                    className="input w-20 text-center text-xs tabular-nums"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#dc2626' }}>C</span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Class C — Exp Score &lt; {vv.exp_class_b}</span>
                </div>
                <span className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Auto</span>
              </div>
            </div>

            {/* Simple model reference — collapsed */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Simple Score (Reference) — Weight &amp; Threshold
              </p>
              <p className="text-xs mb-2 italic" style={{ color: 'var(--text-muted)' }}>
                Simple Score = (Value×W) + (Validity×W) · แสดงควบคู่ใน Reports เพื่อเปรียบเทียบ
              </p>
              <div className="space-y-2">
                {[
                  { label: 'Class A ≥', field: 'class_a' as keyof typeof vv },
                  { label: 'Class B ≥', field: 'class_b' as keyof typeof vv },
                ].map(({ label, field }) => (
                  <div key={field} className="flex items-center justify-between gap-3">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <input type="number" min="1" max="5" step="0.1"
                      value={vv[field]}
                      onChange={e => setVv(p => ({ ...p, [field]: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Value Weight</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" max="1" step="0.1"
                      value={vv.weight_value}
                      onChange={e => setVv(p => ({ ...p, weight_value: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({(parseFloat(vv.weight_value)*100).toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Validity Weight</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" max="1" step="0.1"
                      value={vv.weight_validity}
                      onChange={e => setVv(p => ({ ...p, weight_validity: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({(parseFloat(vv.weight_validity)*100).toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs font-semibold pt-1"
                  style={{ color: Math.abs(parseFloat(vv.weight_value)+parseFloat(vv.weight_validity)-1)>0.01 ? '#dc2626' : '#16a34a' }}>
                  <span>รวม</span>
                  <span>{(parseFloat(vv.weight_value)+parseFloat(vv.weight_validity)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Critical / Risk Rule ── */}
          <div className="p-4 rounded-xl border border-red-200 md:col-span-2" style={{ backgroundColor: 'rgba(220,38,38,0.03)' }}>
            <p className="text-xs font-bold mb-1 uppercase tracking-wide text-red-600">
              🔴 Risk Flagging Rule
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              กำหนดเกณฑ์ที่จะแสดง <span className="font-semibold" style={{ color: '#7c3aed' }}>CRITICAL</span> (มูลค่าสูง + ใกล้หมดอายุ) และ <span className="font-semibold text-orange-600">HIGH RISK</span> (ใกล้หมดอายุ)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: 'var(--text)' }}>Value Score ≥</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="1" max="5"
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
                    <input type="number" min="1" max="5"
                      value={vv.urgent_validity_max}
                      onChange={e => setVv(p => ({ ...p, urgent_validity_max: e.target.value }))}
                      className="input w-20 text-center text-xs tabular-nums"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/5</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}>
                  <strong>CRITICAL:</strong> Value ≥ {vv.urgent_value_min} AND Validity ≤ {vv.urgent_validity_max}
                </div>
                <div className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(234,88,12,0.08)', color: '#ea580c' }}>
                  <strong>HIGH RISK:</strong> Validity ≤ {vv.urgent_validity_max} (ทุก value)
                </div>
              </div>
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

      {/* Danger Zone */}
      <div className="card border border-red-200 dark:border-red-900">
        <h3 className="font-semibold text-red-600 mb-2">Danger Zone</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Clear all imported data. This action cannot be undone.
        </p>
        <button onClick={() => setShowClearConfirm(true)} className="btn btn-danger">
          <Trash2 size={16} /> Clear All Data
        </button>
      </div>

      {showClearConfirm && (
        <PasswordConfirmModal
          title="ล้างฐานข้อมูลทั้งหมด"
          message="การล้างข้อมูลนี้จะลบทุกอย่างและไม่สามารถย้อนคืนได้"
          consequences={[
            'Inventory Lots — สต็อกต่อ lot ทั้งหมด',
            'Transactions — การเคลื่อนไหวทุกรายการ',
            'Stock Thresholds — Min/ROP/Max',
            'Items — รายการสินค้าทั้งหมด',
            'Last sync timestamp จะถูก reset',
          ]}
          typeToConfirm="CLEAR ALL"
          confirmLabel="ลบทั้งหมดถาวร"
          onConfirm={performClearAllData}
          onClose={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
