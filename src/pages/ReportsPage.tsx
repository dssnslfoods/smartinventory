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
  final_score: number;
  vv_class: 'A' | 'B' | 'C';
  recommendation: string;
  is_urgent: boolean;
}

function getRemainingDays(expireDate: string | null): number | null {
  if (!expireDate) return null;
  return Math.floor((new Date(expireDate).getTime() - Date.now()) / 86_400_000);
}

function getValidityScore(remaining: number | null): number {
  if (remaining === null) return 3;
  if (remaining > 180) return 5;
  if (remaining > 90)  return 4;
  if (remaining > 60)  return 3;
  if (remaining > 30)  return 2;
  return 1;
}

const RECOMMENDATIONS: Record<'A' | 'B' | 'C', string> = {
  A: 'Push sales / Maintain availability',
  B: 'Optimize pricing / Monitor demand',
  C: 'Clearance / Reduce stock / Stop purchasing',
};

// ── VV Matrix Tab ─────────────────────────────────────────────────────────────
function VVMatrixTab() {
  const [vvClass, setVvClass]     = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data: stockData, isLoading } = useStockOnHand();

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

    return sorted.map(([item_code, v], idx) => {
      const pct = total > 1 ? idx / (total - 1) : 0;
      const value_score =
        pct < 0.20 ? 5 :
        pct < 0.40 ? 4 :
        pct < 0.60 ? 3 :
        pct < 0.80 ? 2 : 1;

      const remaining     = getRemainingDays(v.expire_date);
      const validity_score = getValidityScore(remaining);
      const final_score   = Math.round(((value_score + validity_score) / 2) * 10) / 10;
      const vv_class: 'A' | 'B' | 'C' =
        final_score >= 4.0 ? 'A' :
        final_score >= 2.5 ? 'B' : 'C';

      return {
        item_code,
        ...v,
        remaining_days:  remaining,
        value_score,
        validity_score,
        final_score,
        vv_class,
        recommendation:  RECOMMENDATIONS[vv_class],
        is_urgent:       value_score >= 4 && validity_score <= 2,
      };
    });
  }, [stockData]);

  const filtered = useMemo(() =>
    vvItems.filter(item => {
      if (vvClass    && item.vv_class    !== vvClass)              return false;
      if (groupCode  && item.group_name  !== ITEM_GROUPS[groupCode]) return false;
      return true;
    }),
    [vvItems, vvClass, groupCode],
  );

  const summary = useMemo(() => {
    const all     = vvItems;
    const countA  = all.filter(i => i.vv_class === 'A').length;
    const countB  = all.filter(i => i.vv_class === 'B').length;
    const countC  = all.filter(i => i.vv_class === 'C').length;
    const totalVal = all.reduce((s, i) => s + i.stock_value, 0);
    const valA    = all.filter(i => i.vv_class === 'A').reduce((s, i) => s + i.stock_value, 0);
    const valB    = all.filter(i => i.vv_class === 'B').reduce((s, i) => s + i.stock_value, 0);
    const valC    = all.filter(i => i.vv_class === 'C').reduce((s, i) => s + i.stock_value, 0);
    const avgScore = all.length ? all.reduce((s, i) => s + i.final_score, 0) / all.length : 0;
    const urgentCount = all.filter(i => i.is_urgent).length;
    return { countA, countB, countC, total: all.length, totalVal, valA, valB, valC, avgScore, urgentCount };
  }, [vvItems]);

  const scatterData = useMemo(() => ({
    A: vvItems.filter(i => i.vv_class === 'A').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname })),
    B: vvItems.filter(i => i.vv_class === 'B').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname })),
    C: vvItems.filter(i => i.vv_class === 'C').map(i => ({ x: i.value_score, y: i.validity_score, name: i.item_code, itemname: i.itemname })),
  }), [vvItems]);

  const handleExport = () => {
    exportToExcel(filtered.map((r, i) => ({
      'Rank':                 i + 1,
      'Item Code':            r.item_code,
      'Item Name':            r.itemname,
      'Group':                r.group_name,
      'Stock Value (฿)':      r.stock_value,
      'Expire Date':          r.expire_date ?? 'N/A',
      'Days Remaining':       r.remaining_days ?? 'N/A',
      'Value Score (1-5)':    r.value_score,
      'Validity Score (1-5)': r.validity_score,
      'Final Score':          r.final_score,
      'VV Class':             r.vv_class,
      'Urgent':               r.is_urgent ? 'YES' : '',
      'Recommendation':       r.recommendation,
    })), 'VV_Matrix');
  };

  return (
    <div className="space-y-6">

      {/* ── KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Final Score</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
            {summary.avgScore.toFixed(2)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Scale 1.0 – 5.0</p>
        </div>

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

        <div className="card border-l-4" style={{ borderLeftColor: '#dc2626' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Urgent Items</p>
          <p className="text-2xl font-bold" style={{ color: '#dc2626' }}>{summary.urgentCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>High value + near expiry ⚠</p>
        </div>
      </div>

      {/* ── Matrix Scatter + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-0.5" style={{ color: 'var(--text)' }}>VV Matrix — Value × Validity</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Each dot = 1 product &nbsp;·&nbsp; X-axis = Value Score (stock ranking) &nbsp;·&nbsp; Y-axis = Validity Score (days to expiry)
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
                    const d = payload[0]?.payload as { x: number; y: number; name: string; itemname: string };
                    return (
                      <div style={{ ...tooltipStyle.contentStyle, padding: '8px 12px', minWidth: 180 }}>
                        <p className="font-semibold text-xs mb-0.5">{d.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.itemname}</p>
                        <p className="text-xs mt-1">Value Score: <strong>{d.x}</strong> &nbsp;·&nbsp; Validity Score: <strong>{d.y}</strong></p>
                      </div>
                    );
                  }}
                />
                {(['A', 'B', 'C'] as const).map(cls => (
                  <Scatter key={cls} name={cls} data={scatterData[cls]} fill={VV_COLORS[cls]} fillOpacity={0.8} r={5} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {[
              { color: VV_COLORS.A, label: 'A  (Score ≥ 4.0)', desc: 'High value + fresh stock → push sales' },
              { color: VV_COLORS.B, label: 'B  (Score 2.5 – 3.9)', desc: 'Moderate → optimize & monitor' },
              { color: VV_COLORS.C, label: 'C  (Score < 2.5)', desc: 'Low / stale → clearance / stop buying' },
              { color: '#dc2626',   label: '⚠ Urgent Risk', desc: 'Value ≥ 4 but Validity ≤ 2' },
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

        {/* Sidebar */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Classification</h3>
          <div className="space-y-4">
            {(['A', 'B', 'C'] as const).map(cls => {
              const count = cls === 'A' ? summary.countA : cls === 'B' ? summary.countB : summary.countC;
              const val   = cls === 'A' ? summary.valA   : cls === 'B' ? summary.valB   : summary.valC;
              const pct   = summary.total ? (count / summary.total) * 100 : 0;
              const labels = { A: 'Strategic', B: 'Core', C: 'At Risk' };
              return (
                <div key={cls}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center"
                        style={{ backgroundColor: VV_COLORS[cls] }}>{cls}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{labels[cls]}</span>
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
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Validity Score (Days to Expiry)</p>
            <div className="space-y-1.5 text-xs">
              {[
                { score: 5, label: '> 180 days',          color: '#16a34a' },
                { score: 4, label: '91 – 180 days',        color: '#65a30d' },
                { score: 3, label: '61 – 90 days',         color: '#d97706' },
                { score: 2, label: '31 – 60 days',         color: '#ea580c' },
                { score: 1, label: '≤ 30 days / expired',  color: '#dc2626' },
              ].map(({ score, label, color }) => (
                <div key={score} className="flex items-center justify-between">
                  <span className="font-bold" style={{ color }}>Score {score}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="font-bold" style={{ color: 'var(--text-muted)' }}>Score 3</span>
                <span style={{ color: 'var(--text-muted)' }}>No expiry data</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={vvClass} onChange={e => setVvClass(e.target.value)}>
            <option value="">All Classes</option>
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
                <col style={{ width: 40 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 70 }} />
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
                  <th className="text-right">Score</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={row.item_code}
                    style={row.is_urgent ? { backgroundColor: 'rgba(220,38,38,0.04)' } : {}}>
                    <td className="text-center text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: VV_COLORS[row.vv_class] }}>
                          {row.vv_class}
                        </span>
                        {row.is_urgent && <span className="text-red-500 text-xs leading-none">⚠</span>}
                      </div>
                    </td>
                    <td className="font-mono text-xs font-medium whitespace-nowrap" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-xs" style={{ overflow: 'hidden' }}>
                      <span className="block truncate" style={{ maxWidth: 190 }} title={row.itemname}>{row.itemname}</span>
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
                    <td><ScoreBar score={row.value_score} color={VV_COLORS[row.vv_class]} /></td>
                    <td><ScoreBar score={row.validity_score} color={VV_COLORS[row.vv_class]} /></td>
                    <td className="text-right tabular-nums font-bold whitespace-nowrap">
                      <span style={{ color: VV_COLORS[row.vv_class] }}>{row.final_score.toFixed(1)}</span>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="block truncate" style={{ maxWidth: 180 }} title={row.recommendation}>{row.recommendation}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
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
