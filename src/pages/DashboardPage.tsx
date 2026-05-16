import { useMemo } from 'react';
import {
  Package, Clock, ArrowLeftRight, RefreshCw,
  TrendingUp, TrendingDown, CalendarRange, Activity, AlertTriangle,
  Layers, Target, Banknote,
} from 'lucide-react';
import {
  ComposedChart, PieChart, BarChart,
  Area, Line, Bar, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  useKPI, useStockOnHand, useMovementMonthly,
  useTransactions, useDataDateRange,
  useSlowMoving,
  useLatestLotSnapshot, useLotAging, useMonthlyTotal,
} from '@/hooks/useSupabaseQuery';
import {
  formatNumber, formatCurrency, formatDate, formatDateTime,
  formatThaiMonthRange, formatCompact,
} from '@/utils/format';
import { HelpButton, HelpSection, HelpLegend } from '@/components/HelpButton';
import { InfoTooltip } from '@/components/InfoTooltip';

// ── Color tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  primary:   '#1F3864',
  primary2:  '#2E75B6',
  teal:      '#00897B',
  green:     '#16a34a',
  amber:     '#d97706',
  orange:    '#E65100',
  red:       '#dc2626',
  redDark:   '#7f1d1d',
  purple:    '#7c3aed',
  muted:     '#64748b',
};

const GROUP_COLORS = ['#1F3864', '#2E75B6', '#00897B', '#E65100', '#7B1FA2', '#C62828', '#0891B2'];

const WHS_TYPE_COLORS: Record<string, string> = {
  FG: '#1F3864', RM: '#2E75B6', PD: '#00897B',
  PK: '#E65100', QC: '#7B1FA2', CL: '#C62828',
  CO: '#C62828', WS: '#78909C', BT: '#2E75B6',
};

function getWhsColor(code: string): string {
  const prefix = code.split('-')[1]?.substring(0, 2) ?? '';
  return WHS_TYPE_COLORS[prefix] ?? WHS_TYPE_COLORS[code.split('-')[0]] ?? '#64748b';
}

const AGING_BUCKETS: Record<string, { label: string; color: string }> = {
  expired: { label: 'หมดอายุแล้ว',  color: '#7f1d1d' },
  '0-30':  { label: '≤ 30 วัน',     color: '#dc2626' },
  '31-60': { label: '31–60 วัน',    color: '#ea580c' },
  '61-90': { label: '61–90 วัน',    color: '#d97706' },
  '91-180':{ label: '91–180 วัน',   color: '#65a30d' },
  '180+':  { label: '> 180 วัน',    color: '#16a34a' },
  unknown: { label: 'ไม่ระบุ',       color: '#94a3b8' },
};

const MOVEMENT_HEALTH_COLORS = {
  normal:      '#16a34a',
  slow_moving: '#d97706',
  dead_stock:  '#dc2626',
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card, #fff)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
  },
  labelStyle: { color: 'var(--text)', fontWeight: 600 as const },
};

// ── Main Component ───────────────────────────────────────────────────────────
export function DashboardPage() {
  // === Data hooks ===
  const { data: kpi, isLoading: kpiLoading }            = useKPI();
  const { data: stockData = [] }                         = useStockOnHand();
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMovementMonthly({ months: 12 });
  // Pull just enough transactions for the "Top 10 Most Active" widget —
  // 50 rows is more than enough to compute a top-10 (was 200, 4× over-fetch).
  const { data: recentTx }                               = useTransactions({ page: 0, pageSize: 50 });
  const { data: dataDateRange }                          = useDataDateRange();
  const { data: slowData = [] }                          = useSlowMoving();
  const { data: latestSnapshot }                         = useLatestLotSnapshot();
  const { data: lotAging = [] }                          = useLotAging(latestSnapshot);
  const { data: monthlyTotal = [] }                      = useMonthlyTotal(12);

  // === Derived data ===
  const dateRange = useMemo(() => {
    if (!dataDateRange?.minDate || !dataDateRange?.maxDate) return null;
    return { min: dataDateRange.minDate, max: dataDateRange.maxDate };
  }, [dataDateRange]);

  const movementTrend = useMemo(
    () => monthlyData.map((m) => ({
      ...m, net: m.In - m.Out,
      label: new Date(m.month).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
    })),
    [monthlyData],
  );

  // ── Financial KPIs (Inventory Turnover, DIO, Carrying Cost) ────────────────
  const financialKpi = useMemo(() => {
    // Total inventory value (Moving Avg)
    const invValue = stockData.reduce((s, x) => s + Number(x.stock_value), 0);
    // 12-month COGS proxy = sum of out_value over last 12 months
    const cogs12mo = monthlyTotal.reduce((s, m) => s + Number(m.out_value ?? 0), 0);
    const turnover = invValue > 0 ? cogs12mo / invValue : 0;
    const dio = turnover > 0 ? Math.round(365 / turnover) : null;
    return { invValue, cogs12mo, turnover, dio };
  }, [stockData, monthlyTotal]);

  // ── Stock Movement Health (Active / Slow / Dead) ───────────────────────────
  const movementHealth = useMemo(() => {
    const counts = { normal: 0, slow_moving: 0, dead_stock: 0 };
    const values = { normal: 0, slow_moving: 0, dead_stock: 0 };
    for (const r of slowData) {
      const status = r.movement_status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
        values[status] += Number(r.stock_value);
      }
    }
    const total = counts.normal + counts.slow_moving + counts.dead_stock;
    return {
      counts, values, total,
      deadPct: total > 0 ? (counts.dead_stock / total) * 100 : 0,
    };
  }, [slowData]);

  // ── Lot Aging Distribution (for the donut) ─────────────────────────────────
  const agingData = useMemo(() => {
    const map = new Map<string, { lots: number; value: number }>();
    for (const a of lotAging) {
      const key = a.aging_bucket;
      const cur = map.get(key) ?? { lots: 0, value: 0 };
      cur.lots  += Number(a.lot_count);
      cur.value += Number(a.total_value);
      map.set(key, cur);
    }
    return Object.entries(AGING_BUCKETS).map(([key, meta]) => ({
      key,
      label: meta.label,
      color: meta.color,
      lots:  map.get(key)?.lots  ?? 0,
      value: map.get(key)?.value ?? 0,
    })).filter(b => b.lots > 0);
  }, [lotAging]);

  const totalAgingValue = agingData.reduce((s, b) => s + b.value, 0);
  const expiringSoon = useMemo(() => {
    const expired = agingData.find(a => a.key === 'expired') ?? { lots: 0, value: 0 };
    const soon30  = agingData.find(a => a.key === '0-30')   ?? { lots: 0, value: 0 };
    return {
      lots:  expired.lots  + soon30.lots,
      value: expired.value + soon30.value,
      expiredLots:  expired.lots,
      expiredValue: expired.value,
    };
  }, [agingData]);

  // ── Inventory Value by Group ───────────────────────────────────────────────
  const stockByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockData) {
      const name = (s.group_name ?? '').split('-')[0].trim();
      map.set(name, (map.get(name) ?? 0) + Number(s.stock_value));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockData]);

  const totalStockValue = useMemo(
    () => stockByGroup.reduce((sum, g) => sum + g.value, 0),
    [stockByGroup],
  );

  // ── Warehouse Stock Value ──────────────────────────────────────────────────
  const stockByWarehouse = useMemo(() => {
    const map = new Map<string, { warehouse: string; whs_name: string; value: number }>();
    for (const s of stockData) {
      const prev = map.get(s.warehouse) ?? { warehouse: s.warehouse, whs_name: s.whs_name, value: 0 };
      prev.value += Number(s.stock_value);
      map.set(s.warehouse, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [stockData]);

  // ── Top Moved Items (last 30 days from recent transactions) ────────────────
  const itemNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stockData) {
      if (!map.has(s.item_code)) {
        map.set(s.item_code, s.itemname || (s as any).item_name || '—');
      }
    }
    return map;
  }, [stockData]);

  const topMoved = useMemo(() => {
    if (!recentTx?.data) return [];
    const map = new Map<string, { item_code: string; totalIn: number; totalOut: number; totalMoved: number; txCount: number }>();
    for (const tx of recentTx.data) {
      const prev = map.get(tx.item_code) ?? { item_code: tx.item_code, totalIn: 0, totalOut: 0, totalMoved: 0, txCount: 0 };
      prev.totalIn += Number(tx.in_qty);
      prev.totalOut += Number(tx.out_qty);
      prev.totalMoved += Number(tx.in_qty) + Number(tx.out_qty);
      prev.txCount++;
      map.set(tx.item_code, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.totalMoved - a.totalMoved).slice(0, 10);
  }, [recentTx]);

  // ── MoM Comparison ─────────────────────────────────────────────────────────
  const mom = useMemo(() => {
    if (monthlyData.length < 2) return null;
    const curr = monthlyData[monthlyData.length - 1];
    const prev = monthlyData[monthlyData.length - 2];
    const pct = (c: number, p: number) => (p === 0 ? 0 : ((c - p) / Math.abs(p)) * 100);
    return {
      currMonth: curr.month,
      prevMonth: prev.month,
      inCurr: curr.In, inPrev: prev.In, inPct: pct(curr.In, prev.In),
      outCurr: curr.Out, outPrev: prev.Out, outPct: pct(curr.Out, prev.Out),
    };
  }, [monthlyData]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ====== Section 1: Period Banner ====== */}
      <div
        className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        style={{
          borderLeft: `4px solid ${COLORS.primary}`,
          background: 'linear-gradient(135deg, rgba(31,56,100,0.06) 0%, rgba(46,117,182,0.04) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(31,56,100,0.1)' }}>
            <CalendarRange size={22} style={{ color: COLORS.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {dateRange ? formatThaiMonthRange(dateRange.min, dateRange.max) : 'ภาพรวมการดำเนินงาน'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              NSL Food Service — Inventory Intelligence Platform
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {recentTx?.count != null && (
            <span className="px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(31,56,100,0.1)', color: COLORS.primary }}>
              {formatNumber(recentTx.count)} transactions
            </span>
          )}
          {latestSnapshot && (
            <span style={{ color: 'var(--text-muted)' }}>
              Lot Snapshot: <strong style={{ color: 'var(--text)' }}>{formatDate(latestSnapshot)}</strong>
            </span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>
            Synced: <strong style={{ color: 'var(--text)' }}>{kpi?.lastSync ? formatDateTime(kpi.lastSync) : '–'}</strong>
          </span>
        </div>
      </div>

      {/* ====== Section 2: Executive Health KPI Strip (6 cards) ====== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<Banknote size={18} />}
          label="Working Capital"
          value={kpiLoading ? '...' : `฿${formatCompact(financialKpi.invValue)}`}
          sublabel="เงินจมในคลัง (Moving Avg)"
          color={COLORS.primary}
          tooltipTitle="Working Capital"
          tooltip={<>
            <p className="mb-2">มูลค่ารวมสต็อก ณ ปัจจุบัน (Moving Avg)</p>
            <p>ยิ่งสูง → ยิ่งต้องการกระแสเงินสด · ยิ่งเสีย Carrying Cost ต่อปี</p>
          </>}
        />
        <KpiCard
          icon={<RefreshCw size={18} />}
          label="Inventory Turnover"
          value={kpiLoading ? '...' : `${financialKpi.turnover.toFixed(2)}×`}
          sublabel={`/ปี · COGS ฿${formatCompact(financialKpi.cogs12mo)}`}
          color={financialKpi.turnover >= 4 ? COLORS.green : financialKpi.turnover >= 1 ? COLORS.amber : COLORS.red}
          tooltipTitle="Inventory Turnover"
          tooltip={<>
            <p className="font-mono text-[11px] p-2 rounded mb-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
              Turnover = COGS / Inventory
            </p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≥ 4×/ปี — ดี (อาหาร)</li>
              <li>🟠 1-4× — ปานกลาง</li>
              <li>🔴 &lt; 1× — ของค้าง</li>
            </ul>
          </>}
        />
        <KpiCard
          icon={<Clock size={18} />}
          label="Days Inventory"
          value={financialKpi.dio == null ? 'N/A' : `${financialKpi.dio} วัน`}
          sublabel="365 / Turnover"
          color={financialKpi.dio == null ? COLORS.muted : financialKpi.dio <= 90 ? COLORS.green : financialKpi.dio <= 180 ? COLORS.amber : COLORS.red}
          tooltipTitle="Days Inventory Outstanding (DIO)"
          tooltip="ของอยู่ในคลังเฉลี่ยกี่วันก่อนถูกขายออก · อาหารควร ≤ 90 วัน"
        />
        <KpiCard
          icon={<Package size={18} />}
          label="Active SKUs"
          value={kpiLoading ? '...' : formatNumber(kpi?.activeItems ?? 0)}
          sublabel="มี tx ใน 90 วัน"
          color={COLORS.teal}
          tooltipTitle="Active SKUs"
          tooltip="จำนวนรหัสสินค้าที่มีการเคลื่อนไหวใน 90 วันที่ผ่านมา"
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="Expiring ≤ 30 วัน"
          value={formatNumber(expiringSoon.lots)}
          sublabel={`${expiringSoon.expiredLots > 0 ? `🔴 หมดแล้ว ${expiringSoon.expiredLots} lots · ` : ''}฿${formatCompact(expiringSoon.value)}`}
          color={expiringSoon.expiredLots > 0 ? COLORS.red : expiringSoon.lots > 0 ? COLORS.amber : COLORS.green}
          tooltipTitle="Lots ใกล้หมดอายุ"
          tooltip={<>
            <p className="mb-2">จำนวน lot ที่หมดอายุไปแล้ว + จะหมดใน 30 วัน + มูลค่าที่เสี่ยง</p>
            <p><strong>Action:</strong> ดู FEFO Pick List หรือ Lot Inventory เพื่อเร่งระบาย</p>
          </>}
        />
        <KpiCard
          icon={<TrendingDown size={18} />}
          label="Dead Stock %"
          value={`${movementHealth.deadPct.toFixed(1)}%`}
          sublabel={`${movementHealth.counts.dead_stock} items · ฿${formatCompact(movementHealth.values.dead_stock)}`}
          color={movementHealth.deadPct <= 5 ? COLORS.green : movementHealth.deadPct <= 15 ? COLORS.amber : COLORS.red}
          tooltipTitle="Dead Stock %"
          tooltip="สินค้าที่ไม่มีการเคลื่อนไหวเลย ≥ 180 วัน · มาตรฐานควร < 5%"
        />
      </div>

      {/* ====== Section 3: Risk Snapshot — 3 Donut Charts ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lot Aging Donut */}
        <div className="card relative">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={16} style={{ color: COLORS.primary }} />
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>การกระจายอายุ Lot</h3>
            <InfoTooltip title="Lot Aging Distribution">
              <p className="mb-2">สัดส่วน <strong>มูลค่า</strong> ของ lot ตามช่วงวันก่อนหมดอายุ</p>
              <p>🔴 แดงเข้ม = หมดแล้ว · 🔴 แดง = ≤30 วัน · 🟠 ส้ม = 31-60 · 🟡 เหลือง = 61-90 · 🟢 เขียว = 91-180+</p>
            </InfoTooltip>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Lot Aging by Value · {agingData.reduce((s, d) => s + d.lots, 0)} lots</p>
          {agingData.length === 0 ? (
            <EmptyChart icon={<Layers size={28} />} text="ยังไม่มีข้อมูล Lot" />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={agingData} dataKey="value" nameKey="label"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}
                  >
                    {agingData.map((d) => <Cell key={d.key} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v?: number | string, _name?: string, item?: any) => {
                      const pct = totalAgingValue > 0 ? ((Number(v) / totalAgingValue) * 100).toFixed(1) : '0';
                      return [`฿${formatCompact(Number(v ?? 0))} (${pct}%) · ${item?.payload?.lots} lots`, item?.payload?.label];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px]">
            {agingData.slice(0, 6).map(d => (
              <div key={d.key} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
                <span className="ml-auto tabular-nums font-medium" style={{ color: 'var(--text)' }}>
                  {totalAgingValue > 0 ? ((d.value / totalAgingValue) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Movement Health Donut */}
        <div className="card relative">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} style={{ color: COLORS.primary }} />
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>สุขภาพการเคลื่อนไหว</h3>
            <InfoTooltip title="Movement Health">
              <p className="mb-2">แยกสินค้าตามการเคลื่อนไหวล่าสุด:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>🟢 <strong>Normal</strong> — มี tx ใน 90 วัน</li>
                <li>🟠 <strong>Slow Moving</strong> — เคลื่อนไหวบ้าง 90-180 วัน</li>
                <li>🔴 <strong>Dead Stock</strong> — ไม่ขยับ ≥ 180 วัน (ของค้าง!)</li>
              </ul>
            </InfoTooltip>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Movement Health · {movementHealth.total} items</p>
          {movementHealth.total === 0 ? (
            <EmptyChart icon={<Activity size={28} />} text="ยังไม่มีข้อมูล" />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Normal',      value: movementHealth.counts.normal,      color: MOVEMENT_HEALTH_COLORS.normal },
                      { name: 'Slow Moving', value: movementHealth.counts.slow_moving, color: MOVEMENT_HEALTH_COLORS.slow_moving },
                      { name: 'Dead Stock',  value: movementHealth.counts.dead_stock,  color: MOVEMENT_HEALTH_COLORS.dead_stock },
                    ].filter(x => x.value > 0)}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}
                  >
                    {([MOVEMENT_HEALTH_COLORS.normal, MOVEMENT_HEALTH_COLORS.slow_moving, MOVEMENT_HEALTH_COLORS.dead_stock]).map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v?: number | string, name?: string) => {
                      const pct = movementHealth.total > 0 ? ((Number(v) / movementHealth.total) * 100).toFixed(1) : '0';
                      return [`${formatNumber(Number(v ?? 0))} items (${pct}%)`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
            {[
              { key: 'normal',      label: 'Normal',      color: MOVEMENT_HEALTH_COLORS.normal },
              { key: 'slow_moving', label: 'Slow',        color: MOVEMENT_HEALTH_COLORS.slow_moving },
              { key: 'dead_stock',  label: 'Dead',        color: MOVEMENT_HEALTH_COLORS.dead_stock },
            ].map((s) => (
              <div key={s.key} className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <div className="flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
                <div className="font-semibold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>
                  {formatNumber(movementHealth.counts[s.key as keyof typeof movementHealth.counts])}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Group Composition Donut */}
        <div className="card relative">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} style={{ color: COLORS.primary }} />
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>มูลค่าตามกลุ่มสินค้า</h3>
            <InfoTooltip title="Value Composition by Group">
              <p className="mb-2">สัดส่วนมูลค่าสต็อกของแต่ละกลุ่มสินค้า</p>
              <p>เห็นว่า "เงินจม" อยู่กลุ่มไหนมากที่สุด — focus resource ที่กลุ่มใหญ่</p>
            </InfoTooltip>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Value by Item Group · ฿{formatCompact(totalStockValue)}</p>
          {stockByGroup.length === 0 ? (
            <EmptyChart icon={<Package size={28} />} text="ยังไม่มีข้อมูล" />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stockByGroup} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}
                  >
                    {stockByGroup.map((_, i) => <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v?: number | string, name?: string) => {
                      const pct = totalStockValue > 0 ? ((Number(v) / totalStockValue) * 100).toFixed(1) : '0';
                      return [`฿${formatCompact(Number(v ?? 0))} (${pct}%)`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px]">
            {stockByGroup.slice(0, 6).map((g, i) => (
              <div key={g.name} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                <span className="truncate" style={{ color: 'var(--text-muted)' }}>{g.name}</span>
                <span className="ml-auto tabular-nums font-medium" style={{ color: 'var(--text)' }}>
                  {totalStockValue > 0 ? ((g.value / totalStockValue) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== Section 4: Movement Trend ====== */}
      <div className="card relative">
        <HelpButton
          title="แนวโน้มการเคลื่อนไหวสินค้า (12 Months)"
          body={(<>
            <HelpSection title="กราฟอ่านยังไง">
              พื้นที่เขียว = รับเข้า · พื้นที่แดง = จ่ายออก · เส้นน้ำเงิน = Net (รับ−จ่าย)
            </HelpSection>
            <HelpSection title="ช่วงเวลา">12 เดือนล่าสุดในข้อมูล</HelpSection>
          </>)}
        />
        <div className="flex items-center gap-2 mb-1">
          <ArrowLeftRight size={16} style={{ color: COLORS.primary }} />
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>แนวโน้มการเคลื่อนไหว 12 เดือน</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Movement Trend (qty)</p>
        {monthlyLoading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : movementTrend.length === 0 ? (
          <EmptyChart icon={<TrendingUp size={32} />} text="ยังไม่มีข้อมูลการเคลื่อนไหว" />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={movementTrend} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.green} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.red} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.red} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(Number(v))} />
                <Tooltip {...tooltipStyle} formatter={(v?: number | string, name?: string) => [formatNumber(Number(v ?? 0), 0), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="In"  name="รับเข้า"   fill="url(#gradIn)"  stroke={COLORS.green} strokeWidth={2} />
                <Area type="monotone" dataKey="Out" name="จ่ายออก"   fill="url(#gradOut)" stroke={COLORS.red}   strokeWidth={2} />
                <Line type="monotone" dataKey="net" name="Net (สุทธิ)" stroke={COLORS.primary} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: COLORS.primary }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ====== Section 5: Warehouse Stock Value (full-width) ====== */}
      <div className="grid grid-cols-1 gap-6">
        {/* Warehouse Stock Value — full-width now that Group bar is removed
            (Group composition is already covered by the donut in Section 3) */}
        <div className="card relative">
          <HelpButton
            title="มูลค่าสินค้าแยกตามคลัง"
            body={(<>
              <HelpSection title="กราฟอ่านยังไง">
                Top 10 คลังที่มีมูลค่าสต็อกสูงสุด · สีตามประเภทคลัง
              </HelpSection>
              <HelpSection title="ประเภท">
                <HelpLegend items={[
                  { color: '#1F3864', label: 'FG', meaning: 'Finished Goods' },
                  { color: '#2E75B6', label: 'RM', meaning: 'Raw Materials' },
                  { color: '#00897B', label: 'PD', meaning: 'Production' },
                  { color: '#E65100', label: 'PK', meaning: 'Packaging' },
                ]} />
              </HelpSection>
            </>)}
          />
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>คลังที่มีมูลค่าสูงสุด</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Top 10 Warehouses by Value</p>
          {stockByWarehouse.length === 0 ? (
            <EmptyChart icon={<Package size={28} />} text="ไม่มีข้อมูลคลัง" />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockByWarehouse} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCompact(v)} stroke="var(--text-muted)" fontSize={11} />
                  <YAxis type="category" dataKey="warehouse" width={75} stroke="var(--text-muted)" fontSize={11} tick={{ fill: 'var(--text)' }} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v?: number | string) => formatCurrency(Number(v ?? 0))}
                    labelFormatter={(label) => {
                      const item = stockByWarehouse.find((w) => w.warehouse === label);
                      return item ? `${item.warehouse} — ${item.whs_name}` : String(label);
                    }}
                  />
                  <Bar dataKey="value" name="มูลค่า" radius={[0, 4, 4, 0]} barSize={20}>
                    {stockByWarehouse.map((w) => <Cell key={w.warehouse} fill={getWhsColor(w.warehouse)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

      {/* ====== Section 6: MoM Comparison (full-width) ====== */}
      <div className="grid grid-cols-1 gap-6">
        {/* MoM Comparison */}
        <div className="card relative">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} style={{ color: COLORS.primary }} />
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>เทียบเดือนก่อน (MoM)</h3>
            <InfoTooltip title="Month-over-Month">
              <p className="mb-2">เปรียบเทียบเดือนล่าสุดกับเดือนก่อนหน้า</p>
              <p>🟢 % เขียว = ขึ้น · 🔴 % แดง = ลง</p>
            </InfoTooltip>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {mom ? `${formatDate(mom.currMonth)} vs ${formatDate(mom.prevMonth)}` : 'Month-over-Month Comparison'}
          </p>
          {!mom ? (
            <EmptyChart icon={<TrendingUp size={28} />} text="ต้องมีข้อมูลอย่างน้อย 2 เดือน" />
          ) : (
            <div className="space-y-3">
              <MomRow label="รับเข้า (In)"   curr={mom.inCurr}  prev={mom.inPrev}  pct={mom.inPct}  color={COLORS.green} />
              <MomRow label="จ่ายออก (Out)"  curr={mom.outCurr} prev={mom.outPrev} pct={mom.outPct} color={COLORS.red} />
              <MomRow label="Net (สุทธิ)"
                      curr={mom.inCurr - mom.outCurr}
                      prev={mom.inPrev - mom.outPrev}
                      pct={(mom.inPrev - mom.outPrev) === 0 ? 0 : (((mom.inCurr - mom.outCurr) - (mom.inPrev - mom.outPrev)) / Math.abs(mom.inPrev - mom.outPrev)) * 100}
                      color={COLORS.primary} />
            </div>
          )}
        </div>
      </div>

      {/* ====== Section 7: Top 10 Most Moved Items (Last 30 days) ====== */}
      <div className="card relative">
        <HelpButton
          title="สินค้าเคลื่อนไหวมากสุด"
          body={(<>
            <HelpSection title="คืออะไร">
              สินค้าที่มี Tx จำนวนหน่วยรวม (รับ+จ่าย) มากที่สุดจากธุรกรรมล่าสุด 200 รายการ
            </HelpSection>
            <HelpSection title="คอลัมน์">
              <ul className="list-disc ml-5 text-xs space-y-1">
                <li><strong>Total Moved</strong> = In + Out (รวมหน่วยทั้งสองทาง)</li>
                <li><strong>Tx Count</strong> = จำนวนธุรกรรม</li>
              </ul>
            </HelpSection>
          </>)}
        />
        <div className="flex items-center gap-2 mb-1">
          <Activity size={16} style={{ color: COLORS.primary }} />
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Top 10 Most Active Items</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>From recent 200 transactions</p>
        {topMoved.length === 0 ? (
          <EmptyChart icon={<Activity size={28} />} text="ยังไม่มี Transaction" />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th className="text-center">#</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th className="text-right">In</th>
                  <th className="text-right">Out</th>
                  <th className="text-right">Total Moved</th>
                  <th className="text-right">Tx Count</th>
                </tr>
              </thead>
              <tbody>
                {topMoved.map((row, idx) => (
                  <tr key={row.item_code}>
                    <td className="text-center" style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td className="font-mono text-sm" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemNameMap.get(row.item_code) ?? '—'}
                    </td>
                    <td className="text-right" style={{ color: COLORS.green }}>+{formatNumber(row.totalIn, 0)}</td>
                    <td className="text-right" style={{ color: COLORS.red }}>-{formatNumber(row.totalOut, 0)}</td>
                    <td className="text-right font-semibold">{formatNumber(row.totalMoved, 0)}</td>
                    <td className="text-right" style={{ color: 'var(--text-muted)' }}>{row.txCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sublabel, color, tooltipTitle, tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  color: string;
  tooltipTitle?: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="card relative" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-start justify-between">
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        {tooltip && <InfoTooltip title={tooltipTitle ?? label} size={13}>{tooltip}</InfoTooltip>}
      </div>
      <div className="mt-2.5">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color }}>{value}</p>
        <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sublabel}</p>
      </div>
    </div>
  );
}

// ── MoM Row ─────────────────────────────────────────────────────────────────
function MomRow({ label, curr, prev, pct, color }: {
  label: string; curr: number; prev: number; pct: number; color: string;
}) {
  const positive = pct >= 0;
  const flat = Math.abs(pct) < 0.1;
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>
      </div>
      <div className="text-right flex items-center gap-3">
        <div>
          <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{formatNumber(curr, 0)}</p>
          <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>vs {formatNumber(prev, 0)}</p>
        </div>
        <div
          className="px-2 py-0.5 rounded text-xs font-semibold tabular-nums flex items-center gap-0.5"
          style={{
            backgroundColor: flat ? 'rgba(100,116,139,0.1)' : positive ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
            color:           flat ? COLORS.muted             : positive ? COLORS.green              : COLORS.red,
            minWidth: 72,
            justifyContent: 'center',
          }}
        >
          {flat ? '—' : positive ? '↑' : '↓'}
          {flat ? '' : `${positive ? '+' : ''}${pct.toFixed(1)}%`}
        </div>
      </div>
    </div>
  );
}

// ── Empty chart placeholder ─────────────────────────────────────────────────
function EmptyChart({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="h-60 flex flex-col items-center justify-center text-center" style={{ color: 'var(--text-muted)' }}>
      <div className="opacity-40 mb-2">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
