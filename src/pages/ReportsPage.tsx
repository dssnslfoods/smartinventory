import { useState, useMemo } from 'react';
import {
  Target, RefreshCw, ShoppingCart, Download, Filter, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  Scatter, ScatterChart, ResponsiveContainer,
} from 'recharts';
import {
  useStockOnHand, useSlowMoving, useInventoryTurnover, useReorderSuggestions,
  useSystemConfig,
} from '@/hooks/useSupabaseQuery';
import { ITEM_GROUPS, WAREHOUSES } from '@/types/database';
import { formatNumber, formatCurrency, formatDate, formatCompact } from '@/utils/format';
import { exportToExcel } from '@/utils/export';

// ── Color palettes ─────────────────────────────────────────────────────────────
const VV_COLORS   = { A: '#16a34a', B: '#d97706', C: '#dc2626' } as const;
const SLOW_COLORS = { dead_stock: '#C62828', slow_moving: '#E65100', normal: '#2E7D32' };
const TURNOVER_HIGH = '#1F3864';
const TURNOVER_LOW  = '#90A4AE';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card, #fff)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
  },
};

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'vv',       label: 'VV Matrix',          icon: Target },
  { id: 'slow',     label: 'Slow Moving',         icon: Clock },
  { id: 'turnover', label: 'Inventory Turnover',  icon: RefreshCw },
  { id: 'reorder',  label: 'Reorder Suggestions', icon: ShoppingCart },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Main Component ─────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('vv');

  return (
    <div className="space-y-6">
      <div className="card p-1.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-alt)]'
              }`}
              style={activeTab === id ? { backgroundColor: 'var(--color-primary)' } : {}}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'vv'       && <VVMatrixTab />}
      {activeTab === 'slow'     && <SlowMovingTab />}
      {activeTab === 'turnover' && <TurnoverTab />}
      {activeTab === 'reorder'  && <ReorderTab />}
    </div>
  );
}

// ── VV Matrix Types ────────────────────────────────────────────────────────────
interface VVItem {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  stock_value: number;
  expire_date: string | null;
  remaining_days: number | null;
  value_score: number;
  validity_score: number;
  // ── Simple (weighted-average) model ──
  final_score: number;
  vv_class: 'A' | 'B' | 'C';
  // ── Exponential model ──
  normalized_validity: number;       // validity_score / 5
  exp_factor: number;                // (normalized_validity)^alpha
  exp_score: number;                 // value_score * exp_factor
  exp_class: 'A' | 'B' | 'C';       // A≥3.5  B≥1.5  C<1.5
  // ── Risk ──
  risk_flag: 'critical' | 'high_expiry' | null;
  priority_rank: number;             // rank by exp_score desc
  recommendation: string;
  is_urgent: boolean;
}

function getRemainingDays(expireDate: string | null): number | null {
  if (!expireDate) return null;
  return Math.floor((new Date(expireDate).getTime() - Date.now()) / 86_400_000);
}

const RECOMMENDATIONS: Record<'A' | 'B' | 'C', string> = {
  A: 'Push growth / Maintain availability',
  B: 'Monitor / Optimize pricing',
  C: 'Clearance / Reduce stock / Stop purchasing',
};

const RISK_RECOMMENDATIONS: Record<'critical' | 'high_expiry', string> = {
  critical:    'URGENT SALE REQUIRED — High value at expiry risk',
  high_expiry: 'Prioritise clearance — Expiry approaching',
};

// ── VV Config defaults (mirrored from SettingsPage) ──
const VV_DEFAULTS = {
  validity_v5: 180, validity_v4: 90, validity_v3: 60, validity_v2: 30,
  validity_no_expiry: 3,
  value_p5: 0.20, value_p4: 0.40, value_p3: 0.60, value_p2: 0.80,
  class_a: 4.0, class_b: 2.5,
  weight_value: 0.5, weight_validity: 0.5,
  urgent_value_min: 4, urgent_validity_max: 2,
};

function parseVVConfig(config: Array<{ key: string; value: string }> | undefined) {
  const c = { ...VV_DEFAULTS };
  if (!config) return c;
  const get = (k: string) => config.find(r => r.key === `vv_${k}`)?.value;
  const n = (k: keyof typeof VV_DEFAULTS, fallback: number) =>
    parseFloat(get(k) ?? '') || fallback;
  c.validity_v5        = n('validity_v5',        VV_DEFAULTS.validity_v5);
  c.validity_v4        = n('validity_v4',        VV_DEFAULTS.validity_v4);
  c.validity_v3        = n('validity_v3',        VV_DEFAULTS.validity_v3);
  c.validity_v2        = n('validity_v2',        VV_DEFAULTS.validity_v2);
  c.validity_no_expiry = n('validity_no_expiry', VV_DEFAULTS.validity_no_expiry);
  c.value_p5           = n('value_p5',           VV_DEFAULTS.value_p5);
  c.value_p4           = n('value_p4',           VV_DEFAULTS.value_p4);
  c.value_p3           = n('value_p3',           VV_DEFAULTS.value_p3);
  c.value_p2           = n('value_p2',           VV_DEFAULTS.value_p2);
  c.class_a            = n('class_a',            VV_DEFAULTS.class_a);
  c.class_b            = n('class_b',            VV_DEFAULTS.class_b);
  c.weight_value       = n('weight_value',       VV_DEFAULTS.weight_value);
  c.weight_validity    = n('weight_validity',    VV_DEFAULTS.weight_validity);
  c.urgent_value_min   = n('urgent_value_min',   VV_DEFAULTS.urgent_value_min);
  c.urgent_validity_max= n('urgent_validity_max',VV_DEFAULTS.urgent_validity_max);
  return c;
}

// ── VV Matrix Tab ─────────────────────────────────────────────────────────────
function VVMatrixTab() {
  const [vvClass, setVvClass]     = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [alpha, setAlpha]         = useState(2);   // exponential factor

  const { data: stockData, isLoading } = useStockOnHand();
  const { data: sysConfig }            = useSystemConfig();
  const cfg = useMemo(() => parseVVConfig(sysConfig), [sysConfig]);

  const vvItems = useMemo<VVItem[]>(() => {
    const all = stockData ?? [];
    if (!all.length) return [];

    // Aggregate stock_value per item across warehouses
    const itemMap = new Map<string, {
      itemname: string; group_name: string; uom: string;
      stock_value: number; expire_date: string | null;
    }>();

    for (const s of all) {
      const ex = itemMap.get(s.item_code);
      if (ex) {
        ex.stock_value += Number(s.stock_value);
      } else {
        itemMap.set(s.item_code, {
          itemname:    s.itemname,
          group_name:  s.group_name,
          uom:         s.uom,
          stock_value: Number(s.stock_value),
          expire_date: s.expire_date ?? null,
        });
      }
    }

    // Sort desc by stock_value for percentile ranking
    const sorted = Array.from(itemMap.entries())
      .filter(([, v]) => v.stock_value > 0)
      .sort((a, b) => b[1].stock_value - a[1].stock_value);

    const total = sorted.length;

    const computed = sorted.map(([item_code, v], idx) => {
      const pct = total > 1 ? idx / (total - 1) : 0;
      const value_score =
        pct < cfg.value_p5 ? 5 :
        pct < cfg.value_p4 ? 4 :
        pct < cfg.value_p3 ? 3 :
        pct < cfg.value_p2 ? 2 : 1;

      const remaining = getRemainingDays(v.expire_date);
      const validity_score =
        remaining === null            ? cfg.validity_no_expiry :
        remaining > cfg.validity_v5  ? 5 :
        remaining > cfg.validity_v4  ? 4 :
        remaining > cfg.validity_v3  ? 3 :
        remaining > cfg.validity_v2  ? 2 : 1;

      // ── Simple (weighted-average) model ──
      const final_score = Math.round(
        (value_score * cfg.weight_value + validity_score * cfg.weight_validity) * 10
      ) / 10;
      const vv_class: 'A' | 'B' | 'C' =
        final_score >= cfg.class_a ? 'A' :
        final_score >= cfg.class_b ? 'B' : 'C';

      // ── Exponential model ──
      const normalized_validity = validity_score / 5;
      const exp_factor = Math.pow(normalized_validity, alpha);
      const exp_score  = Math.round(value_score * exp_factor * 100) / 100;
      const exp_class: 'A' | 'B' | 'C' =
        exp_score >= 3.5 ? 'A' :
        exp_score >= 1.5 ? 'B' : 'C';

      // ── Risk flagging ──
      const risk_flag: VVItem['risk_flag'] =
        value_score >= 4 && validity_score <= 2 ? 'critical' :
        validity_score <= 2                      ? 'high_expiry' : null;

      const recommendation =
        risk_flag === 'critical'    ? RISK_RECOMMENDATIONS.critical :
        risk_flag === 'high_expiry' ? RISK_RECOMMENDATIONS.high_expiry :
        RECOMMENDATIONS[exp_class];

      return {
        item_code, ...v,
        remaining_days: remaining,
        value_score, validity_score,
        final_score, vv_class,
        normalized_validity, exp_factor, exp_score, exp_class,
        risk_flag, priority_rank: 0,
        recommendation,
        is_urgent: value_score >= cfg.urgent_value_min && validity_score <= cfg.urgent_validity_max,
      } satisfies VVItem;
    });

    // Assign priority rank by exp_score desc
    const byExpScore = [...computed].sort((a, b) => b.exp_score - a.exp_score);
    byExpScore.forEach((item, i) => { item.priority_rank = i + 1; });

    return computed;
  }, [stockData, cfg, alpha]);

  const filtered = useMemo(() =>
    vvItems
      .filter(item => {
        if (vvClass   && item.exp_class  !== vvClass)               return false;
        if (groupCode && item.group_name !== ITEM_GROUPS[groupCode]) return false;
        return true;
      })
      .sort((a, b) => a.priority_rank - b.priority_rank),
    [vvItems, vvClass, groupCode],
  );

  const summary = useMemo(() => {
    const all      = vvItems;
    const countA   = all.filter(i => i.exp_class === 'A').length;
    const countB   = all.filter(i => i.exp_class === 'B').length;
    const countC   = all.filter(i => i.exp_class === 'C').length;
    const totalVal = all.reduce((s, i) => s + i.stock_value, 0);
    const valA     = all.filter(i => i.exp_class === 'A').reduce((s, i) => s + i.stock_value, 0);
    const valB     = all.filter(i => i.exp_class === 'B').reduce((s, i) => s + i.stock_value, 0);
    const valC     = all.filter(i => i.exp_class === 'C').reduce((s, i) => s + i.stock_value, 0);
    const avgExpScore   = all.length ? all.reduce((s, i) => s + i.exp_score,   0) / all.length : 0;
    const avgSimScore   = all.length ? all.reduce((s, i) => s + i.final_score, 0) / all.length : 0;
    const criticalCount = all.filter(i => i.risk_flag === 'critical').length;
    const highRiskCount = all.filter(i => i.risk_flag === 'high_expiry').length;
    return { countA, countB, countC, total: all.length, totalVal, valA, valB, valC, avgExpScore, avgSimScore, criticalCount, highRiskCount };
  }, [vvItems]);

  const scatterData = useMemo(() => ({
    A: vvItems.filter(i => i.exp_class === 'A').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname, exp_score: i.exp_score, risk_flag: i.risk_flag })),
    B: vvItems.filter(i => i.exp_class === 'B').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname, exp_score: i.exp_score, risk_flag: i.risk_flag })),
    C: vvItems.filter(i => i.exp_class === 'C').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname, exp_score: i.exp_score, risk_flag: i.risk_flag })),
  }), [vvItems]);

  const handleExport = () => {
    exportToExcel(filtered.map(r => ({
      'Priority Rank':             r.priority_rank,
      'Item Code':                 r.item_code,
      'Item Name':                 r.itemname,
      'Group':                     r.group_name,
      'Stock Value (฿)':           r.stock_value,
      'Expire Date':               r.expire_date ?? 'N/A',
      'Days Remaining':            r.remaining_days ?? 'N/A',
      'Value Score (1-5)':         r.value_score,
      'Validity Score (1-5)':      r.validity_score,
      'Simple Score':              r.final_score,
      'Simple Class':              r.vv_class,
      'Normalized Validity':       r.normalized_validity.toFixed(2),
      'Exp Factor':                r.exp_factor.toFixed(4),
      'Exponential Score':         r.exp_score,
      'Exponential Class':         r.exp_class,
      'Risk Flag':                 r.risk_flag ?? '',
      'Recommendation':            r.recommendation,
    })), 'VV_Matrix_Exponential');
  };

  const alphaInfo = {
    1: { label: 'α=1 Linear',   desc: 'Same as weighted average' },
    2: { label: 'α=2 Moderate', desc: 'Default — balanced risk penalty' },
    3: { label: 'α=3 Aggressive', desc: 'Recommended for perishables / food' },
  } as const;

  return (
    <div className="space-y-6">

      {/* ── Alpha Selector Bar */}
      <div className="card py-3 px-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Exponential Factor (α)</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Controls how aggressively low validity is penalised</p>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(a => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
                style={alpha === a
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                }
              >
                {alphaInfo[a].label}
              </button>
            ))}
          </div>
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
            {alphaInfo[alpha as 1|2|3].desc}
          </p>
          <div className="ml-auto text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            Score = ValueScore × (ValidityScore/5)<sup>α</sup>
          </div>
        </div>
      </div>

      {/* ── KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Avg Exp Score */}
        <div className="card lg:col-span-1">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Exp Score</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
            {summary.avgExpScore.toFixed(2)}
          </p>
          <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            Simple: {summary.avgSimScore.toFixed(2)}
          </p>
        </div>

        {/* Class A / B / C — based on exp_class */}
        {(['A', 'B', 'C'] as const).map(cls => {
          const count = cls === 'A' ? summary.countA : cls === 'B' ? summary.countB : summary.countC;
          const val   = cls === 'A' ? summary.valA   : cls === 'B' ? summary.valB   : summary.valC;
          const label = { A: 'Strategic', B: 'Core', C: 'At Risk' }[cls];
          return (
            <div key={cls} className="card border-l-4" style={{ borderLeftColor: VV_COLORS[cls] }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Class {cls} – {label}</p>
              <p className="text-2xl font-bold" style={{ color: VV_COLORS[cls] }}>
                {summary.total ? ((count / summary.total) * 100).toFixed(0) : 0}%
              </p>
              <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {count} items · ฿{formatCompact(val)}
              </p>
            </div>
          );
        })}

        {/* Critical */}
        <div className="card border-l-4" style={{ borderLeftColor: '#7c3aed' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Critical Items</p>
          <p className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{summary.criticalCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            High value + near expiry
          </p>
        </div>

        {/* Value at Risk */}
        <div className="card border-l-4" style={{ borderLeftColor: '#dc2626' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Value at Risk</p>
          <p className="text-xl font-bold tabular-nums" style={{ color: '#dc2626' }}>
            ฿{formatCompact(summary.valC)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Class C inventory
          </p>
        </div>
      </div>

      {/* ── Risk Alert Banner */}
      {(summary.criticalCount > 0 || summary.highRiskCount > 0) && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <span className="text-lg leading-none mt-0.5">🚨</span>
          <div className="text-sm">
            <span className="font-semibold" style={{ color: '#dc2626' }}>Expiry Risk Alert — </span>
            <span style={{ color: 'var(--text)' }}>
              {summary.criticalCount > 0 && <><strong>{summary.criticalCount} Critical</strong> (high-value items expiring soon){summary.highRiskCount > 0 ? ' · ' : ''}</>}
              {summary.highRiskCount > 0 && <><strong>{summary.highRiskCount} High-Risk</strong> items with validity ≤ 2</>}
              . Immediate action required.
            </span>
          </div>
        </div>
      )}

      {/* ── Matrix Scatter + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="card lg:col-span-2">
          <div className="flex items-start justify-between mb-0.5">
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>VV Matrix — Value × Validity</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(var(--color-primary-rgb,99,102,241),0.1)', color: 'var(--color-primary)' }}>
              Coloured by Exp Class (α={alpha})
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Each dot = 1 product · X = Value Score · Y = Validity Score · Penalty zone: high X, low Y (bottom-right)
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, bottom: 36, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number" dataKey="x"
                  domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]}
                  stroke="var(--text-muted)" fontSize={11}
                  label={{ value: 'Value Score (Stock Ranking) →', position: 'insideBottom', offset: -20, fontSize: 10, fill: 'var(--text-muted)' }}
                />
                <YAxis
                  type="number" dataKey="y"
                  domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]}
                  stroke="var(--text-muted)" fontSize={11}
                  label={{ value: 'Validity Score →', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: 'var(--text-muted)' }}
                  width={32}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as { x: number; y: number; name: string; itemname: string; exp_score: number; risk_flag: string | null };
                    return (
                      <div style={{ ...tooltipStyle.contentStyle, padding: '8px 12px', minWidth: 200 }}>
                        <p className="font-semibold text-xs mb-0.5">{d.name}</p>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{d.itemname}</p>
                        <p className="text-xs">Value: <strong>{d.x}</strong> · Validity: <strong>{d.y}</strong></p>
                        <p className="text-xs">Exp Score: <strong>{d.exp_score.toFixed(2)}</strong> (α={alpha})</p>
                        {d.risk_flag && (
                          <p className="text-xs font-semibold mt-1" style={{ color: '#dc2626' }}>
                            {d.risk_flag === 'critical' ? '🔴 CRITICAL' : '🟠 HIGH EXPIRY RISK'}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {(['A', 'B', 'C'] as const).map(cls => (
                  <Scatter key={cls} name={`Class ${cls}`} data={scatterData[cls]} fill={VV_COLORS[cls]} fillOpacity={0.8} r={5} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {[
              { color: VV_COLORS.A, label: 'A  (Exp Score ≥ 3.5)',   desc: 'Strategic — high value + fresh → push growth' },
              { color: VV_COLORS.B, label: 'B  (Exp Score 1.5–3.49)', desc: 'Core / Monitor — optimise & watch' },
              { color: VV_COLORS.C, label: 'C  (Exp Score < 1.5)',    desc: 'Risk / Clearance — reduce & stop purchasing' },
              { color: '#7c3aed',   label: '🔴 Critical',              desc: `Value ≥ 4 AND Validity ≤ 2 — urgent sale` },
            ].map(({ color, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <strong style={{ color: 'var(--text)', display: 'block' }}>{label}</strong>
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar — Exp Classification + Score Reference */}
        <div className="card">
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Exp Classification</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Based on exponential score (α={alpha})</p>
          <div className="space-y-4">
            {(['A', 'B', 'C'] as const).map(cls => {
              const count = cls === 'A' ? summary.countA : cls === 'B' ? summary.countB : summary.countC;
              const val   = cls === 'A' ? summary.valA   : cls === 'B' ? summary.valB   : summary.valC;
              const pct   = summary.total ? (count / summary.total) * 100 : 0;
              const labels = { A: 'Strategic', B: 'Core', C: 'At Risk' };
              const thresholds = { A: '≥ 3.5', B: '1.5 – 3.49', C: '< 1.5' };
              return (
                <div key={cls}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center"
                        style={{ backgroundColor: VV_COLORS[cls] }}>{cls}</span>
                      <div>
                        <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{labels[cls]}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{thresholds[cls]}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: VV_COLORS[cls] }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full rounded-full h-2 mb-1" style={{ backgroundColor: 'var(--bg-alt)' }}>
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: VV_COLORS[cls] }} />
                  </div>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {count} items · ฿{formatCompact(val)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Validity Score Reference</p>
            <div className="space-y-1.5 text-xs">
              {[
                { score: 5, label: '> 180 days',         color: '#16a34a', norm: '1.00', ef: Math.pow(1.00, alpha).toFixed(2) },
                { score: 4, label: '91 – 180 days',       color: '#65a30d', norm: '0.80', ef: Math.pow(0.80, alpha).toFixed(2) },
                { score: 3, label: '61 – 90 days',        color: '#d97706', norm: '0.60', ef: Math.pow(0.60, alpha).toFixed(2) },
                { score: 2, label: '31 – 60 days',        color: '#ea580c', norm: '0.40', ef: Math.pow(0.40, alpha).toFixed(2) },
                { score: 1, label: '≤ 30 days / expired', color: '#dc2626', norm: '0.20', ef: Math.pow(0.20, alpha).toFixed(2) },
              ].map(({ score, label, color, ef }) => (
                <div key={score} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold w-10" style={{ color }}>Sc.{score}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                  <span className="font-mono font-semibold" style={{ color }}>×{ef}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              Multiplier = (score/5)<sup>α</sup> applied to value score
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={vvClass} onChange={e => setVvClass(e.target.value)}>
            <option value="">All Classes (Exp)</option>
            <option value="A">Class A – Strategic</option>
            <option value="B">Class B – Core</option>
            <option value="C">Class C – At Risk</option>
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* ── Product Table */}
      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 82 }} />
                <col style={{ width: 90 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-center">#</th>
                  <th>Class</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Grp</th>
                  <th className="text-right">Stock Value</th>
                  <th>Expire Date</th>
                  <th className="text-right">Days Left</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Validity</th>
                  <th className="text-right">Simple</th>
                  <th className="text-right">Exp Score</th>
                  <th>Risk</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.item_code}
                    style={row.risk_flag === 'critical'    ? { backgroundColor: 'rgba(220,38,38,0.05)' } :
                           row.risk_flag === 'high_expiry' ? { backgroundColor: 'rgba(234,88,12,0.04)'  } : {}}>
                    <td className="text-center text-xs tabular-nums font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {row.priority_rank}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold"
                          style={{ backgroundColor: VV_COLORS[row.exp_class] }}>
                          {row.exp_class}
                        </span>
                        {row.vv_class !== row.exp_class && (
                          <span className="text-xs leading-none px-1 rounded"
                            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
                            {row.vv_class}↑
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs font-medium whitespace-nowrap" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-xs" style={{ overflow: 'hidden' }}>
                      <span className="block truncate" style={{ maxWidth: 180 }} title={row.itemname}>{row.itemname}</span>
                    </td>
                    <td className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {row.group_name.split('-')[0].trim()}
                    </td>
                    <td className="text-right tabular-nums text-xs whitespace-nowrap">฿{formatCompact(row.stock_value)}</td>
                    <td className="text-xs tabular-nums whitespace-nowrap"
                      style={{ color: row.remaining_days !== null && row.remaining_days <= 30 ? '#dc2626' : 'var(--text-muted)' }}>
                      {row.expire_date ? formatDate(row.expire_date) : '—'}
                    </td>
                    <td className="text-right tabular-nums text-xs font-semibold whitespace-nowrap">
                      {row.remaining_days !== null ? (
                        <span style={{ color: row.remaining_days <= 0 ? '#dc2626' : row.remaining_days <= 30 ? '#ea580c' : row.remaining_days <= 90 ? '#d97706' : 'var(--text)' }}>
                          {row.remaining_days > 0 ? `${row.remaining_days}d` : 'Expired'}
                        </span>
                      ) : '—'}
                    </td>
                    <td><ScoreBar score={row.value_score} color={VV_COLORS[row.exp_class]} /></td>
                    <td><ScoreBar score={row.validity_score} color={VV_COLORS[row.exp_class]} /></td>
                    <td className="text-right tabular-nums text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {row.final_score.toFixed(1)}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      <span className="font-bold text-sm" style={{ color: VV_COLORS[row.exp_class] }}>
                        {row.exp_score.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      {row.risk_flag === 'critical' && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                          CRITICAL
                        </span>
                      )}
                      {row.risk_flag === 'high_expiry' && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ backgroundColor: 'rgba(234,88,12,0.1)', color: '#ea580c' }}>
                          HIGH RISK
                        </span>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="block truncate" style={{ maxWidth: 200 }} title={row.recommendation}>
                        {row.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs font-bold w-4 tabular-nums" style={{ color }}>{score}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="w-2 h-3 rounded-sm"
            style={{ backgroundColor: i <= score ? color : 'var(--bg-alt)' }} />
        ))}
      </div>
    </div>
  );
}

// ── Slow Moving Tab ───────────────────────────────────────────────────────────
function SlowMovingTab() {
  const [status, setStatus]       = useState('');
  const [warehouse, setWhs]       = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useSlowMoving({
    movementStatus: status    || undefined,
    warehouse:      warehouse || undefined,
    groupName:      groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    return {
      dead:    all.filter(r => r.movement_status === 'dead_stock').length,
      slow:    all.filter(r => r.movement_status === 'slow_moving').length,
      normal:  all.filter(r => r.movement_status === 'normal').length,
      deadVal: all.filter(r => r.movement_status === 'dead_stock').reduce((s, r) => s + Number(r.stock_value), 0),
      slowVal: all.filter(r => r.movement_status === 'slow_moving').reduce((s, r) => s + Number(r.stock_value), 0),
    };
  }, [data]);

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':      r.item_code,
      'Item Name':      r.itemname,
      'Group':          r.group_name,
      'Warehouse':      r.warehouse,
      'Current Stock':  Number(r.current_stock),
      'UOM':            r.uom,
      'Stock Value':    Number(r.stock_value),
      'Last Out Date':  r.last_out_date ?? 'Never',
      'Days Since Out': r.days_since_last_out ?? 'N/A',
      'Status':         r.movement_status,
    })), 'Slow_Moving_Items');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.dead_stock }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Dead Stock (≥180d / never)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.dead_stock }}>{summary.dead}</p>
          <p className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>฿{formatCompact(summary.deadVal)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.slow_moving }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Slow Moving (90–179 days)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.slow_moving }}>{summary.slow}</p>
          <p className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>฿{formatCompact(summary.slowVal)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.normal }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Active (&lt;90 days)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.normal }}>{summary.normal}</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>At-Risk Inventory Value</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            ฿{formatCompact(summary.deadVal + summary.slowVal)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Dead + Slow stock combined</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="dead_stock">Dead Stock</option>
            <option value="slow_moving">Slow Moving</option>
            <option value="normal">Normal</option>
          </select>
          <select className="select" value={warehouse} onChange={e => setWhs(e.target.value)}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code} - {w.name}</option>)}
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Group</th>
                  <th>Warehouse</th>
                  <th className="text-right">Stock Qty</th>
                  <th className="text-right">Stock Value</th>
                  <th>Last Out</th>
                  <th className="text-right">Days Since Out</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row, i) => (
                  <tr key={`${row.item_code}-${row.warehouse}-${i}`}>
                    <td>
                      <span className="badge text-white text-xs"
                        style={{ backgroundColor: SLOW_COLORS[row.movement_status] }}>
                        {row.movement_status === 'dead_stock' ? 'Dead' :
                         row.movement_status === 'slow_moving' ? 'Slow' : 'Active'}
                      </span>
                    </td>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(row.group_name ?? '').split('-')[0]}
                    </td>
                    <td>{row.warehouse}</td>
                    <td className="text-right tabular-nums">{formatNumber(Number(row.current_stock), 2)} {row.uom}</td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.stock_value))}</td>
                    <td className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {row.last_out_date ? formatDate(row.last_out_date) : <span className="text-red-600">Never</span>}
                    </td>
                    <td className="text-right tabular-nums font-semibold"
                      style={{ color: row.movement_status === 'dead_stock' ? SLOW_COLORS.dead_stock : 'var(--text)' }}>
                      {row.days_since_last_out !== null ? `${row.days_since_last_out}d` : '∞'}
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inventory Turnover Tab ────────────────────────────────────────────────────
function TurnoverTab() {
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useInventoryTurnover({
    groupName: groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    const withRatio = all.filter(r => r.turnover_ratio !== null);
    if (!withRatio.length) return { avg: 0, high: 0, low: 0, avgDoh: 0 };
    const ratios = withRatio.map(r => Number(r.turnover_ratio));
    const dohs   = withRatio.filter(r => r.days_on_hand !== null).map(r => Number(r.days_on_hand));
    return {
      avg:    ratios.reduce((s, v) => s + v, 0) / ratios.length,
      high:   Math.max(...ratios),
      low:    Math.min(...ratios),
      avgDoh: dohs.length ? dohs.reduce((s, v) => s + v, 0) / dohs.length : 0,
    };
  }, [data]);

  const chartData = useMemo(() =>
    (data ?? []).slice(0, 20).map(r => ({
      item_code:      r.item_code,
      turnover_ratio: Number(r.turnover_ratio ?? 0),
      days_on_hand:   Number(r.days_on_hand   ?? 0),
    })),
    [data],
  );

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':      r.item_code,
      'Item Name':      r.itemname,
      'Group':          r.group_name,
      'Annual COGS':    Number(r.annual_cogs),
      'Annual Out Qty': Number(r.annual_out_qty),
      'Stock Value':    Number(r.current_stock_value),
      'Turnover Ratio': r.turnover_ratio !== null ? Number(r.turnover_ratio) : 'N/A',
      'Days On Hand':   r.days_on_hand   !== null ? Number(r.days_on_hand)   : 'N/A',
      'Active Months':  r.active_months,
    })), 'Inventory_Turnover');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Turnover Ratio</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
            {summary.avg.toFixed(1)}×
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Annual COGS / Stock Value</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Days on Hand</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>
            {Math.round(summary.avgDoh)}d
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Average across all items</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Highest Turnover</p>
          <p className="text-2xl font-bold tabular-nums text-green-600">{summary.high.toFixed(1)}×</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Best performing item</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lowest Turnover</p>
          <p className="text-2xl font-bold tabular-nums text-red-600">{summary.low.toFixed(1)}×</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Needs attention</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Top 20 Items by Turnover Ratio</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11}
                label={{ value: 'Turnover Ratio (×)', position: 'insideBottomRight', offset: -10, fontSize: 11 }} />
              <YAxis type="category" dataKey="item_code" width={90} stroke="var(--text-muted)" fontSize={10} />
              <Tooltip {...tooltipStyle}
                formatter={(val: unknown, name?: string) =>
                  name === 'turnover_ratio' ? [`${Number(val).toFixed(1)}×`, 'Turnover'] : [`${Number(val).toFixed(0)} days`, 'Days on Hand']}
              />
              <Bar dataKey="turnover_ratio" name="turnover_ratio" radius={[0, 4, 4, 0]} barSize={14}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.turnover_ratio >= summary.avg ? TURNOVER_HIGH : TURNOVER_LOW} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Group</th>
                  <th className="text-right">Annual COGS</th>
                  <th className="text-right">Stock Value</th>
                  <th className="text-right">Turnover</th>
                  <th className="text-right">Days on Hand</th>
                  <th className="text-right">Active Months</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row) => (
                  <tr key={row.item_code}>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(row.group_name ?? '').split('-')[0]}
                    </td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.annual_cogs))}</td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.current_stock_value))}</td>
                    <td className="text-right tabular-nums font-bold">
                      {row.turnover_ratio !== null ? (
                        <span style={{ color: Number(row.turnover_ratio) >= summary.avg ? '#2E7D32' : '#C62828' }}>
                          {Number(row.turnover_ratio).toFixed(1)}×
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.days_on_hand !== null ? (
                        <span style={{ color: Number(row.days_on_hand) > summary.avgDoh * 1.5 ? '#C62828' : 'var(--text)' }}>
                          {Number(row.days_on_hand)}d
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right tabular-nums text-sm" style={{ color: 'var(--text-muted)' }}>
                      {row.active_months}mo
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reorder Suggestions Tab ───────────────────────────────────────────────────
function ReorderTab() {
  const [warehouse, setWhs]       = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useReorderSuggestions({
    warehouse: warehouse || undefined,
    groupName: groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    const totalOrderValue = all.reduce((s, r) => s + Number(r.suggested_order_value), 0);
    const critical = all.filter(r => r.current_stock <= r.min_level).length;
    return { total: all.length, totalOrderValue, critical };
  }, [data]);

  const urgencyColor = (row: NonNullable<typeof data>[number]) => {
    if (row.current_stock <= row.min_level)     return '#C62828';
    if (row.current_stock <= row.reorder_point) return '#E65100';
    return 'var(--text)';
  };
  const urgencyLabel = (row: NonNullable<typeof data>[number]) => {
    if (row.current_stock <= row.min_level)     return 'CRITICAL';
    if (row.current_stock <= row.reorder_point) return 'Reorder';
    return 'Monitor';
  };

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':             r.item_code,
      'Item Name':             r.itemname,
      'Group':                 r.group_name,
      'Warehouse':             r.warehouse,
      'Current Stock':         Number(r.current_stock),
      'UOM':                   r.uom,
      'Min Level':             Number(r.min_level),
      'Reorder Point':         Number(r.reorder_point),
      'Max Level':             r.max_level !== null ? Number(r.max_level) : 'N/A',
      'Daily Avg Out (90d)':   Number(r.daily_avg_out),
      'Days Remaining':        r.days_remaining !== null ? Number(r.days_remaining) : 'N/A',
      'Suggested Order Qty':   Number(r.suggested_order_qty),
      'Moving Avg Cost':       Number(r.moving_avg),
      'Suggested Order Value': Number(r.suggested_order_value),
    })), 'Reorder_Suggestions');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: '#C62828' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Items Below Min Level</p>
          <p className="text-2xl font-bold" style={{ color: '#C62828' }}>{summary.critical}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Need immediate reorder</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#E65100' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Items to Reorder</p>
          <p className="text-2xl font-bold" style={{ color: '#E65100' }}>{summary.total}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>At or below reorder point</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-primary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estimated Order Value</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            ฿{formatCompact(summary.totalOrderValue)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {formatCurrency(summary.totalOrderValue)}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={warehouse} onChange={e => setWhs(e.target.value)}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code} - {w.name}</option>)}
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Urgency</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Warehouse</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Min Level</th>
                  <th className="text-right">Reorder Pt.</th>
                  <th className="text-right">Days Left</th>
                  <th className="text-right">Order Qty</th>
                  <th className="text-right">Order Value</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row, i) => (
                  <tr key={`${row.item_code}-${row.warehouse}-${i}`}>
                    <td>
                      <span className="badge text-white text-xs font-semibold"
                        style={{ backgroundColor: urgencyColor(row) }}>
                        {urgencyLabel(row)}
                      </span>
                    </td>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-sm" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname}
                    </td>
                    <td className="text-sm">{row.warehouse}</td>
                    <td className="text-right tabular-nums font-mono text-sm"
                      style={{ color: row.current_stock <= row.min_level ? '#C62828' : 'var(--text)' }}>
                      {formatNumber(Number(row.current_stock), 2)} {row.uom}
                    </td>
                    <td className="text-right tabular-nums text-sm" style={{ color: 'var(--text-muted)' }}>
                      {formatNumber(Number(row.min_level), 2)}
                    </td>
                    <td className="text-right tabular-nums text-sm" style={{ color: 'var(--text-muted)' }}>
                      {formatNumber(Number(row.reorder_point), 2)}
                    </td>
                    <td className="text-right tabular-nums font-semibold">
                      {row.days_remaining !== null ? (
                        <span style={{ color: Number(row.days_remaining) < 7 ? '#C62828' : 'var(--text)' }}>
                          {Number(row.days_remaining)}d
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {formatNumber(Number(row.suggested_order_qty), 0)} {row.uom}
                    </td>
                    <td className="text-right tabular-nums text-sm">
                      ฿{formatCompact(Number(row.suggested_order_value))}
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                      ไม่มีรายการที่ต้อง reorder ในขณะนี้ ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
