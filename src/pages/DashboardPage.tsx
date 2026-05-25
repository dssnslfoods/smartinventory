import { useMemo } from 'react';
import {
  Package, Clock, RefreshCw,
  TrendingUp, TrendingDown, CalendarRange, Activity, AlertTriangle,
  Layers, Target, Banknote,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useKPI, useStockOnHand, useMovementMonthly,
  useDataDateRange,
  useSlowMoving,
  useLatestLotSnapshot, useLotAging, useMonthlyTotal,
  useLotDetail, useSystemConfig,
} from '@/hooks/useSupabaseQuery';
import {
  computeVVScores, parseVVConfig, summarizeVV,
  type VVInput,
} from '@/lib/vvMatrix';
import {
  formatNumber, formatDate, formatDateTime,
  formatThaiMonthRange, formatCompact,
} from '@/utils/format';
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
  const { data: monthlyData = [] }                       = useMovementMonthly({ months: 12 });
  // Pull just enough transactions for the "Top 10 Most Active" widget —
  // 50 rows is more than enough to compute a top-10 (was 200, 4× over-fetch).
  const { data: dataDateRange }                          = useDataDateRange();
  const { data: slowData = [] }                          = useSlowMoving();
  const { data: latestSnapshot }                         = useLatestLotSnapshot();
  const { data: lotAging = [] }                          = useLotAging(latestSnapshot);
  // Fetch a wider window (24 mo) so the Turnover/DIO calc below can pick
  // the LAST 12 MONTHS OF ACTUAL DATA — anchored on the data's last month
  // rather than today. Otherwise stale data (no recent imports) makes COGS
  // undercount and DIO look unrealistically large.
  const { data: monthlyTotal = [] }                      = useMonthlyTotal(24);
  // VV Matrix overview — uses lot-level scoring (the canonical mode)
  const { data: lotResult }                              = useLotDetail({
    snapshotDate: latestSnapshot, pageSize: 5000, page: 0,
  });
  const { data: sysConfig }                              = useSystemConfig();

  // === Derived data ===
  const dateRange = useMemo(() => {
    if (!dataDateRange?.minDate || !dataDateRange?.maxDate) return null;
    return { min: dataDateRange.minDate, max: dataDateRange.maxDate };
  }, [dataDateRange]);

  // OPTION C: detect stale data so analytics (Turnover/DIO/Trends) come with
  // an honest warning when the user forgot to import. Hidden when fresh.
  const dataFreshness = useMemo(() => {
    if (!dataDateRange?.maxDate) return null;
    const last  = new Date(dataDateRange.maxDate);
    const today = new Date();
    const daysOld = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
    const status =
      daysOld <= 7   ? 'fresh'   :
      daysOld <= 30  ? 'recent'  :
      daysOld <= 90  ? 'stale'   : 'very_stale';
    return { daysOld, status, lastDate: dataDateRange.maxDate };
  }, [dataDateRange]);

  // ── Financial KPIs (Inventory Turnover, DIO, Carrying Cost) ────────────────
  // OPTION A FIX: anchor the 12-month window on the data's LATEST month,
  // not on today(). If the last import was 2 months ago, naive "12 months
  // from today" would include 2 empty months → COGS undercounted by ~17%
  // → DIO inflated. Slicing the last 12 entries with data fixes that.
  const financialKpi = useMemo(() => {
    // current_stock in v_stock_onhand is now the PHYSICAL lot snapshot
    // (inventory_lots) — always ≥ 0 and free of the SAP transfer inflation.
    // Sum every line with stock for true net inventory value.
    const nonZero = stockData.filter(x => Number(x.current_stock) !== 0);
    const invValue = nonZero.reduce((s, x) => s + Number(x.stock_value), 0);
    // monthlyTotal is ordered ASC by month — take the last 12 entries
    // (i.e. the most recent 12 months that actually have data)
    const last12 = monthlyTotal.slice(-12);
    const cogs12mo = last12.reduce((s, m) => s + Number(m.out_value ?? 0), 0);
    const turnover = invValue > 0 ? cogs12mo / invValue : 0;
    const dio = turnover > 0 ? Math.round(365 / turnover) : null;
    // Concrete worked example for the tooltip = the single highest-value line.
    const topLine = nonZero.reduce<typeof nonZero[number] | null>(
      (best, x) => (best == null || Number(x.stock_value) > Number(best.stock_value) ? x : best),
      null,
    );
    return {
      invValue, cogs12mo, turnover, dio,
      lineCount:     nonZero.length,
      topLine,
      monthsCounted: last12.length,
      windowStart:   last12[0]?.month ?? null,
      windowEnd:     last12[last12.length - 1]?.month ?? null,
    };
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
    const totalValue = values.normal + values.slow_moving + values.dead_stock;
    return {
      counts, values, total, totalValue,
      deadPct:      total      > 0 ? (counts.dead_stock / total)      * 100 : 0,
      slowPct:      total      > 0 ? (counts.slow_moving / total)     * 100 : 0,
      deadValuePct: totalValue > 0 ? (values.dead_stock / totalValue) * 100 : 0,
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

  // ── VV Matrix Overview (lot-level scoring — canonical) ──────────────────
  const vvSummary = useMemo(() => {
    const lots = lotResult?.data ?? [];
    if (!lots.length) return null;
    const cfg = parseVVConfig(sysConfig);
    const alpha = Math.round(cfg.vv_alpha) as 1 | 2 | 3;
    const inputs: VVInput[] = lots
      .filter(l => Number(l.qty) > 0)
      .map(l => ({
        item_code:   l.item_code,
        itemname:    l.itemname,
        group_name:  l.group_name,
        uom:         l.uom,
        stock_value: Number(l.amount),
        expire_date: l.expire_date,
        batch_num:   l.batch_num,
        warehouse:   l.warehouse,
        whs_name:    l.whs_name,
        qty:         Number(l.qty),
        fs_category: l.fs_category ?? null,
      }));
    const scored = computeVVScores(inputs, cfg, alpha);
    return { ...summarizeVV(scored, 5), alpha, cfg };
  }, [lotResult, sysConfig]);

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

  // ── MoM Comparison (Month-over-Month — last month vs the month before) ────
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

  // ── QoQ Comparison (Quarter-over-Quarter — last 3 months vs prior 3) ──────
  // Uses the last 6 entries of monthlyData (most recent → oldest tail).
  // current quarter = months[-3..-1] · previous quarter = months[-6..-4].
  const qoq = useMemo(() => {
    if (monthlyData.length < 6) return null;
    const last6 = monthlyData.slice(-6);
    const currQ = last6.slice(3);
    const prevQ = last6.slice(0, 3);
    const sumIn  = (arr: typeof last6) => arr.reduce((s, m) => s + Number(m.In  ?? 0), 0);
    const sumOut = (arr: typeof last6) => arr.reduce((s, m) => s + Number(m.Out ?? 0), 0);
    const pct = (c: number, p: number) => (p === 0 ? 0 : ((c - p) / Math.abs(p)) * 100);
    const inCurr  = sumIn(currQ),  inPrev  = sumIn(prevQ);
    const outCurr = sumOut(currQ), outPrev = sumOut(prevQ);
    return {
      currStart: currQ[0].month, currEnd: currQ[2].month,
      prevStart: prevQ[0].month, prevEnd: prevQ[2].month,
      inCurr, inPrev, inPct: pct(inCurr, inPrev),
      outCurr, outPrev, outPct: pct(outCurr, outPrev),
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
          {dataDateRange?.totalTransactions != null && (
            <span className="px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(31,56,100,0.1)', color: COLORS.primary }}>
              {formatNumber(dataDateRange.totalTransactions)} transactions
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

      {/* ====== Data Freshness Warning ====== */}
      {dataFreshness && dataFreshness.status !== 'fresh' && (
        <div
          className="card flex items-center gap-3"
          style={{
            borderLeft: `4px solid ${
              dataFreshness.status === 'recent'      ? COLORS.amber :
              dataFreshness.status === 'stale'       ? COLORS.orange :
                                                       COLORS.red
            }`,
            backgroundColor:
              dataFreshness.status === 'recent'      ? 'rgba(217,119,6,0.04)' :
              dataFreshness.status === 'stale'       ? 'rgba(230,81,0,0.05)'  :
                                                       'rgba(220,38,38,0.05)',
          }}
        >
          <AlertTriangle
            size={20}
            style={{
              color: dataFreshness.status === 'recent' ? COLORS.amber
                    : dataFreshness.status === 'stale' ? COLORS.orange : COLORS.red,
              flexShrink: 0,
            }}
          />
          <div className="flex-1 text-sm" style={{ color: 'var(--text)' }}>
            <strong>
              {dataFreshness.status === 'recent'      ? 'ข้อมูลค่อนข้างเก่า · ' :
               dataFreshness.status === 'stale'       ? 'ข้อมูลเก่า · '          :
                                                        'ข้อมูลเก่ามาก · '       }
            </strong>
            ธุรกรรมล่าสุดในระบบคือ <strong>{formatDate(dataFreshness.lastDate)}</strong>
            {' '}— ห่างจากวันนี้ <strong>{dataFreshness.daysOld} วัน</strong>
            <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
              · Turnover / DIO / Trends คำนวณจากข้อมูลที่มีอยู่จริง ไม่ใช่ปฏิทินจากวันนี้
            </span>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-full font-medium flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            แนะนำให้ Import ข้อมูลใหม่
          </span>
        </div>
      )}

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
            <p className="mb-2">มูลค่ารวมสต็อก ณ ปัจจุบัน (Moving Avg) — เงินสดที่จมในสินค้าคงคลัง</p>

            <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text)' }}>ขั้นตอนการคำนวณ</p>

            {/* Step 1 — value of one line */}
            <CalcBlock formula="STEP 1 · ต่อ 1 บรรทัด: stock_value = current_stock × moving_avg">
              {financialKpi.topLine ? (
                <>
                  <CalcLine label={`${financialKpi.topLine.item_code} @ ${financialKpi.topLine.warehouse}`}
                            value={`ตัวอย่างบรรทัดที่ใหญ่สุด`} muted />
                  <CalcLine label="current_stock"
                            value={`${formatNumber(Number(financialKpi.topLine.current_stock), 2)} ${financialKpi.topLine.uom ?? ''}`} />
                  <CalcLine label="× moving_avg"
                            value={`฿${formatNumber(Number(financialKpi.topLine.moving_avg), 2)}`} />
                  <CalcLine label="= stock_value"
                            value={`฿${formatNumber(Number(financialKpi.topLine.stock_value), 0)}`} bold />
                </>
              ) : <CalcLine label="—" value="ไม่มีข้อมูล" muted />}
            </CalcBlock>

            {/* Step 2 — sum every line */}
            <CalcBlock formula="STEP 2 · รวมทุกบรรทัด (สินค้า × คลัง)">
              <CalcLine label="จำนวนบรรทัด" value={`${formatNumber(financialKpi.lineCount, 0)} บรรทัด`} />
              <CalcLine label="Σ stock_value" value={`฿${formatNumber(financialKpi.invValue, 0)}`} bold />
            </CalcBlock>

            {/* Step 3 — result */}
            <CalcBlock formula="STEP 3 · Working Capital">
              <CalcLine label="= Working Capital" value={`฿${formatCompact(financialKpi.invValue)}`} bold />
            </CalcBlock>

            <p className="text-[10px] mt-1.5 italic" style={{ color: 'var(--text-muted)' }}>
              current_stock = ผลรวม qty ของ Lot คงเหลือจริง ณ snapshot ล่าสุด (นับจริง · ไม่รวม transfer ผี) · moving_avg = WAC ฝั่งรับเข้า: Σ มูลค่ารับเข้า ÷ Σ จำนวนรับเข้า (as-of วันที่ snapshot)
            </p>
            <p className="mt-2">ยิ่งสูง → ต้องการเงินสดมาก · เสีย Carrying Cost ต่อปี</p>
            {(() => {
              const carry15 = financialKpi.invValue * 0.15;
              const coverYears = financialKpi.cogs12mo > 0
                ? financialKpi.invValue / financialKpi.cogs12mo
                : null;
              if (coverYears != null && coverYears >= 3) {
                return <Insight tone="critical">
                  <strong>วิกฤต — เงินจมในคลังสูงผิดปกติ</strong><br />
                  ฿{formatCompact(financialKpi.invValue)} เทียบกับ COGS 12 เดือน (฿{formatCompact(financialKpi.cogs12mo)})
                  → เก็บสต็อกมากกว่ายอดขายในรอบ {coverYears.toFixed(1)} ปี ·
                  ถือต้นทุน (15%/ปี) ประมาณ <strong>฿{formatCompact(carry15)}/ปี</strong>
                </Insight>;
              }
              if (coverYears != null && coverYears >= 1) {
                return <Insight tone="warn">
                  Working Capital ฿{formatCompact(financialKpi.invValue)} ≈ COGS {coverYears.toFixed(1)} ปี ·
                  Carrying Cost ≈ <strong>฿{formatCompact(carry15)}/ปี</strong> (15%/ปี)
                </Insight>;
              }
              return <Insight tone="info">
                Carrying Cost โดยประมาณ <strong>฿{formatCompact(carry15)}/ปี</strong> (อัตราถือครอง 15%/ปี)
              </Insight>;
            })()}
          </>}
        />
        <KpiCard
          icon={<RefreshCw size={18} />}
          label="Inventory Turnover"
          value={kpiLoading ? '...' : `${financialKpi.turnover.toFixed(2)}×`}
          sublabel={`${financialKpi.monthsCounted} mo · COGS ฿${formatCompact(financialKpi.cogs12mo)}`}
          color={financialKpi.turnover >= 4 ? COLORS.green : financialKpi.turnover >= 1 ? COLORS.amber : COLORS.red}
          tooltipTitle="Inventory Turnover"
          tooltip={<>
            <CalcBlock formula="Turnover = COGS / Inventory">
              <CalcLine label="COGS (Out value)" value={`฿${formatCompact(financialKpi.cogs12mo)}`} />
              <CalcLine label="÷ Inventory" value={`฿${formatCompact(financialKpi.invValue)}`} />
              <CalcLine label="= Turnover" value={`${financialKpi.turnover.toFixed(4)}×`} bold />
            </CalcBlock>
            <p className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              <strong>COGS</strong> = Σ ABS(amount) WHERE direction='Out' (Delivery+Issue+Return) ·
              ตรงตามที่บัญชีใช้ (ไม่นับ Transfers ระหว่างคลัง · ไม่นับ Cost adjustments)
            </p>
            <p className="mt-2 mb-1">
              <strong>Window:</strong> {financialKpi.monthsCounted} เดือนล่าสุดที่มีข้อมูล
            </p>
            {financialKpi.windowStart && financialKpi.windowEnd && (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                ({formatDate(financialKpi.windowStart)} – {formatDate(financialKpi.windowEnd)})
              </p>
            )}
            <ul className="list-disc ml-4 space-y-0.5">
              <li>🟢 ≥ 4×/ปี — ดี (อาหาร)</li>
              <li>🟠 1-4× — ปานกลาง</li>
              <li>🔴 &lt; 1× — ของค้าง</li>
            </ul>
            {financialKpi.turnover < 1 && (
              <Insight tone="critical">
                <strong>Inventory Turnover ต่ำวิกฤต ({financialKpi.turnover.toFixed(2)}×):</strong>{' '}
                ในรอบ {financialKpi.monthsCounted} เดือน สินค้าหมุนเวียนออกไปไม่ถึง 1 รอบด้วยซ้ำ
                (ทำได้เพียง {financialKpi.turnover.toFixed(2)} รอบ) ยืนยันว่าสินค้าจมอยู่กับที่นานเกินไป ·
                มาตรฐานอาหารควร ≥ 4×/ปี
              </Insight>
            )}
            {financialKpi.turnover >= 1 && financialKpi.turnover < 4 && (
              <Insight tone="warn">
                <strong>ต่ำกว่ามาตรฐาน ({financialKpi.turnover.toFixed(2)}×):</strong>{' '}
                สินค้าหมุน {financialKpi.turnover.toFixed(2)} รอบ ในรอบ {financialKpi.monthsCounted} เดือน
                — มาตรฐานอุตสาหกรรมอาหารควรอยู่ที่ ≥ 4×/ปี
              </Insight>
            )}
            {financialKpi.turnover >= 4 && (
              <Insight tone="ok">
                <strong>ดี ({financialKpi.turnover.toFixed(2)}×):</strong>{' '}
                สินค้าหมุนเวียน {financialKpi.turnover.toFixed(2)} รอบ/ปี ตามมาตรฐานอาหาร (≥ 4×/ปี)
              </Insight>
            )}
          </>}
        />
        <KpiCard
          icon={<Clock size={18} />}
          label="Days Inventory"
          value={financialKpi.dio == null ? 'N/A' : `${formatNumber(financialKpi.dio, 0)} วัน`}
          sublabel={`365 / Turnover · ${financialKpi.monthsCounted}mo data`}
          color={financialKpi.dio == null ? COLORS.muted : financialKpi.dio <= 90 ? COLORS.green : financialKpi.dio <= 180 ? COLORS.amber : COLORS.red}
          tooltipTitle="Days Inventory Outstanding (DIO)"
          tooltip={<>
            <p className="mb-2">ของอยู่ในคลังเฉลี่ยกี่วันก่อนถูกขายออก · อาหารควร ≤ 90 วัน</p>
            <CalcBlock formula="DIO = 365 / Turnover">
              <CalcLine label="Turnover" value={`${financialKpi.turnover.toFixed(4)}×`} />
              <CalcLine label="365 ÷ Turnover" value={financialKpi.dio == null ? 'N/A' : `${formatNumber(financialKpi.dio, 0)} วัน`} bold />
            </CalcBlock>
            <p className="mt-2">
              คำนวณจาก <strong>{financialKpi.monthsCounted} เดือนล่าสุดที่มีข้อมูลจริง</strong>
            </p>
            {financialKpi.dio != null && (() => {
              const dio = financialKpi.dio;
              const years = dio / 365;
              if (dio > 365) {
                return <Insight tone="critical">
                  <strong>Days Inventory สูงถึง {formatNumber(dio, 0)} วัน (ประมาณ {years.toFixed(1)} ปี):</strong>{' '}
                  นี่คือจุดที่น่ากลัวที่สุด — คลังต้องใช้เวลาเกือบ {years.toFixed(1)} ปี
                  ในการระบายสินค้าออกทั้งหมดด้วยอัตราการขายปัจจุบัน
                  ขณะที่ค่าเฉลี่ยมาตรฐานธุรกิจอาหารมักจะอยู่ที่ไม่เกิน 30–90 วันเท่านั้น
                </Insight>;
              }
              if (dio > 180) {
                return <Insight tone="critical">
                  <strong>DIO {formatNumber(dio, 0)} วัน เกินมาตรฐาน:</strong>{' '}
                  ใช้เวลาประมาณ {Math.round(dio / 30)} เดือนกว่าจะระบายสินค้าออกหมด
                  ขณะที่มาตรฐานอาหารอยู่ที่ 30–90 วัน ({(dio / 90).toFixed(1)}× ของมาตรฐาน)
                </Insight>;
              }
              if (dio > 90) {
                return <Insight tone="warn">
                  <strong>DIO {formatNumber(dio, 0)} วัน ค่อนข้างสูง:</strong>{' '}
                  เกินมาตรฐานอาหาร (30–90 วัน) — แนะนำเร่งระบายสินค้ากลุ่ม Slow / Dead
                </Insight>;
              }
              return <Insight tone="ok">
                <strong>DIO {formatNumber(dio, 0)} วัน:</strong>{' '}
                อยู่ในเกณฑ์มาตรฐานอุตสาหกรรมอาหาร (30–90 วัน)
              </Insight>;
            })()}
          </>}
        />
        <KpiCard
          icon={<Package size={18} />}
          label="Active SKUs"
          value={kpiLoading ? '...' : formatNumber(kpi?.activeItems ?? 0)}
          sublabel="มี tx ใน 90 วัน"
          color={COLORS.teal}
          tooltipTitle="Active SKUs"
          tooltip={<>
            <p className="mb-2">จำนวนรหัสสินค้าที่มีการเคลื่อนไหวใน 90 วันที่ผ่านมา</p>
            <CalcBlock formula="COUNT(DISTINCT item_code) WHERE doc_date ≥ today − 90d">
              <CalcLine label="Active SKUs" value={formatNumber(kpi?.activeItems ?? 0)} bold />
            </CalcBlock>
            <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              SKU ที่ไม่ Active = ไม่มีธุรกรรมเกิน 90 วัน → จัดอยู่ใน Slow / Dead Stock
            </p>
            {(() => {
              const active = kpi?.activeItems ?? 0;
              const inactive = Math.max(0, movementHealth.total - active);
              if (movementHealth.total === 0) {
                return <Insight tone="info">
                  Active SKU = SKU ที่มีธุรกรรม In/Out ภายใน 90 วันที่ผ่านมา
                </Insight>;
              }
              const activePct = (active / movementHealth.total) * 100;
              if (activePct < 30) {
                return <Insight tone="critical">
                  <strong>Active SKU เพียง {activePct.toFixed(0)}% ของทั้งคลัง:</strong>{' '}
                  มี {formatNumber(active)} จาก {formatNumber(movementHealth.total)} SKU
                  มีการเคลื่อนไหวใน 90 วัน — อีก {formatNumber(inactive)} SKU
                  ไม่ขยับ จัดอยู่ใน Slow / Dead Stock
                </Insight>;
              }
              if (activePct < 60) {
                return <Insight tone="warn">
                  Active {formatNumber(active)} จาก {formatNumber(movementHealth.total)} SKU
                  ({activePct.toFixed(0)}%) — มี {formatNumber(inactive)} SKU
                  ไม่มีการเคลื่อนไหวเกิน 90 วัน → เสี่ยงเป็น Slow / Dead Stock
                </Insight>;
              }
              return <Insight tone="ok">
                Active {formatNumber(active)} จาก {formatNumber(movementHealth.total)} SKU
                ({activePct.toFixed(0)}%) — สัดส่วน SKU ที่หมุนเวียนอยู่ในเกณฑ์ดี
              </Insight>;
            })()}
          </>}
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="Expiring ≤ 30 วัน"
          value={formatNumber(expiringSoon.lots)}
          sublabel={`${expiringSoon.expiredLots > 0 ? `🔴 หมดแล้ว ${expiringSoon.expiredLots} lots · ` : ''}฿${formatCompact(expiringSoon.value)}`}
          color={expiringSoon.expiredLots > 0 ? COLORS.red : expiringSoon.lots > 0 ? COLORS.amber : COLORS.green}
          tooltipTitle="Lots ใกล้หมดอายุ"
          tooltip={<>
            <p className="mb-2">รวม lot ที่ <strong>หมดแล้ว + จะหมดใน 30 วัน</strong></p>
            <CalcBlock formula="Σ lots WHERE bucket IN ('expired', '0-30')">
              <CalcLine label="🔴 หมดแล้ว"        value={`${formatNumber(expiringSoon.expiredLots)} lots · ฿${formatCompact(expiringSoon.expiredValue)}`} />
              <CalcLine label="🟠 ≤ 30 วัน"       value={`${formatNumber(expiringSoon.lots - expiringSoon.expiredLots)} lots · ฿${formatCompact(expiringSoon.value - expiringSoon.expiredValue)}`} />
              <CalcLine label="รวม"                value={`${formatNumber(expiringSoon.lots)} lots · ฿${formatCompact(expiringSoon.value)}`} bold />
            </CalcBlock>
            <p className="mt-2"><strong>Action:</strong> ดู FEFO Pick List เพื่อเร่งระบาย</p>
            {expiringSoon.expiredLots > 0 && (
              <Insight tone="critical">
                🚨 <strong>มี lot หมดอายุไปแล้ว {formatNumber(expiringSoon.expiredLots)} lots</strong>{' '}
                มูลค่า ฿{formatCompact(expiringSoon.expiredValue)} —
                ต้องเร่งระบายหรือ write-off ทันที (เสี่ยงผิด GMP/HACCP หากยังเก็บไว้)
              </Insight>
            )}
            {expiringSoon.expiredLots === 0 && expiringSoon.lots > 0 && (
              <Insight tone="warn">
                ⚠️ <strong>{formatNumber(expiringSoon.lots)} lots</strong> จะหมดอายุภายใน 30 วัน
                มูลค่า ฿{formatCompact(expiringSoon.value)} —
                แนะนำใช้ FEFO Pick List เร่งระบาย ก่อนสูญเสียมูลค่า
              </Insight>
            )}
            {expiringSoon.lots === 0 && (
              <Insight tone="ok">
                ✅ ไม่มี lot ที่หมดอายุภายใน 30 วันข้างหน้า — สภาพคลังด้านอายุสินค้าอยู่ในเกณฑ์ดี
              </Insight>
            )}
          </>}
        />
        <KpiCard
          icon={<TrendingDown size={18} />}
          label="Dead Stock %"
          value={`${movementHealth.deadPct.toFixed(1)}%`}
          sublabel={`${formatNumber(movementHealth.counts.dead_stock, 0)} items · ฿${formatCompact(movementHealth.values.dead_stock)}`}
          color={movementHealth.deadPct <= 5 ? COLORS.green : movementHealth.deadPct <= 15 ? COLORS.amber : COLORS.red}
          tooltipTitle="Dead Stock %"
          tooltip={<>
            <p className="mb-2">สินค้าที่ไม่มีการเคลื่อนไหวเลย ≥ 180 วัน</p>
            <CalcBlock formula="Dead % = Dead items / Total items × 100">
              <CalcLine label="Dead items"  value={`${formatNumber(movementHealth.counts.dead_stock)} items`} />
              <CalcLine label="÷ Total"      value={`${formatNumber(movementHealth.total)} items`} />
              <CalcLine label="= Dead %"     value={`${movementHealth.deadPct.toFixed(2)}%`} bold />
            </CalcBlock>
            <p className="mt-2 mb-1"><strong>มูลค่าเสี่ยง</strong></p>
            <CalcBlock formula="">
              <CalcLine label="Dead stock value"  value={`฿${formatNumber(movementHealth.values.dead_stock, 0)}`} bold />
              <CalcLine label="Slow stock value"  value={`฿${formatNumber(movementHealth.values.slow_moving, 0)}`} muted />
            </CalcBlock>
            <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>มาตรฐาน Dead Stock ควร &lt; 5%</p>
            {(() => {
              const deadPct      = movementHealth.deadPct;
              const deadValPct   = movementHealth.deadValuePct;
              const deadCount    = movementHealth.counts.dead_stock;
              const deadVal      = movementHealth.values.dead_stock;
              if (deadPct > 50) {
                return <Insight tone="critical">
                  <strong>Dead Stock % สูงถึง {deadPct.toFixed(1)}%:</strong>{' '}
                  มูลค่าเงินที่จมคิดเป็น {deadValPct.toFixed(1)}% ของคลังทั้งหมด (฿{formatCompact(deadVal)}) ·
                  มีสินค้าถึง <strong>{formatNumber(deadCount)} รายการ</strong>ที่ไม่มีการเคลื่อนไหวเลย —
                  มาตรฐานควร &lt; 5%
                </Insight>;
              }
              if (deadPct > 15) {
                return <Insight tone="critical">
                  <strong>Dead Stock {deadPct.toFixed(1)}% สูงกว่ามาตรฐานมาก:</strong>{' '}
                  มี {formatNumber(deadCount)} รายการ มูลค่า ฿{formatCompact(deadVal)}
                  ({deadValPct.toFixed(1)}% ของมูลค่าคลังรวม) ไม่ขยับเลย ≥ 180 วัน — มาตรฐานควร &lt; 5%
                </Insight>;
              }
              if (deadPct > 5) {
                return <Insight tone="warn">
                  <strong>Dead Stock {deadPct.toFixed(1)}% เกินมาตรฐาน (&lt; 5%):</strong>{' '}
                  มี {formatNumber(deadCount)} รายการ ({formatCompact(deadVal)} บาท) ไม่ขยับเลย ≥ 180 วัน
                </Insight>;
              }
              return <Insight tone="ok">
                <strong>Dead Stock {deadPct.toFixed(1)}%</strong> อยู่ในเกณฑ์มาตรฐาน (&lt; 5%) — สภาพคลังดี
              </Insight>;
            })()}
          </>}
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
                      return [`฿${formatCompact(Number(v ?? 0))} (${pct}%) · ${formatNumber(item?.payload?.lots ?? 0, 0)} lots`, item?.payload?.label];
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

      {/* ====== Section 3b: VV Matrix Overview ====== */}
      {vvSummary && (
        <div className="space-y-4">
          {/* Header strip explaining the section */}
          <div className="card flex items-center gap-3"
               style={{ borderLeft: `4px solid ${COLORS.purple}`,
                        background: 'linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(124,58,237,0.02) 100%)' }}>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
              <Target size={20} style={{ color: COLORS.purple }} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                VV Matrix Overview <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(Value × Validity)</span>
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                จัดอันดับสินค้าตามมูลค่า × ความสด · {formatNumber(vvSummary.total)} lots · α={vvSummary.alpha}
              </p>
            </div>
            <InfoTooltip title="VV Matrix คืออะไร">
              <p className="mb-2">
                <strong>Value × Validity Matrix</strong> — เครื่องมือจัดอันดับสินค้าโดยรวม
                <strong> มูลค่า</strong> และ <strong>วันก่อนหมดอายุ</strong> เข้าด้วยกัน
              </p>
              <CalcBlock formula="Exp Score = Value × (Validity/5)^α">
                <CalcLine label="α (ใช้ในระบบ)" value={`${vvSummary.alpha}`} />
                <CalcLine label="Class A เกณฑ์" value={`Score ≥ ${vvSummary.cfg.exp_class_a}`} muted />
                <CalcLine label="Class B เกณฑ์" value={`Score ≥ ${vvSummary.cfg.exp_class_b}`} muted />
                <CalcLine label="Class C เกณฑ์" value={`Score < ${vvSummary.cfg.exp_class_b}`} muted />
              </CalcBlock>
              <p>คำนวณที่ระดับ <strong>Lot</strong> (1 lot = 1 หน่วยให้คะแนน) — ดูรายละเอียดเต็มที่ Reports → VV Matrix</p>
            </InfoTooltip>
          </div>

          {/* KPI Strip — 4 cards (Class A · Class B · Class C · Critical) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<TrendingUp size={18} />}
              label="Class A — Strategic"
              value={`${vvSummary.pct.A.toFixed(0)}%`}
              sublabel={`${formatNumber(vvSummary.counts.A)} lots · ฿${formatCompact(vvSummary.values.A)}`}
              color={COLORS.green}
              tooltipTitle="Class A — Strategic"
              tooltip={<>
                <p className="mb-2">สินค้า <strong>มูลค่าสูง + ความสดสูง</strong> — ของหลักของธุรกิจ</p>
                <CalcBlock formula="Exp Score ≥ 3.5 (default)">
                  <CalcLine label="จำนวน" value={`${formatNumber(vvSummary.counts.A)} lots`} bold />
                  <CalcLine label="มูลค่า" value={`฿${formatNumber(vvSummary.values.A, 0)}`} bold />
                  <CalcLine label="% ของรวม" value={`${vvSummary.pct.A.toFixed(2)}%`} />
                </CalcBlock>
                <p className="mt-2"><strong>Action:</strong> รักษา availability · Push growth</p>
              </>}
            />
            <KpiCard
              icon={<Activity size={18} />}
              label="Class B — Core"
              value={`${vvSummary.pct.B.toFixed(0)}%`}
              sublabel={`${formatNumber(vvSummary.counts.B)} lots · ฿${formatCompact(vvSummary.values.B)}`}
              color={COLORS.amber}
              tooltipTitle="Class B — Core"
              tooltip={<>
                <p className="mb-2">สินค้า <strong>ระดับกลาง</strong> — Monitor + Optimize</p>
                <CalcBlock formula="Exp Score ≥ 1.5 (default)">
                  <CalcLine label="จำนวน" value={`${formatNumber(vvSummary.counts.B)} lots`} bold />
                  <CalcLine label="มูลค่า" value={`฿${formatNumber(vvSummary.values.B, 0)}`} bold />
                  <CalcLine label="% ของรวม" value={`${vvSummary.pct.B.toFixed(2)}%`} />
                </CalcBlock>
                <p className="mt-2"><strong>Action:</strong> Monitor / Optimize pricing</p>
              </>}
            />
            <KpiCard
              icon={<TrendingDown size={18} />}
              label="Class C — At Risk"
              value={`${vvSummary.pct.C.toFixed(0)}%`}
              sublabel={`${formatNumber(vvSummary.counts.C)} lots · ฿${formatCompact(vvSummary.values.C)}`}
              color={COLORS.red}
              tooltipTitle="Class C — At Risk"
              tooltip={<>
                <p className="mb-2">
                  สินค้า <strong>ของถูกหรือใกล้หมดอายุ</strong> — ต้องเร่งระบายเพื่อปลดล็อกเงินสด
                </p>
                <CalcBlock formula="Exp Score < 1.5 (default)">
                  <CalcLine label="จำนวน" value={`${formatNumber(vvSummary.counts.C)} lots`} bold />
                  <CalcLine label="Value at Risk" value={`฿${formatNumber(vvSummary.classCValue, 0)}`} bold />
                  <CalcLine label="% ของรวม" value={`${vvSummary.pct.C.toFixed(2)}%`} />
                </CalcBlock>
                <p className="mt-2"><strong>Action:</strong> ลดราคา · โปรโมชั่น · Clearance</p>
              </>}
            />
            <KpiCard
              icon={<AlertTriangle size={18} />}
              label="🔴 Critical Items"
              value={formatNumber(vvSummary.criticalCount)}
              sublabel={`฿${formatCompact(vvSummary.criticalValue)} · ต้อง Action ด่วน`}
              color={COLORS.purple}
              tooltipTitle="Critical Items"
              tooltip={<>
                <p className="mb-2">
                  สินค้า <strong>มูลค่าสูง × ใกล้หมดอายุ</strong> — เร่งด่วนที่สุด
                </p>
                <CalcBlock formula="Value Score ≥ 4 AND Validity Score ≤ 2">
                  <CalcLine label="Critical items" value={`${formatNumber(vvSummary.criticalCount)} lots`} bold />
                  <CalcLine label="มูลค่าที่เสี่ยง" value={`฿${formatNumber(vvSummary.criticalValue, 0)}`} bold />
                  <CalcLine label="High Risk (รวม Critical)" value={`${formatNumber(vvSummary.highRiskCount)} lots`} muted />
                </CalcBlock>
                <p className="mt-2"><strong>Action:</strong> URGENT SALE — ดู Reports → VV Matrix → กรอง Critical</p>
              </>}
            />
          </div>

          {/* Donut + Critical Items list */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Donut */}
            <div className="card lg:col-span-2">
              <div className="flex items-center gap-2 mb-1">
                <Target size={16} style={{ color: COLORS.purple }} />
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>การกระจาย VV Class</h3>
                <InfoTooltip title="VV Class Distribution">
                  <p className="mb-2">สัดส่วน <strong>จำนวน lot</strong> ในแต่ละ Class</p>
                  <p>🟢 A = ดาวเด่น · 🟠 B = กลาง · 🔴 C = ต้องระบาย</p>
                  <p className="mt-2 text-[10px] italic">นับโดย <strong>จำนวน</strong> ไม่ใช่มูลค่า · ดูมูลค่าใน KPI cards ด้านบน</p>
                </InfoTooltip>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>By lot count</p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'A — Strategic', value: vvSummary.counts.A, color: COLORS.green },
                        { name: 'B — Core',      value: vvSummary.counts.B, color: COLORS.amber },
                        { name: 'C — At Risk',   value: vvSummary.counts.C, color: COLORS.red },
                      ].filter(x => x.value > 0)}
                      dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}
                    >
                      <Cell fill={COLORS.green} />
                      <Cell fill={COLORS.amber} />
                      <Cell fill={COLORS.red} />
                    </Pie>
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v?: number | string, name?: string) => {
                        const pct = vvSummary.total > 0 ? ((Number(v) / vvSummary.total) * 100).toFixed(1) : '0';
                        return [`${formatNumber(Number(v ?? 0))} lots (${pct}%)`, name];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.green }} />
                    <span style={{ color: 'var(--text-muted)' }}>A</span>
                  </div>
                  <div className="font-semibold tabular-nums mt-0.5" style={{ color: COLORS.green }}>
                    {vvSummary.pct.A.toFixed(0)}%
                  </div>
                </div>
                <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.amber }} />
                    <span style={{ color: 'var(--text-muted)' }}>B</span>
                  </div>
                  <div className="font-semibold tabular-nums mt-0.5" style={{ color: COLORS.amber }}>
                    {vvSummary.pct.B.toFixed(0)}%
                  </div>
                </div>
                <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.red }} />
                    <span style={{ color: 'var(--text-muted)' }}>C</span>
                  </div>
                  <div className="font-semibold tabular-nums mt-0.5" style={{ color: COLORS.red }}>
                    {vvSummary.pct.C.toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Top 5 Critical Items */}
            <div className="card lg:col-span-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} style={{ color: COLORS.purple }} />
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Top 5 Critical Items</h3>
                <InfoTooltip title="Critical Items">
                  <p className="mb-2">รายการที่ต้อง <strong>เร่งระบายด่วนที่สุด</strong></p>
                  <p>เกณฑ์: Value Score ≥ 4 AND Validity Score ≤ 2 · เรียงตามมูลค่า</p>
                </InfoTooltip>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                High value × Near expiry — ลำดับตามมูลค่า
              </p>
              {vvSummary.topCritical.length === 0 ? (
                <EmptyChart icon={<AlertTriangle size={28} />} text="ไม่มี Critical items 🎉" />
              ) : (
                <div className="space-y-2">
                  {vvSummary.topCritical.map((row, idx) => (
                    <div key={`${row.item_code}-${idx}`} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: COLORS.purple, color: '#fff' }}
                      >{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-xs font-mono" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</span>
                          {row.batch_num && (
                            <span className="text-[10px] font-mono px-1 rounded" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                              {row.batch_num.slice(0, 12)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{row.itemname}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>฿{formatCompact(row.stock_value)}</p>
                        <p className="text-[10px] tabular-nums" style={{ color: COLORS.red }}>
                          {row.remaining_days != null
                            ? (row.remaining_days < 0 ? `หมดแล้ว ${Math.abs(row.remaining_days)} วัน` : `เหลือ ${row.remaining_days} วัน`)
                            : 'ไม่ระบุ'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== Section 6: MoM + QoQ Comparison (2 cols) ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* QoQ Comparison */}
        <div className="card relative">
          <div className="flex items-center gap-2 mb-1">
            <CalendarRange size={16} style={{ color: COLORS.primary }} />
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>เทียบไตรมาสก่อน (QoQ)</h3>
            <InfoTooltip title="Quarter-over-Quarter">
              <p className="mb-2">รวม 3 เดือนล่าสุด เทียบกับ 3 เดือนก่อนหน้า — ช่วยกรอง noise รายเดือน</p>
              <p>🟢 % เขียว = ขึ้น · 🔴 % แดง = ลง</p>
            </InfoTooltip>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {qoq
              ? `${formatDate(qoq.currStart)}–${formatDate(qoq.currEnd)} vs ${formatDate(qoq.prevStart)}–${formatDate(qoq.prevEnd)}`
              : 'Quarter-over-Quarter Comparison'}
          </p>
          {!qoq ? (
            <EmptyChart icon={<CalendarRange size={28} />} text="ต้องมีข้อมูลอย่างน้อย 6 เดือน" />
          ) : (
            <div className="space-y-3">
              <MomRow label="รับเข้า (In)"   curr={qoq.inCurr}  prev={qoq.inPrev}  pct={qoq.inPct}  color={COLORS.green} />
              <MomRow label="จ่ายออก (Out)"  curr={qoq.outCurr} prev={qoq.outPrev} pct={qoq.outPct} color={COLORS.red} />
              <MomRow label="Net (สุทธิ)"
                      curr={qoq.inCurr - qoq.outCurr}
                      prev={qoq.inPrev - qoq.outPrev}
                      pct={(qoq.inPrev - qoq.outPrev) === 0 ? 0 : (((qoq.inCurr - qoq.outCurr) - (qoq.inPrev - qoq.outPrev)) / Math.abs(qoq.inPrev - qoq.outPrev)) * 100}
                      color={COLORS.primary} />
            </div>
          )}
        </div>
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

// ── Calculation block (used inside KPI tooltips to show the math) ───────────
function CalcBlock({ formula, children }: { formula: string; children: React.ReactNode }) {
  return (
    <div className="rounded p-2 text-[11px] my-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
      {formula && (
        <p className="font-mono mb-1.5 pb-1.5 border-b" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
          {formula}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CalcLine({ label, value, bold, muted }: {
  label: string; value: string; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]"
         style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
      <span className={bold ? 'font-semibold' : ''}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * Interpretive narrative block — sits at the bottom of a KPI tooltip and
 * translates the raw numbers into plain Thai with industry benchmarks.
 *
 *   tone='critical' → red    (vicious red wash, for true alarms)
 *   tone='warn'     → amber  (above standard but not yet critical)
 *   tone='ok'       → green  (within benchmark)
 *   tone='info'     → blue   (neutral context — no severity)
 */
function Insight({ tone, children }: { tone: 'critical' | 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  const palette = {
    critical: { bg: 'rgba(220,38,38,0.10)', border: '#dc2626', fg: '#991b1b' },
    warn:     { bg: 'rgba(234,88,12,0.10)', border: '#ea580c', fg: '#9a3412' },
    ok:       { bg: 'rgba(22,163,74,0.10)', border: '#16a34a', fg: '#15803d' },
    info:     { bg: 'rgba(31,56,100,0.08)', border: '#1F3864', fg: 'var(--text)' },
  }[tone];
  return (
    <div
      className="mt-2 rounded p-2 text-[11px] leading-relaxed"
      style={{
        backgroundColor: palette.bg,
        borderLeft: `3px solid ${palette.border}`,
        color: palette.fg,
      }}
    >
      {children}
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
