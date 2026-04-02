import { useMemo } from 'react';
import {
  DollarSign, Package, AlertTriangle, Clock, ArrowLeftRight,
  TrendingUp, TrendingDown, CalendarRange, Activity, Truck,
} from 'lucide-react';
import {
  ComposedChart, PieChart, BarChart,
  Area, Line, Bar, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  useKPI, useStockOnHand, useMovementMonthly,
  useTransactions, useStockAlerts, useDataDateRange,
  useGoodsInTransit,
} from '@/hooks/useSupabaseQuery';
import {
  formatNumber, formatCurrency, formatDate, formatDateTime,
  formatThaiMonthRange, formatCompact,
} from '@/utils/format';

// ── Color constants ──────────────────────────────────────────────────────────
const GROUP_COLORS = ['#1F3864', '#2E75B6', '#00897B', '#E65100'];

const WHS_TYPE_COLORS: Record<string, string> = {
  FG: '#1F3864', RM: '#2E75B6', PD: '#00897B',
  PK: '#E65100', QC: '#7B1FA2', CL: '#C62828',
  CO: '#C62828', WS: '#78909C', BT: '#2E75B6',
};

function getWhsColor(code: string): string {
  const prefix = code.split('-')[1]?.substring(0, 2) ?? '';
  return WHS_TYPE_COLORS[prefix] ?? WHS_TYPE_COLORS[code.split('-')[0]] ?? '#64748b';
}

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
  const { data: kpi, isLoading: kpiLoading } = useKPI();
  const { data: stockData } = useStockOnHand();
  const { data: monthlyData, isLoading: monthlyLoading } = useMovementMonthly({ months: 12 });
  const { data: alerts } = useStockAlerts();
  const { data: recentTx } = useTransactions({ page: 0, pageSize: 200 });
  const { data: dataDateRange } = useDataDateRange();
  const { data: transitItems = [] } = useGoodsInTransit();

  // === Derived data ===
  const dateRange = useMemo(() => {
    if (!dataDateRange?.minDate || !dataDateRange?.maxDate) return null;
    return { min: dataDateRange.minDate, max: dataDateRange.maxDate };
  }, [dataDateRange]);

  const movementTrend = useMemo(
    () => (monthlyData ?? []).map((m) => ({ ...m, net: m.In - m.Out })),
    [monthlyData],
  );

  const stockByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockData ?? []) {
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

  const stockByWarehouse = useMemo(() => {
    const map = new Map<string, { warehouse: string; whs_name: string; value: number }>();
    for (const s of stockData ?? []) {
      const prev = map.get(s.warehouse) ?? { warehouse: s.warehouse, whs_name: s.whs_name, value: 0 };
      prev.value += Number(s.stock_value);
      map.set(s.warehouse, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [stockData]);

  const itemNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stockData ?? []) {
      if (!map.has(s.item_code)) {
        // Fallback to item_name if itemname is not yet available from the view
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

  const healthData = useMemo(() => {
    const counts = { critical: 0, warning: 0, normal: 0, overstock: 0 };
    for (const a of alerts ?? []) counts[a.status as keyof typeof counts]++;
    return { ...counts, total: (alerts ?? []).length };
  }, [alerts]);

  const transitSummary = useMemo(() => {
    const overdue      = transitItems.filter(t => t.arrival_status === 'overdue').length;
    const arrivingSoon = transitItems.filter(t => t.arrival_status === 'arriving_soon' || t.arrival_status === 'arriving_today').length;
    const totalValue   = transitItems.reduce((s, t) => s + Number(t.pending_value), 0);
    return { total: transitItems.length, overdue, arrivingSoon, totalValue };
  }, [transitItems]);

  const mom = useMemo(() => {
    if (!monthlyData || monthlyData.length < 2) return null;
    const curr = monthlyData[monthlyData.length - 1];
    const prev = monthlyData[monthlyData.length - 2];
    const pct = (c: number, p: number) => (p === 0 ? 0 : ((c - p) / Math.abs(p)) * 100);
    return {
      currMonth: curr.month,
      prevMonth: prev.month,
      inCurr: curr.In, inPrev: prev.In, inPct: pct(curr.In, prev.In),
      outCurr: curr.Out, outPrev: prev.Out, outPct: pct(curr.Out, prev.Out),
      netCurr: curr.In - curr.Out, netPrev: prev.In - prev.Out,
      amtCurr: curr.total_amount, amtPrev: prev.total_amount,
      amtPct: pct(curr.total_amount, prev.total_amount),
    };
  }, [monthlyData]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ====== Section 1: Data Period Banner ====== */}
      <div
        className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        style={{
          borderLeft: '4px solid var(--color-primary)',
          background: 'linear-gradient(135deg, rgba(31,56,100,0.06) 0%, rgba(46,117,182,0.04) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(31,56,100,0.1)' }}>
            <CalendarRange size={22} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {dateRange ? formatThaiMonthRange(dateRange.min, dateRange.max) : 'Loading...'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              NSL Food Service — Inventory Intelligence Platform
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          {dataDateRange && (
            <span className="badge badge-info">{formatNumber(dataDateRange.totalTransactions)} transactions</span>
          )}
          {kpi?.lastSync && (
            <span>Synced: {formatDateTime(kpi.lastSync)}</span>
          )}
        </div>
      </div>

      {/* ====== Section 2: Executive KPI Row ====== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          icon={<DollarSign size={20} />}
          label="มูลค่าคงคลังรวม"
          value={kpiLoading ? '...' : `฿${formatCompact(kpi?.totalStockValue ?? 0)}`}
          sublabel="Total Stock Value"
          color="#1F3864"
        />
        <KPICard
          icon={<Package size={20} />}
          label="สินค้า Active"
          value={kpiLoading ? '...' : formatNumber(kpi?.activeItems ?? 0)}
          sublabel="Active Items"
          color="#2E75B6"
        />
        <KPICard
          icon={<ArrowLeftRight size={20} />}
          label="เคลื่อนไหว/เดือน"
          value={monthlyLoading ? '...' : formatNumber(
            (movementTrend.at(-1)?.In ?? 0) + (movementTrend.at(-1)?.Out ?? 0), 0,
          )}
          sublabel="Monthly Movement (qty)"
          color="#00897B"
          trend={mom ? {
            pct: ((mom.inCurr + mom.outCurr) - (mom.inPrev + mom.outPrev)) / Math.max(mom.inPrev + mom.outPrev, 1) * 100,
          } : undefined}
        />
        <KPICard
          icon={<AlertTriangle size={20} />}
          label="แจ้งเตือนวิกฤต"
          value={formatNumber(kpi?.criticalAlerts ?? 0)}
          sublabel="Critical Alerts"
          color={(kpi?.criticalAlerts ?? 0) > 0 ? '#C62828' : '#2E7D32'}
        />
        <KPICard
          icon={<Truck size={20} />}
          label="ระหว่างขนส่ง"
          value={formatNumber(transitSummary.total)}
          sublabel={transitSummary.overdue > 0 ? `เลยกำหนด ${transitSummary.overdue} รายการ` : 'Goods in Transit'}
          color={transitSummary.overdue > 0 ? '#E65100' : '#00897B'}
        />
        <KPICard
          icon={<Clock size={20} />}
          label="อัปเดตล่าสุด"
          value={kpi?.lastSync ? new Date(kpi.lastSync).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '–'}
          sublabel={kpi?.lastSync ? new Date(kpi.lastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'Last Sync'}
          color="#00897B"
        />
      </div>

      {/* ====== Section 3 + 4: Movement Trend + Donut ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Movement Trend */}
        <div className="lg:col-span-3 card">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>แนวโน้มการเคลื่อนไหวสินค้า</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Movement Trend — 12 เดือน</p>
            </div>
            <Activity size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="h-80 mt-2">
            {monthlyLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={movementTrend}>
                  <defs>
                    <linearGradient id="fillIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2E7D32" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#2E7D32" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C62828" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#C62828" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return d.toLocaleDateString('th-TH', { month: 'short' }) + ' ' + String(d.getFullYear() + 543).slice(-2);
                    }}
                    stroke="var(--text-muted)" fontSize={11}
                  />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(val?: number | string) => formatNumber(Number(val ?? 0), 0)}
                    labelFormatter={(v) => formatDate(String(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area name="รับเข้า (In)" type="monotone" dataKey="In" stroke="#2E7D32" strokeWidth={2} fill="url(#fillIn)" />
                  <Area name="จ่ายออก (Out)" type="monotone" dataKey="Out" stroke="#C62828" strokeWidth={2} fill="url(#fillOut)" />
                  <Line name="Net Movement" type="monotone" dataKey="net" stroke="#1F3864" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3, fill: '#1F3864' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Stock Value Donut */}
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>สัดส่วนมูลค่าสินค้าคงคลัง</h3>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Stock Value Distribution</p>
          <div className="h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockByGroup}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={58} outerRadius={88}
                  paddingAngle={2}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                  fontSize={11}
                >
                  {stockByGroup.map((_, i) => (
                    <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>รวม</p>
                <p className="text-base font-bold" style={{ color: 'var(--text)' }}>฿{formatCompact(totalStockValue)}</p>
              </div>
            </div>
          </div>
          {/* Legend */}
          <div className="space-y-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            {stockByGroup.map((g, i) => (
              <div key={g.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                  <span style={{ color: 'var(--text)' }}>{g.name}</span>
                </div>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  ฿{formatCompact(g.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== Section 5 + 6: Warehouse + Stock Health ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Warehouse Performance */}
        <div className="lg:col-span-3 card">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>มูลค่าสินค้าแยกตามคลัง</h3>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Warehouse Stock Value — Top 10</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockByWarehouse} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatCompact(v)}
                  stroke="var(--text-muted)" fontSize={11}
                />
                <YAxis
                  type="category"
                  dataKey="warehouse"
                  width={75}
                  stroke="var(--text-muted)" fontSize={11}
                  tick={{ fill: 'var(--text)' }}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))}
                  labelFormatter={(label) => {
                    const item = stockByWarehouse.find((w) => w.warehouse === label);
                    return item ? `${item.warehouse} — ${item.whs_name}` : String(label);
                  }}
                />
                <Bar dataKey="value" name="มูลค่า" radius={[0, 4, 4, 0]} barSize={20}>
                  {stockByWarehouse.map((w) => (
                    <Cell key={w.warehouse} fill={getWhsColor(w.warehouse)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Health Gauge */}
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>สุขภาพสต๊อก</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Stock Health Overview</p>

          {healthData.total === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">ยังไม่มีการตั้งค่าเกณฑ์สต๊อก</p>
              <p className="text-xs mt-1">ไปที่ <strong>Low Stock Alerts</strong> เพื่อตั้งค่า</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-5">
                <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{healthData.total}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>รายการที่ตั้งค่าเกณฑ์</p>
              </div>

              {/* Stacked bar */}
              <div className="flex h-3 rounded-full overflow-hidden mb-5" style={{ backgroundColor: 'var(--border)' }}>
                {healthData.critical > 0 && (
                  <div style={{ width: `${(healthData.critical / healthData.total) * 100}%`, backgroundColor: '#C62828' }} />
                )}
                {healthData.warning > 0 && (
                  <div style={{ width: `${(healthData.warning / healthData.total) * 100}%`, backgroundColor: '#E65100' }} />
                )}
                {healthData.normal > 0 && (
                  <div style={{ width: `${(healthData.normal / healthData.total) * 100}%`, backgroundColor: '#2E7D32' }} />
                )}
                {healthData.overstock > 0 && (
                  <div style={{ width: `${(healthData.overstock / healthData.total) * 100}%`, backgroundColor: '#2E75B6' }} />
                )}
              </div>

              {/* Status rows */}
              <div className="space-y-3">
                {([
                  { key: 'critical', label: 'วิกฤต (Critical)', color: '#C62828' },
                  { key: 'warning', label: 'เฝ้าระวัง (Warning)', color: '#E65100' },
                  { key: 'normal', label: 'ปกติ (Normal)', color: '#2E7D32' },
                  { key: 'overstock', label: 'สต๊อกเกิน (Overstock)', color: '#2E75B6' },
                ] as const).map(({ key, label, color }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                        {healthData[key]}
                      </span>
                      <span className="text-xs tabular-nums w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                        {healthData.total > 0 ? ((healthData[key] / healthData.total) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ====== Section 7 + 8: Top Items + MoM ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Top 10 Active Items */}
        <div className="lg:col-span-3 card p-0">
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>สินค้าเคลื่อนไหวสูงสุด 10 อันดับ</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Top 10 Most Active Items (recent transactions)</p>
          </div>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th className="text-right">รับเข้า</th>
                  <th className="text-right">จ่ายออก</th>
                  <th className="text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {topMoved.map((item, i) => (
                  <tr key={item.item_code}>
                    <td className="text-center">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: i < 3 ? '#1F3864' : 'var(--text-muted)' }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {item.item_code}
                    </td>
                    <td
                      className="text-sm max-w-[180px] truncate"
                      style={{ color: 'var(--text)' }}
                      title={itemNameMap.get(item.item_code) ?? item.item_code}
                    >
                      {itemNameMap.get(item.item_code) ?? '—'}
                    </td>
                    <td className="text-right text-sm text-green-600 tabular-nums">
                      {item.totalIn > 0 ? `+${formatNumber(item.totalIn, 0)}` : '–'}
                    </td>
                    <td className="text-right text-sm text-red-600 tabular-nums">
                      {item.totalOut > 0 ? `-${formatNumber(item.totalOut, 0)}` : '–'}
                    </td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                      {formatNumber(item.totalMoved, 0)}
                    </td>
                  </tr>
                ))}
                {topMoved.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                      ยังไม่มีข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Month-over-Month */}
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>เปรียบเทียบรายเดือน</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {mom
              ? (() => {
                const currFmt = new Date(mom.currMonth).toLocaleDateString('th-TH', { month: 'short' }) + ' ' + String(new Date(mom.currMonth).getFullYear() + 543).slice(-2);
                const prevFmt = new Date(mom.prevMonth).toLocaleDateString('th-TH', { month: 'short' }) + ' ' + String(new Date(mom.prevMonth).getFullYear() + 543).slice(-2);
                return `${currFmt} vs ${prevFmt}`;
              })()
              : 'Month-over-Month'}
          </p>

          {!mom ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">ข้อมูลไม่เพียงพอสำหรับการเปรียบเทียบ</p>
            </div>
          ) : (
            <div className="space-y-4">
              <MoMStat label="รับเข้า (In)" value={mom.inCurr} prev={mom.inPrev} pct={mom.inPct} color="#2E7D32" />
              <MoMStat label="จ่ายออก (Out)" value={mom.outCurr} prev={mom.outPrev} pct={mom.outPct} color="#C62828" />
              <MoMStat
                label="Net Movement"
                value={mom.netCurr} prev={mom.netPrev}
                pct={mom.netPrev === 0 ? 0 : ((mom.netCurr - mom.netPrev) / Math.abs(mom.netPrev)) * 100}
                color="#1F3864"
              />
              <MoMStat label="มูลค่ารวม (Amount)" value={mom.amtCurr} prev={mom.amtPrev} pct={mom.amtPct} color="#E65100" isCurrency />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  icon, label, sublabel, value, color, trend,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: string;
  color: string;
  trend?: { pct: number };
}) {
  return (
    <div className="card flex flex-col gap-3 relative overflow-hidden">
      {/* Decorative top bar */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        {trend && (
          <span
            className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: trend.pct >= 0 ? '#2E7D32' : '#C62828',
              backgroundColor: trend.pct >= 0 ? '#2E7D3215' : '#C6282815',
            }}
          >
            {trend.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend.pct).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{sublabel}</p>
      </div>
    </div>
  );
}

function MoMStat({
  label, value, prev, pct, color, isCurrency = false,
}: {
  label: string;
  value: number;
  prev: number;
  pct: number;
  color: string;
  isCurrency?: boolean;
}) {
  const fmt = isCurrency
    ? (v: number) => `฿${formatCompact(v)}`
    : (v: number) => formatNumber(v, 0);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-alt, #f8fafc)' }}>
      <div className="w-2 h-10 rounded-full" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(value)}</p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>prev: {fmt(prev)}</p>
      </div>
      <span
        className="flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg"
        style={{
          color: pct >= 0 ? '#2E7D32' : '#C62828',
          backgroundColor: pct >= 0 ? '#2E7D3212' : '#C6282812',
        }}
      >
        {pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(pct).toFixed(1)}%
      </span>
    </div>
  );
}
