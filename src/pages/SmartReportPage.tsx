/**
 * Smart Inventory Intelligent Report
 * ──────────────────────────────────
 * AI-style executive summary that synthesizes the latest snapshot into a
 * narrative report: headline situation → working capital → turnover health →
 * lot aging → top concerns → recommended actions. The narrative is rule-based
 * (deterministic heuristics over real KPIs) so it ships without an external
 * LLM and is easy to audit; the structure is designed so a real Claude/OpenAI
 * call could later replace the synthesizer in one place if desired.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Printer, AlertTriangle, CheckCircle2, TrendingDown, Layers, Boxes, Coins, Calendar, ArrowDownRight, RefreshCw, Bot } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  useStockOnHand, useMonthlyTotal, useLotAging, useLotDetail, useSlowMoving,
  useInventoryTurnover, useLatestLotSnapshot,
} from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatCurrency, formatCompact, formatDate } from '@/utils/format';

// ── helpers ────────────────────────────────────────────────────────────────
const num = (v: unknown) => Number(v ?? 0);
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Tiny markdown renderer for the Gemini output (## headers, **bold**, numbered
 *  lists). Keeps bundle small — full markdown lib isn't justified here. */
function renderMarkdown(src: string): React.ReactNode[] {
  // Render bold inline within a line.
  const renderInline = (line: string, k: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${k}-b${i}`} style={{ color: 'var(--text)' }}>{p.slice(2, -2)}</strong>
      : <span key={`${k}-t${i}`}>{p}</span>);
  };
  return src.split('\n').map((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      return <h4 key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: 'var(--text)' }}>{renderInline(line.slice(4), `h4-${i}`)}</h4>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={i} className="text-base font-bold mt-4 mb-1.5" style={{ color: 'var(--color-primary)' }}>{renderInline(line.slice(3), `h3-${i}`)}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--color-primary)' }}>{renderInline(line.slice(2), `h2-${i}`)}</h2>;
    }
    if (line === '') return <div key={i} className="h-2" />;
    // Numbered list "1. ..."
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      return (
        <div key={i} className="flex gap-2 text-sm leading-relaxed mb-1" style={{ color: 'var(--text)' }}>
          <span className="font-semibold shrink-0" style={{ color: 'var(--color-primary-light)' }}>{numMatch[1]}.</span>
          <span className="flex-1">{renderInline(numMatch[2], `ol-${i}`)}</span>
        </div>
      );
    }
    // Bullet "- ..."
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 text-sm leading-relaxed mb-1" style={{ color: 'var(--text)' }}>
          <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>•</span>
          <span className="flex-1">{renderInline(line.slice(2), `ul-${i}`)}</span>
        </div>
      );
    }
    return <p key={i} className="text-sm leading-relaxed mb-1" style={{ color: 'var(--text)' }}>{renderInline(line, `p-${i}`)}</p>;
  });
}

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="card" style={{ pageBreakInside: 'avoid' }}>
    <h2 className="flex items-center gap-2 text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
      <span style={{ color: 'var(--color-primary)' }}>{icon}</span>{title}
    </h2>
    {children}
  </section>
);

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) => {
  const color = tone === 'good' ? '#16a34a' : tone === 'warn' ? '#d97706' : tone === 'bad' ? '#dc2626' : 'var(--text)';
  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-alt)' }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
};

const Bullet = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) => {
  const bg = tone === 'good' ? 'rgba(22,163,74,0.08)' : tone === 'warn' ? 'rgba(217,119,6,0.10)' : tone === 'bad' ? 'rgba(220,38,38,0.10)' : 'rgba(31,56,100,0.08)';
  const color = tone === 'good' ? '#15803d' : tone === 'warn' ? '#92400e' : tone === 'bad' ? '#991b1b' : '#1e3a8a';
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'bad' ? AlertTriangle : tone === 'warn' ? TrendingDown : Sparkles;
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs leading-relaxed" style={{ backgroundColor: bg, color }}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
};

// ── page ───────────────────────────────────────────────────────────────────
export function SmartReportPage() {
  const { data: stockData = [] }   = useStockOnHand();
  const { data: monthlyTotal = [] } = useMonthlyTotal(24);
  const { data: lotAging = [] }    = useLotAging();
  const { data: slowMoving = [] }  = useSlowMoving();
  const { data: turnover = [] }    = useInventoryTurnover();
  const { data: latestSnap }       = useLatestLotSnapshot();
  // Individual at-risk lots for the Top 5 list (days_remaining ≤ 30, top by value)
  const { data: atRiskLotsResp }   = useLotDetail({ daysRemainingMax: 30, pageSize: 50 });
  const atRiskLots = atRiskLotsResp?.data ?? [];

  // ── Synthesize all metrics in one memo ──────────────────────────────────
  const report = useMemo(() => {
    // Working capital — actual lot cost is the truth, WAC ≈ same
    const actualValue = stockData.reduce((s, r) => s + num((r as any).lot_value ?? r.stock_value), 0);
    const wacValue    = stockData.reduce((s, r) => s + num(r.stock_value), 0);
    const stdValue    = stockData.reduce((s, r) => s + num(r.current_stock) * num(r.std_cost), 0);
    const totalQty    = stockData.reduce((s, r) => s + num(r.current_stock), 0);
    const totalLines  = stockData.length;
    const totalItems  = new Set(stockData.map(r => r.item_code)).size;
    const totalWh     = new Set(stockData.map(r => r.warehouse)).size;

    // COGS (12mo) + turnover
    const last12 = monthlyTotal.slice(-12);
    const cogs12mo = last12.reduce((s, m) => s + num(m.out_value), 0);
    const turn = actualValue > 0 ? cogs12mo / actualValue : 0;
    const dio  = turn > 0 ? Math.round(365 / turn) : null;
    const carryingCost = actualValue * 0.15; // 15%/yr industry standard
    const coverYears = cogs12mo > 0 ? actualValue / cogs12mo : null;

    // Lot aging — useLotAging returns pre-aggregated bucket rows
    // (one per warehouse × group × bucket). Roll up per bucket.
    const sumBucket = (bucket: string) => lotAging
      .filter(b => b.aging_bucket === bucket)
      .reduce((acc, b) => ({
        lots:  acc.lots  + num(b.lot_count),
        value: acc.value + num(b.total_value),
      }), { lots: 0, value: 0 });
    const expB    = sumBucket('expired');
    const exp30B  = sumBucket('0-30');
    const exp60B  = sumBucket('31-60');
    const exp90B  = sumBucket('61-90');
    const expired    = { length: expB.lots };
    const expiring30 = { length: exp30B.lots };
    const expiring90 = { length: exp60B.lots + exp90B.lots };
    const expiredValue  = expB.value;
    const expiring30Val = exp30B.value;
    const expiring90Val = exp60B.value + exp90B.value;
    const totalLots = lotAging.reduce((s, b) => s + num(b.lot_count), 0);

    // Movement health
    const dead     = slowMoving.filter(s => s.movement_status === 'dead_stock');
    const slow     = slowMoving.filter(s => s.movement_status === 'slow_moving');
    const normal   = slowMoving.filter(s => s.movement_status === 'normal');
    const deadValue   = dead.reduce((s, r) => s + num(r.stock_value), 0);
    const slowValue   = slow.reduce((s, r) => s + num(r.stock_value), 0);
    const deadPct  = pct(dead.length, slowMoving.length);

    // Top concerns — highest value among dead + slow
    const topDeadValue = [...dead].sort((a, b) => num(b.stock_value) - num(a.stock_value)).slice(0, 5);
    const topSlowValue = [...slow].sort((a, b) => num(b.stock_value) - num(a.stock_value)).slice(0, 5);
    // Top expiring at risk — from useLotDetail (individual lots ≤ 30 days)
    const topExpiring = [...atRiskLots]
      .sort((a: any, b: any) => num(b.amount) - num(a.amount))
      .slice(0, 5);

    // Turnover bands distribution
    const turnoverBands = {
      veryLow: turnover.filter(t => num(t.turnover_ratio) < 1.5).length,
      low:     turnover.filter(t => num(t.turnover_ratio) >= 1.5 && num(t.turnover_ratio) < 3).length,
      mid:     turnover.filter(t => num(t.turnover_ratio) >= 3 && num(t.turnover_ratio) < 10).length,
      high:    turnover.filter(t => num(t.turnover_ratio) >= 10).length,
    };

    // Value by item group
    const byGroup = new Map<string, { count: number; value: number }>();
    for (const r of stockData) {
      const g = r.group_name?.split('-')[0] ?? 'อื่นๆ';
      const v = byGroup.get(g) ?? { count: 0, value: 0 };
      v.count += 1;
      v.value += num(r.stock_value);
      byGroup.set(g, v);
    }
    const groupBreakdown = [...byGroup.entries()]
      .map(([name, v]) => ({ name, ...v, share: pct(v.value, wacValue) }))
      .sort((a, b) => b.value - a.value);

    // Overall health verdict
    let verdict: 'good' | 'warn' | 'bad' = 'good';
    if (turn < 2 || deadPct > 25 || (coverYears != null && coverYears > 1)) verdict = 'bad';
    else if (turn < 4 || deadPct > 15 || (coverYears != null && coverYears > 0.5)) verdict = 'warn';

    return {
      actualValue, wacValue, stdValue, totalQty, totalLines, totalItems, totalWh,
      cogs12mo, turn, dio, carryingCost, coverYears,
      expired, expiring30, expiring90, expiredValue, expiring30Val, expiring90Val, totalLots,
      dead, slow, normal, deadValue, slowValue, deadPct,
      topDeadValue, topSlowValue, topExpiring,
      turnoverBands, groupBreakdown,
      verdict,
      monthsCounted: last12.length,
    };
  }, [stockData, monthlyTotal, lotAging, slowMoving, turnover, atRiskLots]);

  const r = report;
  const snapDate = latestSnap ?? null;
  const now = new Date();

  // ── Call the Gemini edge function for an AI-generated executive summary.
  // Cache per snapshot date — refresh only on snapshot change or explicit click.
  const [refreshTick, setRefreshTick] = useState(0);
  const ai = useQuery({
    queryKey: ['gemini-report', snapDate, refreshTick],
    enabled:  !!snapDate && r.totalItems > 0,
    staleTime: 60 * 60 * 1000, // 1 hour
    queryFn: async () => {
      const payload = {
        snapshot_date: snapDate,
        working_capital_actual_thb: Math.round(r.actualValue),
        working_capital_wac_thb:    Math.round(r.wacValue),
        std_cost_value_thb:         Math.round(r.stdValue),
        cogs_12mo_thb:              Math.round(r.cogs12mo),
        inventory_turnover_x:       Number(r.turn.toFixed(2)),
        dio_days:                   r.dio,
        inventory_cover_years:      r.coverYears != null ? Number(r.coverYears.toFixed(2)) : null,
        carrying_cost_15pct_thb:    Math.round(r.carryingCost),
        total_skus:                 r.totalItems,
        total_lines:                r.totalLines,
        total_warehouses:           r.totalWh,
        total_lots:                 r.totalLots,
        dead_stock_count:           r.dead.length,
        dead_stock_pct:             Number(r.deadPct.toFixed(1)),
        dead_stock_value_thb:       Math.round(r.deadValue),
        slow_moving_count:          r.slow.length,
        slow_moving_value_thb:      Math.round(r.slowValue),
        lots_expired:               r.expired.length,
        lots_expired_value_thb:     Math.round(r.expiredValue),
        lots_expiring_30d:          r.expiring30.length,
        lots_expiring_30d_value_thb:Math.round(r.expiring30Val),
        lots_expiring_31_90d:       r.expiring90.length,
        turnover_distribution: {
          'lt_1.5x':  r.turnoverBands.veryLow,
          '1.5_3x':   r.turnoverBands.low,
          '3_10x':    r.turnoverBands.mid,
          'gte_10x':  r.turnoverBands.high,
        },
        top_value_groups: r.groupBreakdown.slice(0, 5).map(g => ({
          name: g.name, value_thb: Math.round(g.value), share_pct: Number(g.share.toFixed(1)),
        })),
        top_dead_stock: r.topDeadValue.slice(0, 5).map((s: any) => ({
          item_code: s.item_code, itemname: s.itemname, value_thb: Math.round(num(s.stock_value)),
        })),
        top_slow_moving: r.topSlowValue.slice(0, 5).map((s: any) => ({
          item_code: s.item_code, itemname: s.itemname, value_thb: Math.round(num(s.stock_value)),
        })),
        top_at_risk_lots: r.topExpiring.slice(0, 5).map((l: any) => ({
          item_code: l.item_code, itemname: l.itemname,
          days_remaining: num(l.days_remaining),
          value_thb: Math.round(num(l.amount)),
        })),
        verdict: r.verdict, // 'good' | 'warn' | 'bad'
        potential_savings_thb: Math.round(r.expiredValue + r.expiring30Val + r.carryingCost * 0.10),
      };
      const { data, error } = await supabase.functions.invoke('gemini-report', { body: payload });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error + ((data as any).hint ? ` — ${(data as any).hint}` : ''));
      return data as { ok: true; text: string; model: string };
    },
  });

  // ── Narrative paragraphs (rule-based) ───────────────────────────────────
  const headline = (() => {
    if (r.verdict === 'good')
      return `สถานการณ์โดยรวม: <strong>ดี</strong> — สต็อกหมุนเวียน ${r.turn.toFixed(2)}×/ปี, dead stock ${r.deadPct.toFixed(1)}% ของรายการ, มูลค่าจม ฿${formatCompact(r.actualValue)} เทียบกับ COGS 12 เดือน ฿${formatCompact(r.cogs12mo)} อยู่ในเกณฑ์ปกติ`;
    if (r.verdict === 'warn')
      return `สถานการณ์โดยรวม: <strong>ควรปรับปรุง</strong> — turnover ${r.turn.toFixed(2)}× ${r.turn < 4 ? '(ต่ำกว่าเกณฑ์อาหาร 4×/ปี)' : ''} · dead stock ${r.deadPct.toFixed(1)}% · มี ${formatNumber(r.expiring30.length + r.expired.length)} lots ที่หมดอายุแล้วหรือเหลือ ≤ 30 วัน (฿${formatCompact(r.expiredValue + r.expiring30Val)})`;
    return `สถานการณ์โดยรวม: <strong style="color:#dc2626">วิกฤต</strong> — turnover ${r.turn.toFixed(2)}× · เงินจม ฿${formatCompact(r.actualValue)} ${r.coverYears != null ? `≈ COGS ${r.coverYears.toFixed(1)} ปี` : ''} · dead stock ${r.deadPct.toFixed(1)}% (${formatNumber(r.dead.length)} รายการ ฿${formatCompact(r.deadValue)}) · ต้องเร่งจัดการ`;
  })();

  // ── Recommended actions (priority-ordered) ──────────────────────────────
  const actions: { tone: 'bad' | 'warn' | 'good' | 'info'; text: string }[] = [];
  if (r.expired.length > 0)
    actions.push({ tone: 'bad', text: `<strong>เร่งด่วน:</strong> ตัดจำหน่าย/ทำลาย ${formatNumber(r.expired.length)} lots ที่หมดอายุแล้ว มูลค่า <strong>${formatCurrency(r.expiredValue)}</strong> ที่ค้างในระบบ` });
  if (r.expiring30.length > 0)
    actions.push({ tone: 'warn', text: `<strong>ภายใน 30 วัน:</strong> ${formatNumber(r.expiring30.length)} lots (฿${formatCompact(r.expiring30Val)}) จะหมดอายุ — จัดโปรโมชั่น/เร่งกระจายไป FG warehouse` });
  if (r.deadPct > 20)
    actions.push({ tone: 'bad', text: `<strong>Dead stock สูง (${r.deadPct.toFixed(1)}%):</strong> ทบทวน ${formatNumber(r.dead.length)} รายการที่ไม่เคลื่อนไหว ≥ 180 วัน — ตัด SKU, ส่งคืน supplier, หรือ markdown` });
  if (r.turn < 4 && r.turn > 0)
    actions.push({ tone: 'warn', text: `<strong>Turnover ต่ำ (${r.turn.toFixed(2)}×/ปี):</strong> ลดสต็อก slow movers (${formatNumber(r.slow.length)} รายการ ฿${formatCompact(r.slowValue)}) · ปรับ reorder point ให้ตึงขึ้น` });
  if (r.turnoverBands.veryLow > 0)
    actions.push({ tone: 'warn', text: `<strong>${formatNumber(r.turnoverBands.veryLow)} รายการ turnover < 1.5×</strong> — สินค้ากลุ่มนี้หมุนเวียนไม่ถึงปีละ 1.5 รอบ ควรพิจารณาเลิกขายหรือลดราคาตัด` });
  if (r.carryingCost > 1_000_000)
    actions.push({ tone: 'warn', text: `<strong>Carrying Cost ${formatCurrency(r.carryingCost)}/ปี</strong> (15% ของเงินจม) — ลดสต็อกได้ 10% = ประหยัด ฿${formatCompact(r.carryingCost * 0.10)}/ปี` });
  if (r.coverYears != null && r.coverYears > 0.5)
    actions.push({ tone: 'bad', text: `<strong>Inventory cover ${r.coverYears.toFixed(2)} ปี</strong> — สต็อกสะสมเกินยอดขาย ${(r.coverYears * 12).toFixed(0)} เดือน · ตรวจสอบ supplier MOQ และ forecasting` });
  if (actions.length === 0)
    actions.push({ tone: 'good', text: 'ไม่พบจุดที่ต้องเร่งดำเนินการเป็นพิเศษ — รักษามาตรฐานปัจจุบันและทบทวน slow movers รายไตรมาส' });

  return (
    <div className="space-y-4 print:bg-white">
      <PageHeader
        title="Smart Inventory Intelligent Report"
        subtitle={`รายงานสรุปสถานการณ์สต็อกโดยอัตโนมัติ ณ ${snapDate ? formatDate(snapDate) : '—'}`}
        helpTitle="Smart Inventory Intelligent Report"
        helpBody={(<>
          <p className="mb-2">รายงานสังเคราะห์อัตโนมัติจากข้อมูล snapshot ล่าสุด รวบรวม KPI ทั้งหมดให้เห็นภาพใหญ่ในหน้าเดียว</p>
          <p className="mb-2"><strong>เนื้อหา:</strong> Executive Summary, Working Capital, Turnover Health, Lot Aging, มูลค่าตามกลุ่ม, Top Items ที่ควรจับตา, คำแนะนำเชิงรุก</p>
          <p>ทุกตัวเลขมาจากข้อมูลจริงใน Supabase ณ snapshot ที่ระบุ · คำแนะนำสร้างจากเกณฑ์มาตรฐานอุตสาหกรรมอาหาร (turnover ≥ 4×/ปี, carrying cost 15%) · กดปุ่ม "Print / PDF" เพื่อบันทึก/พิมพ์</p>
        </>)}
      />

      {/* Report header strip with Print */}
      <div className="card flex items-center justify-between" style={{ borderLeft: '4px solid var(--color-primary)' }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(31,56,100,0.1)' }}>
            <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              สังเคราะห์โดยอัตโนมัติจากข้อมูล snapshot ล่าสุด · NSL Food Service
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              สร้างเมื่อ {now.toLocaleString('th-TH')} · Lot snapshot: <strong>{snapDate ? formatDate(snapDate) : '—'}</strong>
            </div>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-secondary print:hidden"
        >
          <Printer size={16} /> Print / PDF
        </button>
      </div>

      {/* 0. AI Executive Summary — Gemini-generated narrative */}
      <section className="card" style={{ pageBreakInside: 'avoid', borderLeft: '4px solid #4285F4' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--text)' }}>
            <Bot size={18} style={{ color: '#4285F4' }} />
            AI Executive Summary
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-normal"
                  style={{ backgroundColor: 'rgba(66,133,244,0.10)', color: '#4285F4' }}>
              Powered by Gemini
            </span>
            {ai.data?.model && (
              <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                · {ai.data.model}
              </span>
            )}
          </h2>
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            disabled={ai.isFetching}
            className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full border hover:bg-[var(--bg-alt)] print:hidden"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', opacity: ai.isFetching ? 0.5 : 1 }}
            title="สร้างใหม่ด้วย Gemini"
          >
            <RefreshCw size={12} className={ai.isFetching ? 'animate-spin' : ''} />
            {ai.isFetching ? 'กำลังคิด...' : 'Regenerate'}
          </button>
        </div>

        {ai.isLoading && (
          <div className="flex items-center gap-3 py-6">
            <div className="w-5 h-5 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Gemini กำลังวิเคราะห์ข้อมูล snapshot…</span>
          </div>
        )}

        {ai.isError && (
          <div className="px-3 py-3 rounded-lg text-xs leading-relaxed"
               style={{ backgroundColor: 'rgba(220,38,38,0.06)', color: '#991b1b', border: '1px solid rgba(220,38,38,0.20)' }}>
            <div className="font-semibold mb-1">⚠️ ไม่สามารถสร้าง AI summary ได้</div>
            <div className="font-mono text-[11px]">{(ai.error as Error)?.message}</div>
            <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              ส่วนสรุปด้านล่าง (rule-based) ยังใช้งานได้ปกติ · หากยังไม่ได้ตั้ง <code>GEMINI_API_KEY</code> ใน Supabase secrets ให้ตั้งก่อน
            </div>
          </div>
        )}

        {ai.data?.text && (
          <div>{renderMarkdown(ai.data.text)}</div>
        )}
      </section>

      {/* 1. Executive Summary */}
      <Section icon={<Sparkles size={18} />} title="1. Executive Summary (Rule-based snapshot)">
        <div className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text)' }}
             dangerouslySetInnerHTML={{ __html: headline }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Working Capital" value={`฿${formatCompact(r.actualValue)}`}
                sub={`${formatNumber(r.totalItems)} SKU · ${r.totalWh} คลัง`}
                tone={r.verdict === 'bad' ? 'bad' : r.verdict === 'warn' ? 'warn' : 'good'} />
          <Stat label="Inventory Turnover" value={`${r.turn.toFixed(2)}×`}
                sub={`${r.monthsCounted}mo · DIO ${r.dio ?? '—'}d`}
                tone={r.turn >= 4 ? 'good' : r.turn >= 2 ? 'warn' : 'bad'} />
          <Stat label="Dead Stock" value={`${r.deadPct.toFixed(1)}%`}
                sub={`${formatNumber(r.dead.length)} รายการ · ฿${formatCompact(r.deadValue)}`}
                tone={r.deadPct > 25 ? 'bad' : r.deadPct > 15 ? 'warn' : 'good'} />
          <Stat label="Expiring ≤ 30 วัน" value={formatNumber(r.expiring30.length + r.expired.length)}
                sub={`฿${formatCompact(r.expiredValue + r.expiring30Val)} at risk`}
                tone={(r.expired.length + r.expiring30.length) > 50 ? 'bad' : (r.expired.length + r.expiring30.length) > 10 ? 'warn' : 'good'} />
        </div>
      </Section>

      {/* 2. Working Capital & Cost */}
      <Section icon={<Coins size={18} />} title="2. Working Capital & ต้นทุน">
        <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--text)' }}>
          เงินจมในสต็อก <strong>{formatCurrency(r.actualValue)}</strong> คำนวณจากต้นทุนจริงรายล็อต (inventory_lots) ที่ snapshot {snapDate ? formatDate(snapDate) : '—'}
          · เทียบกับ COGS ย้อนหลัง 12 เดือน <strong>{formatCurrency(r.cogs12mo)}</strong>
          {r.coverYears != null && <> = <strong>{r.coverYears.toFixed(2)} ปี ของยอดขาย</strong></>}
          {' '}· Carrying cost ประมาณ <strong>{formatCurrency(r.carryingCost)}/ปี</strong> (15%)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Actual (lot cost)" value={`฿${formatCompact(r.actualValue)}`} tone="neutral" />
          <Stat label="Moving Avg (WAC)" value={`฿${formatCompact(r.wacValue)}`} sub="≈ actual" tone="neutral" />
          <Stat label="Standard Cost" value={`฿${formatCompact(r.stdValue)}`}
                sub={`Variance ${((r.stdValue - r.actualValue) / r.actualValue * 100).toFixed(1)}%`}
                tone={Math.abs(r.stdValue - r.actualValue) / r.actualValue > 0.05 ? 'warn' : 'neutral'} />
        </div>
      </Section>

      {/* 3. Turnover Health */}
      <Section icon={<Boxes size={18} />} title="3. สุขภาพการหมุนเวียน">
        <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>
          จาก {formatNumber(r.turn ? turnover.length : 0)} รายการที่มีข้อมูล turnover —
          กระจายตัวตามความเร็วหมุน:
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Stat label="หมุนช้ามาก (<1.5×)" value={formatNumber(r.turnoverBands.veryLow)} tone="bad" />
          <Stat label="ค่อนข้างช้า (1.5–3×)" value={formatNumber(r.turnoverBands.low)} tone="warn" />
          <Stat label="ปานกลาง (3–10×)" value={formatNumber(r.turnoverBands.mid)} tone="neutral" />
          <Stat label="หมุนเร็ว (≥10×)" value={formatNumber(r.turnoverBands.high)} tone="good" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Normal" value={formatNumber(r.normal.length)}
                sub={`${pct(r.normal.length, slowMoving.length).toFixed(1)}%`} tone="good" />
          <Stat label="Slow Moving (90–180d)" value={formatNumber(r.slow.length)}
                sub={`฿${formatCompact(r.slowValue)}`} tone="warn" />
          <Stat label="Dead Stock (≥180d)" value={formatNumber(r.dead.length)}
                sub={`฿${formatCompact(r.deadValue)}`} tone="bad" />
        </div>
      </Section>

      {/* 4. Lot Aging & Expiry Risk */}
      <Section icon={<Calendar size={18} />} title="4. ความเสี่ยงสินค้าใกล้/หมดอายุ">
        <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>
          จาก <strong>{formatNumber(r.totalLots)} lots</strong> ในระบบ:
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="หมดอายุแล้ว" value={formatNumber(r.expired.length)}
                sub={`฿${formatCompact(r.expiredValue)}`}
                tone={r.expired.length > 0 ? 'bad' : 'good'} />
          <Stat label="เหลือ ≤ 30 วัน" value={formatNumber(r.expiring30.length)}
                sub={`฿${formatCompact(r.expiring30Val)}`}
                tone={r.expiring30.length > 10 ? 'bad' : r.expiring30.length > 0 ? 'warn' : 'good'} />
          <Stat label="31–90 วัน" value={formatNumber(r.expiring90.length)}
                sub={`฿${formatCompact(r.expiring90Val)}`} tone="warn" />
        </div>
        {r.topExpiring.length > 0 && (
          <>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Top 5 lots ที่มูลค่าสูงและใกล้/หมดอายุ:</p>
            <ul className="space-y-1.5 text-xs">
              {r.topExpiring.map((l: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--bg-alt)' }}>
                  <span className="truncate"><strong>{l.item_code}</strong> · {l.itemname} · {l.warehouse}</span>
                  <span className="tabular-nums" style={{ color: num(l.days_remaining) < 0 ? '#dc2626' : '#d97706' }}>
                    {num(l.days_remaining) < 0 ? `หมด ${Math.abs(num(l.days_remaining))}d` : `เหลือ ${num(l.days_remaining)}d`} · {formatCurrency(num(l.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* 5. By Item Group */}
      <Section icon={<Layers size={18} />} title="5. มูลค่าตามกลุ่มสินค้า">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="text-left px-2 py-1.5">กลุ่ม</th>
              <th className="text-right px-2 py-1.5">รายการ</th>
              <th className="text-right px-2 py-1.5">มูลค่า</th>
              <th className="text-right px-2 py-1.5">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {r.groupBreakdown.map(g => (
              <tr key={g.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-2 py-1.5">{g.name}</td>
                <td className="text-right tabular-nums px-2 py-1.5">{formatNumber(g.count)}</td>
                <td className="text-right tabular-nums px-2 py-1.5">{formatCurrency(g.value)}</td>
                <td className="text-right tabular-nums px-2 py-1.5">{g.share.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 6. Top Concerns */}
      <Section icon={<ArrowDownRight size={18} />} title="6. Top Items ที่ควรจับตา">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#dc2626' }}>🔴 Dead Stock มูลค่าสูงสุด 5 อันดับ</p>
            <ul className="space-y-1.5 text-xs">
              {r.topDeadValue.length === 0 && <li style={{ color: 'var(--text-muted)' }}>—</li>}
              {r.topDeadValue.map((s: any, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'rgba(220,38,38,0.06)' }}>
                  <span className="truncate"><strong>{s.item_code}</strong> · {s.itemname}</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#dc2626' }}>{formatCurrency(num(s.stock_value))}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#d97706' }}>🟠 Slow Moving มูลค่าสูงสุด 5 อันดับ</p>
            <ul className="space-y-1.5 text-xs">
              {r.topSlowValue.length === 0 && <li style={{ color: 'var(--text-muted)' }}>—</li>}
              {r.topSlowValue.map((s: any, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'rgba(217,119,6,0.08)' }}>
                  <span className="truncate"><strong>{s.item_code}</strong> · {s.itemname}</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#d97706' }}>{formatCurrency(num(s.stock_value))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 7. Recommended Actions */}
      <Section icon={<CheckCircle2 size={18} />} title="7. คำแนะนำเชิงรุก (Recommended Actions)">
        <div className="space-y-2">
          {actions.map((a, i) => (
            <Bullet key={i} tone={a.tone}>
              <span dangerouslySetInnerHTML={{ __html: a.text }} />
            </Bullet>
          ))}
        </div>
      </Section>

      <p className="text-[10px] text-center pt-4 pb-2" style={{ color: 'var(--text-muted)' }}>
        รายงานสร้างโดย Smart Inventory Intelligence Engine · ทุกตัวเลขมาจากข้อมูลจริงใน Supabase ณ snapshot ที่ระบุ
      </p>
    </div>
  );
}
