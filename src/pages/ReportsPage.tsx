import { useState, useMemo } from 'react';
import {
  BarChart2, AlertCircle, RefreshCw, ShoppingCart, Download, Filter,
  TrendingUp, TrendingDown, Minus, Clock, Package,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, ResponsiveContainer,
} from 'recharts';
import {
  useABCAnalysis, useSlowMoving, useInventoryTurnover, useReorderSuggestions,
} from '@/hooks/useSupabaseQuery';
import { ITEM_GROUPS, WAREHOUSES } from '@/types/database';
import { formatNumber, formatCurrency, formatDate, formatCompact } from '@/utils/format';
import { exportToExcel } from '@/utils/export';

// ── Color palettes ─────────────────────────────────────────────────────────────
const ABC_COLORS = { A: '#1F3864', B: '#2E75B6', C: '#90A4AE' };
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
  { id: 'abc',      label: 'ABC Analysis',       icon: BarChart2 },
  { id: 'slow',     label: 'Slow Moving',         icon: Clock },
  { id: 'turnover', label: 'Inventory Turnover',  icon: RefreshCw },
  { id: 'reorder',  label: 'Reorder Suggestions', icon: ShoppingCart },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Main Component ─────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('abc');

  return (
    <div className="space-y-6">
      {/* Tab bar */}
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

      {activeTab === 'abc'      && <ABCTab />}
      {activeTab === 'slow'     && <SlowMovingTab />}
      {activeTab === 'turnover' && <TurnoverTab />}
      {activeTab === 'reorder'  && <ReorderTab />}
    </div>
  );
}

// ── ABC Analysis Tab ──────────────────────────────────────────────────────────
function ABCTab() {
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [abcClass, setAbcClass]   = useState('');

  const { data, isLoading } = useABCAnalysis({
    groupName: groupCode ? ITEM_GROUPS[groupCode] : undefined,
    abcClass:  abcClass || undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    const countA  = all.filter(r => r.abc_class === 'A').length;
    const countB  = all.filter(r => r.abc_class === 'B').length;
    const countC  = all.filter(r => r.abc_class === 'C').length;
    const totalVal = all.reduce((s, r) => s + Number(r.total_out_value), 0);
    const valA  = all.filter(r => r.abc_class === 'A').reduce((s, r) => s + Number(r.total_out_value), 0);
    const valB  = all.filter(r => r.abc_class === 'B').reduce((s, r) => s + Number(r.total_out_value), 0);
    const valC  = all.filter(r => r.abc_class === 'C').reduce((s, r) => s + Number(r.total_out_value), 0);
    return { countA, countB, countC, totalVal, valA, valB, valC, total: all.length };
  }, [data]);

  const pieData = [
    { name: 'A (80% value)', value: summary.valA,  color: ABC_COLORS.A },
    { name: 'B (15% value)', value: summary.valB,  color: ABC_COLORS.B },
    { name: 'C (5% value)',  value: summary.valC,  color: ABC_COLORS.C },
  ].filter(d => d.value > 0);

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Rank':            r.rank,
      'Item Code':       r.item_code,
      'Item Name':       r.itemname,
      'Group':           r.group_name,
      'ABC Class':       r.abc_class,
      'Total Out Value': Number(r.total_out_value),
      'Value %':         Number(r.value_pct),
      'Cumulative %':    Number(r.cumulative_pct),
      'Total Out Qty':   Number(r.total_out_qty),
      'Active Days':     r.active_days,
      'Last Movement':   r.last_movement_date,
    })), 'ABC_Analysis');
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { cls: 'A', count: summary.countA, val: summary.valA, desc: 'High-value items (≈20% items, 80% value)' },
          { cls: 'B', count: summary.countB, val: summary.valB, desc: 'Mid-value items (≈30% items, 15% value)' },
          { cls: 'C', count: summary.countC, val: summary.valC, desc: 'Low-value items (≈50% items, 5% value)' },
        ] as const).map(({ cls, count, val, desc }) => (
          <div key={cls} className="card border-l-4" style={{ borderLeftColor: ABC_COLORS[cls] }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: ABC_COLORS[cls] }}>
                {cls}
              </span>
              <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{count}</span>
            </div>
            <p className="text-sm font-semibold tabular-nums" style={{ color: ABC_COLORS[cls] }}>
              ฿{formatCompact(val)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{desc}</p>
          </div>
        ))}
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Items Analyzed</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatNumber(summary.total)}</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            ฿{formatCompact(summary.totalVal)} total value
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <select className="select" value={abcClass} onChange={e => setAbcClass(e.target.value)}>
            <option value="">All Classes</option>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Chart + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Value Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80} paddingAngle={3}
                  label={({ name, percent }) => `${name?.split(' ')[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  fontSize={11}
                >
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Pareto summary */}
          <div className="mt-3 space-y-2 text-sm border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {summary.totalVal > 0 && ([
              { cls: 'A', val: summary.valA, count: summary.countA },
              { cls: 'B', val: summary.valB, count: summary.countB },
              { cls: 'C', val: summary.valC, count: summary.countC },
            ] as const).map(({ cls, val, count }) => (
              <div key={cls} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold"
                    style={{ backgroundColor: ABC_COLORS[cls] }}>{cls}</span>
                  <span style={{ color: 'var(--text)' }}>{count} items</span>
                </div>
                <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {((val / summary.totalVal) * 100).toFixed(1)}% of value
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-0 lg:col-span-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th>Class</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Group</th>
                    <th className="text-right">Out Value</th>
                    <th className="text-right">Value %</th>
                    <th className="text-right">Cumulative %</th>
                    <th>Last Move</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).slice(0, 200).map((row) => (
                    <tr key={row.item_code}>
                      <td className="text-center text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {row.rank}
                      </td>
                      <td>
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold"
                          style={{ backgroundColor: ABC_COLORS[row.abc_class] }}>
                          {row.abc_class}
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
                      <td className="text-right tabular-nums text-sm">
                        ฿{formatCompact(Number(row.total_out_value))}
                      </td>
                      <td className="text-right tabular-nums text-sm" style={{ color: 'var(--text-muted)' }}>
                        {Number(row.value_pct).toFixed(2)}%
                      </td>
                      <td className="text-right tabular-nums text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {Number(row.cumulative_pct).toFixed(1)}%
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.last_movement_date ? formatDate(row.last_movement_date) : '—'}
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
    </div>
  );
}

// ── Slow Moving Tab ───────────────────────────────────────────────────────────
function SlowMovingTab() {
  const [status, setStatus]     = useState('');
  const [warehouse, setWhs]     = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useSlowMoving({
    movementStatus: status   || undefined,
    warehouse:      warehouse || undefined,
    groupName:      groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    return {
      dead:     all.filter(r => r.movement_status === 'dead_stock').length,
      slow:     all.filter(r => r.movement_status === 'slow_moving').length,
      normal:   all.filter(r => r.movement_status === 'normal').length,
      deadVal:  all.filter(r => r.movement_status === 'dead_stock').reduce((s, r) => s + Number(r.stock_value), 0),
      slowVal:  all.filter(r => r.movement_status === 'slow_moving').reduce((s, r) => s + Number(r.stock_value), 0),
    };
  }, [data]);

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':        r.item_code,
      'Item Name':        r.itemname,
      'Group':            r.group_name,
      'Warehouse':        r.warehouse,
      'Current Stock':    Number(r.current_stock),
      'UOM':              r.uom,
      'Stock Value':      Number(r.stock_value),
      'Last Out Date':    r.last_out_date ?? 'Never',
      'Days Since Out':   r.days_since_last_out ?? 'N/A',
      'Status':           r.movement_status,
    })), 'Slow_Moving_Items');
  };

  const statusLabel = (s: string) => ({
    dead_stock:   'Dead Stock (≥180 days / never)',
    slow_moving:  'Slow Moving (90–179 days)',
    normal:       'Normal (<90 days)',
  }[s] ?? s);

  return (
    <div className="space-y-6">
      {/* Summary */}
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

      {/* Filters */}
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

      {/* Table */}
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

  // Top 20 for chart
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
      'Item Code':       r.item_code,
      'Item Name':       r.itemname,
      'Group':           r.group_name,
      'Annual COGS':     Number(r.annual_cogs),
      'Annual Out Qty':  Number(r.annual_out_qty),
      'Stock Value':     Number(r.current_stock_value),
      'Turnover Ratio':  r.turnover_ratio !== null ? Number(r.turnover_ratio) : 'N/A',
      'Days On Hand':    r.days_on_hand   !== null ? Number(r.days_on_hand)   : 'N/A',
      'Active Months':   r.active_months,
    })), 'Inventory_Turnover');
  };

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
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

      {/* Filter + Export */}
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

      {/* Chart */}
      <div className="card">
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>
          Top 20 Items by Turnover Ratio
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11}
                label={{ value: 'Turnover Ratio (×)', position: 'insideBottomRight', offset: -10, fontSize: 11 }} />
              <YAxis type="category" dataKey="item_code" width={90} stroke="var(--text-muted)" fontSize={10} />
              <Tooltip {...tooltipStyle}
                formatter={(val: any, name: string) =>
                  name === 'turnover_ratio' ? [`${Number(val).toFixed(1)}×`, 'Turnover'] : [`${Number(val).toFixed(0)} days`, 'Days on Hand']
                }
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

      {/* Table */}
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
  const [warehouse, setWhs]     = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useReorderSuggestions({
    warehouse:  warehouse || undefined,
    groupName:  groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    const totalOrderValue = all.reduce((s, r) => s + Number(r.suggested_order_value), 0);
    const critical = all.filter(r => r.current_stock <= r.min_level).length;
    return { total: all.length, totalOrderValue, critical };
  }, [data]);

  const urgencyColor = (row: typeof data extends (infer T)[] | undefined ? T : never) => {
    if (!row) return 'var(--text)';
    if (row.current_stock <= row.min_level)      return '#C62828';
    if (row.current_stock <= row.reorder_point)  return '#E65100';
    return 'var(--text)';
  };

  const urgencyLabel = (row: typeof data extends (infer T)[] | undefined ? T : never) => {
    if (!row) return '';
    if (row.current_stock <= row.min_level)      return 'CRITICAL';
    if (row.current_stock <= row.reorder_point)  return 'Reorder';
    return 'Monitor';
  };

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':           r.item_code,
      'Item Name':           r.itemname,
      'Group':               r.group_name,
      'Warehouse':           r.warehouse,
      'Current Stock':       Number(r.current_stock),
      'UOM':                 r.uom,
      'Min Level':           Number(r.min_level),
      'Reorder Point':       Number(r.reorder_point),
      'Max Level':           r.max_level !== null ? Number(r.max_level) : 'N/A',
      'Daily Avg Out (90d)': Number(r.daily_avg_out),
      'Days Remaining':      r.days_remaining !== null ? Number(r.days_remaining) : 'N/A',
      'Suggested Order Qty': Number(r.suggested_order_qty),
      'Moving Avg Cost':     Number(r.moving_avg),
      'Suggested Order Value': Number(r.suggested_order_value),
    })), 'Reorder_Suggestions');
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
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

      {/* Filters */}
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

      {/* Table */}
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
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
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
