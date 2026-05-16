import { useState, useMemo } from 'react';
import {
  Download, Filter, BarChart3, Calculator,
  TrendingUp, TrendingDown, Clock, AlertTriangle, Layers, DollarSign,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';
import {
  useStockOnHand, useMovementMonthly, useSlowMoving, useInventoryTurnover,
  useMonthlyTotal,
} from '@/hooks/useSupabaseQuery';
import { formatCurrency, formatNumber, formatDate, formatCompact } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpFormula } from '@/components/HelpButton';

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Overview',        icon: BarChart3 },
  { id: 'analytics', label: 'Cost Analytics',  icon: Calculator },
] as const;
type TabId = typeof TABS[number]['id'];

// ── Main Component ───────────────────────────────────────────────────────────
export function ValuationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cost & Valuation"
        subtitle="วิเคราะห์มูลค่าสต็อกและต้นทุน + อัตราส่วนทางการเงิน"
        helpTitle="Cost & Valuation (ต้นทุนและมูลค่า)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            มี 2 แท็บ:
            <ul className="list-disc ml-5 text-xs mt-1 space-y-1">
              <li><strong>Overview</strong> — มูลค่าสต็อก (Moving Avg / Std Cost) + breakdown</li>
              <li><strong>Cost Analytics</strong> — อัตราส่วนทางการเงินที่สำคัญสำหรับผู้บริหาร</li>
            </ul>
          </HelpSection>
          <HelpSection title="2 วิธีคำนวณมูลค่า (Overview)">
            <HelpFormula>Inventory Value (Moving Avg) = Σ (qty × moving_avg cost)</HelpFormula>
            ใกล้ราคาตลาดจริง — เปลี่ยนตาม market
            <HelpFormula>Inventory Value (Std Cost) = Σ (qty × std cost)</HelpFormula>
            ต้นทุนมาตรฐาน — เหมาะกับการเปรียบเทียบเชิงบัญชี
          </HelpSection>
          <HelpSection title="Cost Analytics ใช้เมื่อไร">
            ใช้ตอบคำถามผู้บริหาร: หมุนเวียนเร็วแค่ไหน, เงินจมในคลังเท่าไร, ต้นทุนแบกของสต็อกประมาณเท่าไร,
            ของค้าง (Dead Stock) มีมูลค่าเท่าไร
          </HelpSection>
        </>)}
      />

      {/* Tabs */}
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

      {activeTab === 'overview'  && <OverviewTab />}
      {activeTab === 'analytics' && <CostAnalyticsTab />}
    </div>
  );
}

// ── Tab 1: Overview (existing content) ───────────────────────────────────────
function OverviewTab() {
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data: stockData, isLoading } = useStockOnHand({
    warehouse: warehouse || undefined,
    groupCode,
    isActive: true,
  });
  const { data: monthlyData } = useMovementMonthly({ warehouse: warehouse || undefined, months: 12 });

  const totals = useMemo(() => {
    if (!stockData) return { maValue: 0, stdValue: 0, items: 0 };
    let maValue = 0, stdValue = 0;
    for (const s of stockData) {
      const stock = Number(s.current_stock);
      maValue += stock * Number(s.moving_avg);
      stdValue += stock * Number(s.std_cost);
    }
    return { maValue, stdValue, items: stockData.length };
  }, [stockData]);

  const groupBreakdown = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { group: string; maValue: number; stdValue: number; count: number }>();
    for (const s of stockData) {
      const key = s.group_name;
      const prev = map.get(key) ?? { group: key, maValue: 0, stdValue: 0, count: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      prev.count++;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [stockData]);

  const whsBreakdown = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { warehouse: string; whsName: string; maValue: number; stdValue: number }>();
    for (const s of stockData) {
      const key = s.warehouse;
      const prev = map.get(key) ?? { warehouse: key, whsName: s.whs_name, maValue: 0, stdValue: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.maValue - a.maValue);
  }, [stockData]);

  const varianceData = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { item_code: string; itemname: string; moving_avg: number; std_cost: number; variance: number; stock: number }>();
    for (const s of stockData) {
      if (Number(s.std_cost) <= 0) continue;
      const existing = map.get(s.item_code);
      if (existing) {
        existing.stock += Number(s.current_stock);
      } else {
        const moving_avg = Number(s.moving_avg);
        const std_cost = Number(s.std_cost);
        map.set(s.item_code, {
          item_code: s.item_code,
          itemname: s.itemname,
          moving_avg,
          std_cost,
          variance: ((moving_avg - std_cost) / std_cost) * 100,
          stock: Number(s.current_stock),
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 15);
  }, [stockData]);

  const valueTrend = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.map(m => ({ month: m.month, amount: Math.abs(m.total_amount) }));
  }, [monthlyData]);

  const handleExport = () => {
    if (!stockData) return;
    exportToExcel(stockData.map(s => ({
      'Item Code': s.item_code,
      'Item Name': s.itemname,
      'Warehouse': s.warehouse,
      'Group': s.group_name,
      'Current Stock': Number(s.current_stock),
      'UOM': s.uom,
      'Moving Avg': Number(s.moving_avg),
      'Std Cost': Number(s.std_cost),
      'Value (MA)': Number(s.current_stock) * Number(s.moving_avg),
      'Value (STD)': Number(s.current_stock) * Number(s.std_cost),
      'Variance %': Number(s.std_cost) > 0
        ? (((Number(s.moving_avg) - Number(s.std_cost)) / Number(s.std_cost)) * 100).toFixed(2)
        : 'N/A',
    })), 'Cost_Valuation');
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inventory Value (Moving Avg)</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
            {isLoading ? '...' : formatCurrency(totals.maValue)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inventory Value (Std Cost)</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
            {isLoading ? '...' : formatCurrency(totals.stdValue)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Variance (MA vs STD)</p>
          <p className={`text-2xl font-bold mt-1 ${totals.maValue >= totals.stdValue ? 'text-green-600' : 'text-red-600'}`}>
            {isLoading ? '...' : formatCurrency(totals.maValue - totals.stdValue)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="select">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code} - {w.name}</option>)}
          </select>
          <select value={groupCode ?? ''} onChange={(e) => setGroupCode(e.target.value ? Number(e.target.value) : undefined)} className="select">
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Value by Item Group</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={(v) => formatCompact(Number(v))} stroke="var(--text-muted)" fontSize={12} />
                <YAxis type="category" dataKey="group" width={60} stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => v.split('-')[0]} />
                <Tooltip formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))} />
                <Legend />
                <Bar dataKey="maValue" name="Moving Avg" fill="#1F3864" radius={[0, 4, 4, 0]} />
                <Bar dataKey="stdValue" name="Std Cost" fill="#2E75B6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Transaction Value Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(v) => new Date(v).toLocaleDateString('th-TH', { month: 'short' })} stroke="var(--text-muted)" fontSize={12} />
                <YAxis tickFormatter={(v) => formatCompact(Number(v))} stroke="var(--text-muted)" fontSize={12} />
                <Tooltip formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))} labelFormatter={(v) => formatDate(String(v))} />
                <Area type="monotone" dataKey="amount" stroke="#00897B" fill="#00897B" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Warehouse Breakdown Table */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Value by Warehouse</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Warehouse</th><th>Name</th>
                <th className="text-right">Value (Moving Avg)</th>
                <th className="text-right">Value (Std Cost)</th>
                <th className="text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {whsBreakdown.map((row) => (
                <tr key={row.warehouse}>
                  <td className="font-medium">{row.warehouse}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.whsName}</td>
                  <td className="text-right font-mono">{formatCurrency(row.maValue)}</td>
                  <td className="text-right font-mono">{formatCurrency(row.stdValue)}</td>
                  <td className={`text-right font-mono ${row.maValue >= row.stdValue ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(row.maValue - row.stdValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price Variance Table */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Top Price Variance (MA vs STD Cost)</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Item Code</th><th>Item Name</th>
                <th className="text-right">Moving Avg</th>
                <th className="text-right">Std Cost</th>
                <th className="text-right">Variance %</th>
                <th className="text-right">Stock Qty</th>
              </tr>
            </thead>
            <tbody>
              {varianceData.map((row) => (
                <tr key={row.item_code}>
                  <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</td>
                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.itemname || (row as any).item_name || '—'}
                  </td>
                  <td className="text-right">{formatCurrency(row.moving_avg)}</td>
                  <td className="text-right">{formatCurrency(row.std_cost)}</td>
                  <td className={`text-right font-bold ${row.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.variance >= 0 ? '+' : ''}{row.variance.toFixed(1)}%
                  </td>
                  <td className="text-right">{formatNumber(row.stock, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Cost Analytics — Financial Ratios + Deep Analysis ────────────────
// Industry-standard inventory KPIs that CFO / Operations Director care about.
// Assumptions:
//   - "COGS proxy" = sum of Out value over the last 12 months
//   - "Avg Inventory" = current MA value (ideally rolling avg; we use current as proxy)
//   - "Carrying Cost rate" = 22% per year (industry default; user-configurable)

const CARRYING_COST_RATE_DEFAULT = 0.22;  // 22% annual — industry standard
const GROUP_COLORS = ['#1F3864', '#2E75B6', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function CostAnalyticsTab() {
  const [carryingRate, setCarryingRate] = useState<number>(CARRYING_COST_RATE_DEFAULT);

  const { data: stockData = [],     isLoading: stockLoading }    = useStockOnHand({ isActive: true });
  const { data: turnoverData = [] } = useInventoryTurnover();
  const { data: slowData = [] }     = useSlowMoving();
  const { data: monthlyTotal = [] } = useMonthlyTotal(12);
  const { data: monthlyMovement = [] } = useMovementMonthly({ months: 12 });

  const isLoading = stockLoading;

  // ── Calculate top-level KPIs ─────────────────────────────────────────────
  const kpi = useMemo(() => {
    // Total inventory value (Moving Avg)
    let invValueMA = 0;
    let invValueStd = 0;
    let totalAbsVariance = 0;
    let totalStdBasis = 0;

    for (const s of stockData) {
      const stock = Number(s.current_stock);
      const ma = Number(s.moving_avg);
      const std = Number(s.std_cost);
      invValueMA  += stock * ma;
      invValueStd += stock * std;
      if (std > 0) {
        totalAbsVariance += Math.abs(stock * (ma - std));
        totalStdBasis    += stock * std;
      }
    }
    const variancePct = totalStdBasis > 0 ? (totalAbsVariance / totalStdBasis) * 100 : 0;

    // COGS proxy: out value over last 12 months (absolute)
    const cogs12mo = monthlyTotal.reduce((sum, m) => sum + Number(m.out_value ?? 0), 0);

    // Inventory Turnover (annualized)
    const turnover = invValueMA > 0 ? cogs12mo / invValueMA : 0;

    // DIO (Days Inventory Outstanding)
    const dio = turnover > 0 ? 365 / turnover : 999;

    // Annual carrying cost (estimated)
    const carryingCostAnnual = invValueMA * carryingRate;

    // Dead Stock value + count
    let deadValue = 0, deadCount = 0, slowValue = 0, slowCount = 0;
    for (const row of slowData) {
      const val = Number(row.stock_value);
      if (row.movement_status === 'dead_stock') {
        deadValue += val; deadCount++;
      } else if (row.movement_status === 'slow_moving') {
        slowValue += val; slowCount++;
      }
    }
    const deadPct = invValueMA > 0 ? (deadValue / invValueMA) * 100 : 0;

    return {
      invValueMA, invValueStd,
      variancePct,
      cogs12mo, turnover, dio,
      carryingCostAnnual,
      deadValue, deadCount, slowValue, slowCount, deadPct,
    };
  }, [stockData, monthlyTotal, slowData, carryingRate]);

  // ── Turnover by Group ────────────────────────────────────────────────────
  const turnoverByGroup = useMemo(() => {
    // Aggregate inventory value per group from stockData
    const valueByGroup = new Map<string, number>();
    for (const s of stockData) {
      const v = Number(s.current_stock) * Number(s.moving_avg);
      valueByGroup.set(s.group_name, (valueByGroup.get(s.group_name) ?? 0) + v);
    }

    // Aggregate COGS per group from monthlyMovement
    // Note: useMovementMonthly aggregates whole-business; we'd need useMonthlySummary
    // for group breakdown, but use turnoverData (per-item) as the source for group rollup
    const cogsByGroup = new Map<string, number>();
    for (const t of turnoverData) {
      // turnover data has annual_cogs and group_name
      cogsByGroup.set(t.group_name, (cogsByGroup.get(t.group_name) ?? 0) + Number(t.annual_cogs ?? 0));
    }

    return Array.from(valueByGroup.entries()).map(([group, value]) => {
      const cogs = cogsByGroup.get(group) ?? 0;
      const turnover = value > 0 ? cogs / value : 0;
      const dio = turnover > 0 ? 365 / turnover : 999;
      return {
        short: group.split('-')[0].trim().slice(0, 12),
        group,
        value,
        cogs,
        turnover,
        dio,
      };
    }).sort((a, b) => b.value - a.value);
  }, [stockData, turnoverData]);

  // ── Cost composition donut by group ──────────────────────────────────────
  const compositionData = useMemo(() => {
    return turnoverByGroup.map((g, idx) => ({
      name: g.short,
      value: g.value,
      color: GROUP_COLORS[idx % GROUP_COLORS.length],
    }));
  }, [turnoverByGroup]);

  // ── Active vs Slow vs Dead by Group (stacked) ─────────────────────────────
  const stockHealthByGroup = useMemo(() => {
    type Bucket = { group: string; short: string; active: number; slow: number; dead: number };
    const map = new Map<string, Bucket>();
    for (const row of slowData) {
      const key = row.group_name;
      const existing = map.get(key) ?? {
        group: key,
        short: key.split('-')[0].trim().slice(0, 12),
        active: 0, slow: 0, dead: 0,
      };
      const v = Number(row.stock_value);
      if (row.movement_status === 'dead_stock')      existing.dead   += v;
      else if (row.movement_status === 'slow_moving') existing.slow   += v;
      else                                            existing.active += v;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => (b.active + b.slow + b.dead) - (a.active + a.slow + a.dead));
  }, [slowData]);

  // ── Monthly cost variance trend ──────────────────────────────────────────
  const monthlyVarianceTrend = useMemo(() => {
    return monthlyMovement.map(m => ({
      month: m.month,
      label: new Date(m.month).toLocaleDateString('th-TH', { month: 'short' }),
      inValue:  m.In,
      outValue: m.Out,
      net:      m.In - m.Out,
    }));
  }, [monthlyMovement]);

  // ── Top Items by "Holding Cost" — high value × low turnover (cash trapped) ─
  const topHoldingCost = useMemo(() => {
    const items = turnoverData
      .filter(t => Number(t.current_stock_value ?? 0) > 0)
      .map(t => {
        const value    = Number(t.current_stock_value);
        const turnover = Number(t.turnover_ratio ?? 0);
        // "Holding score" = value × (1 / max(turnover, 0.1))  →  ของแพง × หมุนช้า ขึ้นบนสุด
        const holdScore = value * (1 / Math.max(turnover, 0.1));
        return {
          item_code: t.item_code,
          itemname:  t.itemname,
          group:     t.group_name,
          value,
          turnover,
          dio: turnover > 0 ? 365 / turnover : 999,
          annual_carrying: value * carryingRate,
          holdScore,
        };
      })
      .sort((a, b) => b.holdScore - a.holdScore)
      .slice(0, 15);
    return items;
  }, [turnoverData, carryingRate]);

  const handleExport = () => {
    exportToExcel(turnoverByGroup.map(g => ({
      'Group':                 g.group,
      'Inventory Value (MA)':  g.value,
      'Annual COGS':           g.cogs,
      'Turnover Ratio':        Number(g.turnover.toFixed(2)),
      'Days Inventory':        g.dio < 999 ? Math.round(g.dio) : 'N/A',
      'Carrying Cost (Est)':   Math.round(g.value * carryingRate),
    })), `Cost_Analytics_${new Date().toISOString().split('T')[0]}`);
  };

  if (isLoading) {
    return (
      <div className="card text-center py-20" style={{ color: 'var(--text-muted)' }}>
        <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        กำลังโหลดข้อมูลและคำนวณอัตราส่วน...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Carrying Cost Rate:
            </label>
            <select
              value={carryingRate}
              onChange={e => setCarryingRate(Number(e.target.value))}
              className="select"
            >
              <option value="0.15">15% / ปี (Low — แห้ง/ของไม่เสีย)</option>
              <option value="0.22">22% / ปี (Industry Average) ⭐</option>
            </select>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              ใช้ประมาณค่า "เงินจมต่อปี"
            </span>
          </div>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Top KPI Strip — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <RatioCard
          icon={<TrendingUp size={14} />}
          label="Inventory Turnover"
          value={`${kpi.turnover.toFixed(2)}×`}
          sub={`/ปี · COGS ${formatCompact(kpi.cogs12mo)}`}
          color={kpi.turnover >= 4 ? '#16a34a' : kpi.turnover >= 1 ? '#d97706' : '#dc2626'}
          hint="ยิ่งสูง = ของหมุนเร็ว"
        />
        <RatioCard
          icon={<Clock size={14} />}
          label="Days Inventory (DIO)"
          value={kpi.dio < 999 ? `${Math.round(kpi.dio)} วัน` : 'N/A'}
          sub="365 / Turnover"
          color={kpi.dio <= 90 ? '#16a34a' : kpi.dio <= 180 ? '#d97706' : '#dc2626'}
          hint="ของอยู่ในคลังเฉลี่ยกี่วัน"
        />
        <RatioCard
          icon={<DollarSign size={14} />}
          label="Working Capital"
          value={`฿${formatCompact(kpi.invValueMA)}`}
          sub="เงินจมในคลัง"
          color="#1F3864"
          hint="มูลค่ารวม (Moving Avg)"
        />
        <RatioCard
          icon={<TrendingDown size={14} />}
          label="Carrying Cost (Est)"
          value={`฿${formatCompact(kpi.carryingCostAnnual)}`}
          sub={`/ปี @ ${(carryingRate * 100).toFixed(0)}%`}
          color="#dc2626"
          hint="ค่าแบกของสต็อกต่อปี"
        />
        <RatioCard
          icon={<AlertTriangle size={14} />}
          label="Dead Stock"
          value={`${kpi.deadPct.toFixed(1)}%`}
          sub={`${kpi.deadCount} items · ฿${formatCompact(kpi.deadValue)}`}
          color={kpi.deadPct <= 5 ? '#16a34a' : kpi.deadPct <= 15 ? '#d97706' : '#dc2626'}
          hint="ไม่ขยับ ≥ 180 วัน"
        />
        <RatioCard
          icon={<Layers size={14} />}
          label="Cost Variance"
          value={`${kpi.variancePct.toFixed(1)}%`}
          sub="|MA − Std| / Std"
          color={kpi.variancePct <= 5 ? '#16a34a' : kpi.variancePct <= 15 ? '#d97706' : '#dc2626'}
          hint="ความต่าง MA vs Std"
        />
      </div>

      {/* Reading guide for the KPI strip */}
      <div className="card text-xs" style={{ color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>📚 วิธีอ่านอัตราส่วน:</strong>
        <ul className="list-disc ml-5 mt-1 space-y-0.5">
          <li><strong>Inventory Turnover</strong> = COGS / Inventory — ยิ่งสูง สินค้าหมุนเวียนเร็ว · มาตรฐานธุรกิจอาหาร ≥ 4×/ปี</li>
          <li><strong>DIO (Days Inventory Outstanding)</strong> = 365 / Turnover — สำหรับอาหาร ควร ≤ 90 วัน</li>
          <li><strong>Carrying Cost</strong> = ต้นทุนที่จม + ดอกเบี้ย + ค่าเช่าคลัง + ค่าเสื่อม + ค่าประกัน — ประมาณ 20-30%/ปี ของมูลค่าสต็อก</li>
          <li><strong>Dead Stock %</strong> = สัดส่วนของที่ไม่เคลื่อนไหวเลย 180 วัน — KPI สำคัญ ควร &lt; 5%</li>
          <li><strong>Cost Variance</strong> = ความแตกต่างระหว่าง Moving Avg vs Std Cost — ถ้าสูงแสดงว่าราคาซื้อขึ้นลงเยอะ ควรอัปเดต Std Cost</li>
        </ul>
      </div>

      {/* Charts Row 1: Composition + Turnover by Group */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost Composition Donut */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            💰 Cost Composition by Group
          </h4>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={compositionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {compositionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v?: number | string) => `฿${formatCompact(Number(v ?? 0))}`} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
            สัดส่วนมูลค่าสต็อกของแต่ละกลุ่ม — เห็นว่า "เงินจม" อยู่ในกลุ่มไหนมากที่สุด
          </p>
        </div>

        {/* Turnover by Group */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            🔄 Inventory Turnover by Group
          </h4>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={turnoverByGroup} margin={{ top: 5, right: 10, bottom: 40, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="short" stroke="var(--text-muted)" fontSize={10} angle={-30} textAnchor="end" height={60} interval={0} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `${Number(v).toFixed(1)}x`} />
                <Tooltip
                  formatter={(v?: number | string, name?: string) => {
                    if (name === 'Turnover') return [`${Number(v ?? 0).toFixed(2)}x/ปี`, name];
                    if (name === 'DIO')      return [`${Math.round(Number(v ?? 0))} วัน`, name];
                    return [String(v ?? ''), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="turnover" name="Turnover" radius={[3, 3, 0, 0]}>
                  {turnoverByGroup.map((g, i) => (
                    <Cell key={i} fill={g.turnover >= 4 ? '#16a34a' : g.turnover >= 1 ? '#d97706' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
            🟢 ≥ 4×/ปี (ดี) · 🟠 1-4× (ปานกลาง) · 🔴 &lt; 1× (ของค้าง)
          </p>
        </div>
      </div>

      {/* Charts Row 2: Stock Health by Group + Variance Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock Health Stack */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            ⚡ Active vs Slow vs Dead by Group
          </h4>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockHealthByGroup} margin={{ top: 5, right: 10, bottom: 40, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="short" stroke="var(--text-muted)" fontSize={10} angle={-30} textAnchor="end" height={60} interval={0} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `฿${formatCompact(Number(v))}`} />
                <Tooltip formatter={(v?: number | string) => `฿${formatCompact(Number(v ?? 0))}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="active" name="Active" stackId="health" fill="#16a34a" />
                <Bar dataKey="slow"   name="Slow"   stackId="health" fill="#d97706" />
                <Bar dataKey="dead"   name="Dead"   stackId="health" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
            มูลค่าสต็อกแยกตามสุขภาพการหมุนเวียน — กลุ่มที่แดงเยอะ = ของค้างเยอะ
          </p>
        </div>

        {/* Monthly In/Out + Net Trend */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            📈 Monthly In/Out + Net Cost Flow
          </h4>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyVarianceTrend} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `฿${formatCompact(Number(v))}`} />
                <Tooltip formatter={(v?: number | string) => `฿${formatCompact(Number(v ?? 0))}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="inValue"  name="In"  fill="#16a34a" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outValue" name="Out" fill="#dc2626" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#1F3864" strokeWidth={2} dot={{ r: 3, fill: '#1F3864' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
            มูลค่ารับเข้า/จ่ายออก 12 เดือน + เส้น Net — ดู cash flow ของสต็อก
          </p>
        </div>
      </div>

      {/* Top Holding Cost Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <DollarSign size={15} style={{ color: 'var(--text-muted)' }} />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Top 15 — เงินจมมากที่สุด (Value × Slow Turnover)
          </h4>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
            ของแพง × หมุนช้า = priority 1 ของการระบาย
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Item Code</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Item Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Group</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Inv Value</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Turnover</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">DIO</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Annual Carry</th>
              </tr>
            </thead>
            <tbody>
              {topHoldingCost.map((row, idx) => (
                <tr key={row.item_code} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2 text-center text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--color-primary-light)' }}>
                    {row.item_code}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.itemname}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {row.group.split('-')[0]}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">
                    ฿{formatCompact(row.value)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    <span style={{ color: row.turnover >= 4 ? '#16a34a' : row.turnover >= 1 ? '#d97706' : '#dc2626' }}>
                      {row.turnover.toFixed(2)}x
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {row.dio < 999 ? `${Math.round(row.dio)}d` : '∞'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: '#dc2626' }}>
                    ฿{formatCompact(row.annual_carrying)}
                  </td>
                </tr>
              ))}
              {topHoldingCost.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reading guide */}
      <div className="card text-xs" style={{ color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>💡 วิธีใช้รายงานนี้:</strong>
        <ul className="list-disc ml-5 mt-1 space-y-0.5">
          <li><strong>ดู KPI ด้านบน</strong> — ถ้าทั้ง 6 ตัวเป็นสีเขียว = ระบบหมุนเวียนสุขภาพดี</li>
          <li><strong>ดู Donut Composition</strong> — กลุ่มไหนกินเงินไปเท่าไร → focus ที่กลุ่มใหญ่</li>
          <li><strong>ดู Turnover by Group</strong> — กลุ่มที่สีแดง (&lt; 1x/ปี) ต้องเร่งระบาย</li>
          <li><strong>ดู Stock Health</strong> — กลุ่มไหนมี Dead Stock (แดง) เยอะ → write-off / clearance</li>
          <li><strong>ดู Top Holding Cost</strong> — รายการที่ต้อง Action ก่อน เพราะ "เงินจมต่อปี" สูงสุด</li>
        </ul>
      </div>
    </div>
  );
}

// ── Ratio Card ───────────────────────────────────────────────────────────────
function RatioCard({ icon, label, value, sub, color, hint }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  hint?: string;
}) {
  return (
    <div className="card border-l-4" style={{ borderLeftColor: color }} title={hint}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
