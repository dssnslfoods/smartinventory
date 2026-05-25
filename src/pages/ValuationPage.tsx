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
import { InfoTooltip } from '@/components/InfoTooltip';

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

  // NOTE: no isActive filter — Working Capital counts ALL stock we physically
  // hold (incl. discontinued items), to match Dashboard + Stock On-Hand.
  const { data: stockData, isLoading } = useStockOnHand({
    warehouse: warehouse || undefined,
    groupCode,
  });
  const { data: monthlyData } = useMovementMonthly({ warehouse: warehouse || undefined, months: 12 });

  // current_stock is now the physical lot snapshot (inventory_lots) — always
  // ≥ 0 and free of transfer inflation. Keep lines that hold stock, consistent
  // with Dashboard's Working Capital.
  const positiveStock = useMemo(
    () => (stockData ?? []).filter(s => Number(s.current_stock) !== 0),
    [stockData],
  );
  // Insight: discontinued (is_active=false) items that still hold stock.
  const inactiveWithStock = useMemo(() => {
    const rows = positiveStock.filter(s => (s as any).is_active === false && Number(s.current_stock) > 0);
    return {
      count: rows.length,
      value: rows.reduce((sum, s) => sum + Number(s.current_stock) * Number(s.moving_avg), 0),
    };
  }, [positiveStock]);

  const totals = useMemo(() => {
    let maValue = 0, stdValue = 0;
    for (const s of positiveStock) {
      const stock = Number(s.current_stock);
      maValue += stock * Number(s.moving_avg);
      stdValue += stock * Number(s.std_cost);
    }
    return { maValue, stdValue, items: positiveStock.length };
  }, [positiveStock]);

  const groupBreakdown = useMemo(() => {
    const map = new Map<string, { group: string; maValue: number; stdValue: number; count: number }>();
    for (const s of positiveStock) {
      const key = s.group_name;
      const prev = map.get(key) ?? { group: key, maValue: 0, stdValue: 0, count: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      prev.count++;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [positiveStock]);

  const whsBreakdown = useMemo(() => {
    const map = new Map<string, { warehouse: string; whsName: string; maValue: number; stdValue: number }>();
    for (const s of positiveStock) {
      const key = s.warehouse;
      const prev = map.get(key) ?? { warehouse: key, whsName: s.whs_name, maValue: 0, stdValue: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.maValue - a.maValue);
  }, [positiveStock]);

  const varianceData = useMemo(() => {
    const map = new Map<string, { item_code: string; itemname: string; moving_avg: number; std_cost: number; variance: number; stock: number }>();
    for (const s of positiveStock) {
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
  }, [positiveStock]);

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

      {/* Inactive-items-with-stock insight */}
      {inactiveWithStock.count > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg"
             style={{ backgroundColor: 'rgba(234,88,12,0.07)', border: '1px solid rgba(234,88,12,0.25)' }}>
          <span className="text-base leading-none mt-0.5">📦</span>
          <div className="text-xs leading-relaxed" style={{ color: '#9a3412' }}>
            <strong>{formatNumber(inactiveWithStock.count)} รายการที่เลิกขายแล้ว (inactive) แต่ยังมีสต็อกค้าง</strong>
            {' '}มูลค่า <strong>{formatCurrency(inactiveWithStock.value)}</strong> — รวมอยู่ใน Inventory Value ด้านบน
            (เพราะเป็นเงินจมจริง) · แนะนำให้เร่งระบายหรือ write-off เพื่อปลดล็อก Working Capital
          </div>
        </div>
      )}

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
            {whsBreakdown.length > 0 && (() => {
              const totMA  = whsBreakdown.reduce((s, r) => s + r.maValue, 0);
              const totStd = whsBreakdown.reduce((s, r) => s + r.stdValue, 0);
              const totVar = totMA - totStd;
              return (
                <tfoot>
                  <tr className="border-t-2 font-bold"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                    <td className="font-bold">รวม</td>
                    <td style={{ color: 'var(--text-muted)' }}>{whsBreakdown.length} คลัง</td>
                    <td className="text-right font-mono font-bold">{formatCurrency(totMA)}</td>
                    <td className="text-right font-mono font-bold">{formatCurrency(totStd)}</td>
                    <td className={`text-right font-mono font-bold ${totVar >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totVar)}
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
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

  // No isActive filter — count all physically-held stock, consistent with the
  // Overview tab + Dashboard. current_stock > 0 is enforced in the loops below.
  const { data: stockData = [],     isLoading: stockLoading }    = useStockOnHand();
  const { data: turnoverData = [] } = useInventoryTurnover();
  const { data: slowData = [] }     = useSlowMoving();
  // Fetch 24 months so we can take the last 12 with actual data
  // (Option A fix — anchor on data, not today)
  const { data: monthlyTotal = [] } = useMonthlyTotal(24);
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
      if (stock === 0) continue;   // lot-based physical stock (≥ 0); skip empty
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

    // COGS proxy: last 12 months OF ACTUAL DATA (not a 12-month calendar
    // window from today). Anchors on the data so stale imports don't
    // artificially inflate DIO. monthlyTotal is ASC-ordered.
    const last12 = monthlyTotal.slice(-12);
    const cogs12mo = last12.reduce((sum, m) => sum + Number(m.out_value ?? 0), 0);
    const monthsCounted = last12.length;

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
      cogs12mo, turnover, dio, monthsCounted,
      carryingCostAnnual,
      deadValue, deadCount, slowValue, slowCount, deadPct,
    };
  }, [stockData, monthlyTotal, slowData, carryingRate]);

  // ── Turnover by Group ────────────────────────────────────────────────────
  const turnoverByGroup = useMemo(() => {
    // Aggregate inventory value per group from stockData
    const valueByGroup = new Map<string, number>();
    for (const s of stockData) {
      const stock = Number(s.current_stock);
      if (stock === 0) continue;   // lot-based physical stock (≥ 0); skip empty
      const v = stock * Number(s.moving_avg);
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

      {/* ── Comprehensive explanation card (collapsible) ── */}
      <ExplanationCard carryingRate={carryingRate} />

      {/* Top KPI Strip — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <RatioCard
          icon={<TrendingUp size={14} />}
          label="Inventory Turnover"
          value={`${kpi.turnover.toFixed(2)}×`}
          sub={`${kpi.monthsCounted}mo data · COGS ฿${formatCompact(kpi.cogs12mo)}`}
          color={kpi.turnover >= 4 ? '#16a34a' : kpi.turnover >= 1 ? '#d97706' : '#dc2626'}
          tooltipTitle="Inventory Turnover (อัตราหมุนเวียนสต็อก)"
          tooltip={<>
            <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
              Turnover = COGS (12 mo) / Inventory Value
            </p>
            <p className="mb-2">บอกว่าสต็อก "หมุนกี่รอบต่อปี" — ยิ่งสูง = ของขายออกเร็ว</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≥ 4×/ปี = ดี (มาตรฐานอาหาร)</li>
              <li>🟠 1-4× = ปานกลาง</li>
              <li>🔴 &lt; 1× = ของค้างนาน (เสี่ยงหมดอายุ)</li>
            </ul>
            <p className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              <strong>COGS</strong> = ยอด Out direction (Delivery + Goods Issue + Return) ·
              ตรงตามที่บัญชีใช้
            </p>
          </>}
        />
        <RatioCard
          icon={<Clock size={14} />}
          label="Days Inventory (DIO)"
          value={kpi.dio < 999 ? `${Math.round(kpi.dio)} วัน` : 'N/A'}
          sub="365 / Turnover"
          color={kpi.dio <= 90 ? '#16a34a' : kpi.dio <= 180 ? '#d97706' : '#dc2626'}
          tooltipTitle="Days Inventory Outstanding"
          tooltip={<>
            <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
              DIO = 365 / Turnover Ratio
            </p>
            <p className="mb-2">ของอยู่ในคลังเฉลี่ย <strong>กี่วัน</strong> ก่อนถูกขายออก</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≤ 90 วัน = ดี (สำหรับอาหาร)</li>
              <li>🟠 90-180 วัน = ระวัง</li>
              <li>🔴 &gt; 180 วัน = ของค้างจริง</li>
            </ul>
          </>}
        />
        <RatioCard
          icon={<DollarSign size={14} />}
          label="Working Capital"
          value={`฿${formatCompact(kpi.invValueMA)}`}
          sub="เงินจมในคลัง"
          color="#1F3864"
          tooltipTitle="Working Capital in Inventory"
          tooltip={<>
            <p className="mb-2"><strong>มูลค่ารวม Moving Average</strong> ของสินค้าทุกตัวในคลัง</p>
            <p className="mb-2">= "เงินสด" ที่บริษัท <strong>จมไว้ในของ</strong> ตอนนี้</p>
            <p className="mb-2 text-[11px] p-2 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
              <strong>Moving Avg (WAC ฝั่งรับเข้า)</strong> = Σ มูลค่ารับเข้า (In + ปรับต้นทุน) ÷ Σ จำนวนรับเข้า
              คำนวณ as-of วันที่ snapshot ล่าสุดจาก transactions (ไม่ใช้ค่า master คงที่)
            </p>
            <p>ยิ่งสูง → ยิ่งเสีย Carrying Cost ต่อปี (ดูการ์ดถัดไป)</p>
          </>}
        />
        <RatioCard
          icon={<TrendingDown size={14} />}
          label="Carrying Cost (Est)"
          value={`฿${formatCompact(kpi.carryingCostAnnual)}`}
          sub={`/ปี @ ${(carryingRate * 100).toFixed(0)}%`}
          color="#dc2626"
          tooltipTitle="Carrying Cost (ต้นทุนแบกของสต็อก)"
          tooltip={<>
            <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
              Carrying Cost = Inventory × Rate
            </p>
            <p className="mb-2"><strong>ต้นทุนแอบแฝง</strong>ที่บริษัทเสียทุกปี เพียงเพราะมีของในคลัง — รวม:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>💵 ดอกเบี้ย / Opportunity Cost</li>
              <li>🏭 ค่าเช่าคลัง + ตู้แช่</li>
              <li>🛡️ ประกัน + ภาษี</li>
              <li>🗑️ ของเสีย / หมดอายุ</li>
            </ul>
            <p className="mt-2"><strong>ดู Card อธิบายด้านบนสำหรับรายละเอียด</strong></p>
          </>}
        />
        <RatioCard
          icon={<AlertTriangle size={14} />}
          label="Dead Stock"
          value={`${kpi.deadPct.toFixed(1)}%`}
          sub={`${formatNumber(kpi.deadCount, 0)} items · ฿${formatCompact(kpi.deadValue)}`}
          color={kpi.deadPct <= 5 ? '#16a34a' : kpi.deadPct <= 15 ? '#d97706' : '#dc2626'}
          tooltipTitle="Dead Stock"
          tooltip={<>
            <p className="mb-2">สินค้าที่ <strong>ไม่มีการเคลื่อนไหวเลย ≥ 180 วัน</strong></p>
            <p className="mb-2">= ของค้างคลังจริง — เสียพื้นที่ + เสีย Carrying Cost</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≤ 5% = สุขภาพดี</li>
              <li>🟠 5-15% = เริ่มเสี่ยง</li>
              <li>🔴 &gt; 15% = ต้องเร่งระบาย</li>
            </ul>
            <p className="mt-2"><strong>Action:</strong> ดูที่หน้า Reports → Slow Moving</p>
          </>}
        />
        <RatioCard
          icon={<Layers size={14} />}
          label="Cost Variance"
          value={`${kpi.variancePct.toFixed(1)}%`}
          sub="|MA − Std| / Std"
          color={kpi.variancePct <= 5 ? '#16a34a' : kpi.variancePct <= 15 ? '#d97706' : '#dc2626'}
          tooltipTitle="Cost Variance (ต้นทุน MA vs Std)"
          tooltip={<>
            <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
              Variance = |MA − Std| / Std × 100
            </p>
            <p className="mb-2">ความแตกต่างระหว่าง <strong>Moving Avg</strong> vs <strong>Std Cost</strong></p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≤ 5% = ใกล้เคียง — Std Cost ยังใช้ได้</li>
              <li>🟠 5-15% = เริ่มห่าง — ควรพิจารณาอัปเดต</li>
              <li>🔴 &gt; 15% = ห่างไกล — ต้องอัปเดต Std Cost</li>
            </ul>
            <p className="mt-2">ถ้าสูง = ราคาตลาดเปลี่ยนเยอะ การคำนวณบัญชีจะคลาดเคลื่อน</p>
          </>}
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
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1" style={{ color: 'var(--text)' }}>
            💰 Cost Composition by Group
            <InfoTooltip title="Cost Composition คืออะไร?">
              <p className="mb-2">
                Donut นี้แสดง <strong>สัดส่วนมูลค่าสต็อก</strong> ของแต่ละกลุ่มสินค้า — บอกว่า "เงินจม" อยู่กลุ่มไหนมากที่สุด
              </p>
              <p className="mb-2"><strong>วิธีอ่าน:</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>ส่วนใหญ่ของวงกลม = กลุ่มที่กิน working capital สูงสุด</li>
                <li>กลุ่มไหน "ใหญ่" แสดงว่ามีของมูลค่าสูงสะสมเยอะ</li>
              </ul>
              <p className="mt-2"><strong>ใช้ตัดสินใจ:</strong> ถ้าวงกลมส่วนใหญ่เป็น FRM (วัตถุดิบ) แต่ขายดีน้อย → ต้องลดสต็อก</p>
            </InfoTooltip>
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
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1" style={{ color: 'var(--text)' }}>
            🔄 Inventory Turnover by Group
            <InfoTooltip title="Inventory Turnover คืออะไร?">
              <p className="mb-2">
                อัตรา "หมุนเวียน" สต็อก = <strong>กี่ครั้งต่อปี</strong> ที่ของถูกขายและเติมใหม่
              </p>
              <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                Turnover = COGS / มูลค่าสต็อกเฉลี่ย
              </p>
              <p className="mb-2"><strong>เกณฑ์อ่านสีกราฟ:</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>🟢 <strong>≥ 4×/ปี</strong> — ของหมุนเวียนดี (ของอยู่ในคลังไม่เกิน 3 เดือน)</li>
                <li>🟠 <strong>1-4×/ปี</strong> — ปานกลาง</li>
                <li>🔴 <strong>&lt; 1×/ปี</strong> — ของค้าง (อยู่ในคลังเกิน 1 ปี!)</li>
              </ul>
              <p className="mt-2"><strong>มาตรฐาน Food Service:</strong> ควร ≥ 4×/ปี ขึ้นไป (เพราะอาหารหมดอายุ)</p>
            </InfoTooltip>
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
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1" style={{ color: 'var(--text)' }}>
            ⚡ Active vs Slow vs Dead by Group
            <InfoTooltip title="สุขภาพสต็อก 3 ระดับ">
              <p className="mb-2">
                แท่ง stacked แสดง <strong>มูลค่าสต็อก</strong> ของแต่ละกลุ่ม แบ่งตามการเคลื่อนไหวล่าสุด:
              </p>
              <ul className="list-disc ml-4 space-y-1 mb-2">
                <li>🟢 <strong>Active</strong> — เคลื่อนไหวภายใน 90 วันที่ผ่านมา (สุขภาพดี)</li>
                <li>🟠 <strong>Slow Moving</strong> — เคลื่อนไหวล่าสุด 90-179 วันที่แล้ว (เริ่มเสี่ยง)</li>
                <li>🔴 <strong>Dead Stock</strong> — ไม่มีการเคลื่อนไหว ≥ 180 วัน (ของค้าง!)</li>
              </ul>
              <p><strong>ใช้ตัดสินใจ:</strong> กลุ่มที่มีแท่ง 🔴 แดงเยอะ = ต้องเร่ง <strong>write-off</strong> หรือ <strong>clearance</strong> ก่อนหมดอายุ</p>
            </InfoTooltip>
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
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1" style={{ color: 'var(--text)' }}>
            📈 Monthly In/Out + Net Cost Flow
            <InfoTooltip title="Cash Flow ของสต็อก">
              <p className="mb-2">กราฟนี้แสดง <strong>การไหลของเงิน 12 เดือน</strong> ผ่านสต็อก:</p>
              <ul className="list-disc ml-4 space-y-1 mb-2">
                <li>🟢 <strong>แท่งเขียว (In)</strong> — มูลค่าที่ "รับเข้า" คลัง (สั่งซื้อ/ส่งคืน)</li>
                <li>🔴 <strong>แท่งแดง (Out)</strong> — มูลค่าที่ "จ่ายออก" (ขาย/ใช้งาน)</li>
                <li>🔵 <strong>เส้นน้ำเงิน (Net)</strong> — ผลต่าง = In − Out</li>
              </ul>
              <p className="mb-2"><strong>วิธีอ่าน:</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Net เป็น <strong>บวก</strong> → สต็อกเพิ่มเดือนนั้น</li>
                <li>Net เป็น <strong>ลบ</strong> → ขายของออกมากกว่ารับเข้า</li>
                <li>เดือนที่แท่งสูงทั้งคู่ → ฤดูกาล (เช่น Q4 ปลายปี)</li>
              </ul>
            </InfoTooltip>
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
          <h4 className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--text)' }}>
            Top 15 — เงินจมมากที่สุด (Value × Slow Turnover)
            <InfoTooltip title="วิธีคำนวณ Holding Score">
              <p className="mb-2">รายการเรียงตาม "ระดับความเสี่ยงเงินจม" สูงสุดด้านบน</p>
              <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                Hold Score = Inv Value × (1 / Turnover)
              </p>
              <p className="mb-2"><strong>แปลว่า:</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>ของแพง + หมุนช้า → อันดับสูง (priority สูง)</li>
                <li>ของถูก + หมุนเร็ว → อันดับล่าง</li>
              </ul>
              <p className="mt-2"><strong>คอลัมน์ Annual Carry</strong> = ค่าใช้จ่ายต่อปีที่เสียไปกับการ "เก็บ" SKU นี้ (ไม่ใช่ค่าซื้อ — ค่า hidden cost)</p>
            </InfoTooltip>
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
function RatioCard({ icon, label, value, sub, color, hint, tooltipTitle, tooltip }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  hint?: string;
  tooltipTitle?: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="card border-l-4" style={{ borderLeftColor: color }} title={hint}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {icon}<span className="flex-1">{label}</span>
        {tooltip && (
          <InfoTooltip title={tooltipTitle ?? label} size={12}>
            {tooltip}
          </InfoTooltip>
        )}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

// ── Explanation Card — collapsible deep-dive into Cost Analytics concepts ────
function ExplanationCard({ carryingRate }: { carryingRate: number }) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return sessionStorage.getItem('cost-analytics-explain') !== '0'; }
    catch { return true; }
  });
  const toggle = () => {
    setExpanded(prev => {
      const next = !prev;
      try { sessionStorage.setItem('cost-analytics-explain', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  return (
    <div className="card p-0 overflow-hidden" style={{ borderLeft: '4px solid #2E75B6' }}>
      <button
        onClick={toggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-alt)] transition-colors"
        style={{ borderBottom: expanded ? '1px solid var(--border)' : 'none' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📚</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            ทำความเข้าใจ Cost Analytics
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(46,117,182,0.1)', color: '#2E75B6' }}>
            อ่านก่อนใช้
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {expanded ? '▲ ย่อ' : '▼ ขยาย'}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          {/* What is Carrying Cost */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              💰 Carrying Cost Rate คืออะไร? (ใจกลางของรายงานนี้)
            </h5>
            <p className="mb-2">
              <strong>Carrying Cost</strong> = <strong>ต้นทุนการ "เก็บของไว้ในคลัง" ต่อปี</strong> — เป็น <strong>% ของมูลค่าสต็อก</strong>{' '}
              ที่บริษัท "จ่ายไปฟรีๆ" ทุกปีเพียงเพราะมีของอยู่
            </p>
            <div className="p-3 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
              <p className="font-mono text-[11px] mb-1" style={{ color: 'var(--text)' }}>
                Carrying Cost = Inventory Value × Carrying Rate (%/ปี)
              </p>
              <p className="text-[11px]">
                ตัวอย่าง: คลังมีของ ฿100M + Rate 22% = <strong style={{ color: '#dc2626' }}>เสีย ฿22M/ปี โดยไม่ได้ขาย!</strong>
              </p>
            </div>
          </section>

          {/* Components */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              🧩 Carrying Cost ประกอบด้วยอะไรบ้าง?
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ color: 'var(--text)', backgroundColor: 'var(--bg-alt)' }}>
                    <th className="text-left px-2 py-1.5">ต้นทุน</th>
                    <th className="text-left px-2 py-1.5">% โดยประมาณ</th>
                    <th className="text-left px-2 py-1.5">คำอธิบาย</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">💵 Cost of Capital</td>
                    <td className="px-2 py-1.5">6–12%</td>
                    <td className="px-2 py-1.5">ดอกเบี้ย / Opportunity Cost — เงินจมในของถ้าไม่จม เอาไปลงทุนได้</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">🏭 Storage</td>
                    <td className="px-2 py-1.5">2–5%</td>
                    <td className="px-2 py-1.5">ค่าเช่าคลัง, ค่าไฟตู้แช่, ค่าน้ำ, ค่าทำความสะอาด</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">🛡️ Insurance</td>
                    <td className="px-2 py-1.5">1–3%</td>
                    <td className="px-2 py-1.5">ประกันคลัง, ประกันของหาย/ไฟไหม้</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">💸 Taxes</td>
                    <td className="px-2 py-1.5">1–2%</td>
                    <td className="px-2 py-1.5">ภาษีโรงเรือน, ภาษีทรัพย์สิน</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">⚙️ Handling</td>
                    <td className="px-2 py-1.5">2–5%</td>
                    <td className="px-2 py-1.5">ค่าจ้างพนักงานคลัง, ค่าไฟฟ้า forklift, ค่าซ่อมบำรุง</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(220,38,38,0.05)' }}>
                    <td className="px-2 py-1.5"><strong>🗑️ Risk (สำคัญสำหรับอาหาร!)</strong></td>
                    <td className="px-2 py-1.5"><strong>5–15%</strong></td>
                    <td className="px-2 py-1.5"><strong>ของเสีย, หมดอายุ, ตกรุ่น, ขโมย, write-off</strong></td>
                  </tr>
                  <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                    <td className="px-2 py-1.5">รวม</td>
                    <td className="px-2 py-1.5">15–40%</td>
                    <td className="px-2 py-1.5">= Carrying Cost Rate</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* When to use which rate */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              🎯 ควรใช้ Rate ไหน?
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="p-3 rounded" style={{ backgroundColor: 'rgba(22,163,74,0.06)', borderLeft: '3px solid #16a34a' }}>
                <p className="font-semibold mb-1" style={{ color: '#16a34a' }}>15% / ปี (Low)</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>สินค้าแห้ง (น้ำตาล, แป้ง, เครื่องปรุง)</li>
                  <li>บรรจุภัณฑ์</li>
                  <li>ของที่ไม่ค่อยเสีย</li>
                </ul>
                <p className="mt-1 text-[10px]"><strong>เพราะ:</strong> ไม่ต้องตู้แช่ + ความเสี่ยง write-off ต่ำ</p>
              </div>
              <div className="p-3 rounded" style={{ backgroundColor: 'rgba(46,117,182,0.06)', borderLeft: '3px solid #2E75B6' }}>
                <p className="font-semibold mb-1" style={{ color: '#2E75B6' }}>22% / ปี (Industry Average) ⭐</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>ของกระป๋อง / Processed</li>
                  <li>ของแช่เย็น</li>
                  <li>Food Service ทั่วไป (เหมาะกับ NSL)</li>
                </ul>
                <p className="mt-1 text-[10px]"><strong>เพราะ:</strong> ค่าตู้แช่ + ความเสี่ยงปานกลาง</p>
              </div>
            </div>
          </section>

          {/* Real example */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              📊 ตัวอย่างจากข้อมูลจริง (Rate {(carryingRate * 100).toFixed(0)}%)
            </h5>
            <div className="p-3 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-alt)' }}>
              <p>คลังมี Working Capital ~฿3,496M (ตัวเลขจริง NSL)</p>
              <p className="font-mono mt-1">฿3,496M × {(carryingRate * 100).toFixed(0)}% = <strong style={{ color: '#dc2626' }}>฿{Math.round(3496 * carryingRate)}M / ปี</strong></p>
              <p className="mt-1">
                → บริษัทเสีย <strong style={{ color: '#dc2626' }}>~฿{Math.round(3496 * carryingRate / 365)}M ต่อวัน</strong> เพียงเพื่อ "เก็บของ"
              </p>
            </div>
          </section>

          {/* KPI explanations */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              📐 อัตราส่วนสำคัญในรายงานนี้
            </h5>
            <div className="space-y-2">
              <div>
                <p style={{ color: 'var(--text)' }}><strong>1. Inventory Turnover (อัตราหมุนเวียน)</strong></p>
                <p className="ml-4">= COGS / มูลค่าสต็อก · ยิ่งสูงยิ่งดี · มาตรฐานอาหาร ≥ 4×/ปี</p>
                <p className="ml-4 text-[10px] italic mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <strong>COGS</strong> = ยอด Out direction (Delivery + Goods Issue + Goods Return)
                  &nbsp;·&nbsp; ตรงตามที่บัญชีใช้ (ไม่นับ Transfers ระหว่างคลัง · ไม่นับ Cost adjustments)
                </p>
              </div>
              <div>
                <p style={{ color: 'var(--text)' }}><strong>2. Days Inventory (DIO)</strong></p>
                <p className="ml-4">= 365 / Turnover · ของอยู่ในคลังเฉลี่ยกี่วัน · อาหารควร ≤ 90 วัน</p>
              </div>
              <div>
                <p style={{ color: 'var(--text)' }}><strong>3. Working Capital</strong></p>
                <p className="ml-4">= มูลค่ารวม Moving Avg · "เงินจม" ในคลังตอนนี้</p>
              </div>
              <div>
                <p style={{ color: 'var(--text)' }}><strong>4. Dead Stock %</strong></p>
                <p className="ml-4">= ของไม่ขยับ 180 วัน / รวม · KPI สำคัญ ควร &lt; 5%</p>
              </div>
              <div>
                <p style={{ color: 'var(--text)' }}><strong>5. Cost Variance %</strong></p>
                <p className="ml-4">= |MA − Std| / Std × 100 · ถ้าสูงแสดงว่าราคาขึ้นลงเยอะ ควรอัปเดต Std Cost</p>
              </div>
            </div>
          </section>

          {/* Decision examples */}
          <section>
            <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              💡 ใช้รายงานนี้ตัดสินใจอะไรได้บ้าง?
            </h5>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>การสั่งซื้อ:</strong> Supplier เสนอ discount 10% ถ้าซื้อ 2 เท่า — คุ้มหรือไม่?
                <p className="ml-4 text-[10px]">ถ้า DIO เพิ่ม 6 เดือน → Carrying Cost เพิ่ม {(carryingRate * 50).toFixed(1)}% → <strong>ไม่คุ้ม</strong></p>
              </li>
              <li>
                <strong>การ Write-off:</strong> Dead Stock ฿1M เก็บไว้ปีหน้า = +฿{Math.round(1000 * carryingRate)}K Carry Cost
                → <strong>Write-off ตอนนี้ถูกกว่า</strong>
              </li>
              <li>
                <strong>การลด Stock:</strong> ลด Inventory 20% = ลด Carrying Cost 20% (ตามไปด้วย)
              </li>
              <li>
                <strong>การหา "เงินจม":</strong> ดูตาราง "Top 15 — เงินจมมากที่สุด" ด้านล่าง = priority list การระบาย
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
