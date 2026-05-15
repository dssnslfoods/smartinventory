import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpLegend } from '@/components/HelpButton';
import {
  Download, Search, Filter, ChevronLeft, ChevronRight, Loader2,
  List, BarChart3, TrendingUp, TrendingDown,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTransactions, useMovementMonthly, useMonthlyTotal } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatCurrency, formatDate, formatCompact } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS, TRANS_TYPES } from '@/types/database';
import { exportToExcel } from '@/utils/export';

// ── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'transactions', label: 'Transactions',   icon: List },
  { id: 'waterfall',    label: 'Waterfall',      icon: BarChart3 },
] as const;
type TabId = typeof TABS[number]['id'];

// ── Main page ────────────────────────────────────────────────────────────────
export function MovementHistoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('transactions');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movement History"
        subtitle="ประวัติการเคลื่อนไหวสินค้า รับ/จ่าย/โอน — รายการ + Waterfall"
        helpTitle="Movement History (ประวัติการเคลื่อนไหว)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            ทุกธุรกรรม (transaction) ที่เกิดในระบบ พร้อม 2 มุมมอง:
            <ul className="list-disc ml-5 text-xs mt-1 space-y-1">
              <li><strong>Transactions</strong> — รายการธุรกรรม + กราฟแนวโน้มรายเดือน</li>
              <li><strong>Waterfall</strong> — ดูภาพรวมการไหลของมูลค่าสินค้า (เข้า/ออก/สุทธิ) แยกตามเดือนหรือไตรมาส</li>
            </ul>
          </HelpSection>
          <HelpSection title="แท็บ Waterfall ใช้เมื่อไร">
            เมื่ออยากเห็น "เงินไหลเข้า/ออก" ทีละช่วงเวลา และยอดสะสมเปลี่ยนไปอย่างไร —
            เหมือนงบ Cash Flow แต่เป็นมูลค่าสินค้าคงคลัง
            <HelpLegend items={[
              { color: '#16a34a', label: 'แท่งเขียว', meaning: 'In — มูลค่าที่รับเข้าในช่วงนั้น' },
              { color: '#dc2626', label: 'แท่งแดง',   meaning: 'Out — มูลค่าที่จ่ายออก' },
              { color: '#1F3864', label: 'แท่งน้ำเงิน', meaning: 'ยอดยกมา / ยอดสะสม' },
            ]} />
          </HelpSection>
          <HelpSection title="ประเภทรายการ (Tx Type) ที่พบบ่อย">
            <HelpLegend items={[
              { color: '#16a34a', label: '20 — Goods Receipt PO',    meaning: 'รับของตามใบสั่งซื้อ (In)' },
              { color: '#dc2626', label: '60 — Goods Issue',          meaning: 'จ่ายออกทั่วไป (Out)' },
              { color: '#2E75B6', label: '67 — Inventory Transfers',  meaning: 'โอนระหว่างคลัง' },
            ]} />
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

      {activeTab === 'transactions' && <TransactionsTab />}
      {activeTab === 'waterfall'    && <WaterfallTab />}
    </div>
  );
}

// ── Tab 1: Transactions (original page content) ──────────────────────────────
function TransactionsTab() {
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [direction, setDirection] = useState('');
  const [transType, setTransType] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const { data: txData, isLoading } = useTransactions({
    warehouse: warehouse || undefined,
    groupCode,
    direction: direction || undefined,
    transType,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: 50,
  });

  const { data: monthlyData } = useMovementMonthly({
    warehouse: warehouse || undefined,
    groupCode: groupCode,
    months: 24,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('inventory_transactions')
        .select('trans_num,doc_date,trans_name,direction,warehouse,whs_name,item_code,group_name,in_qty,out_qty,amount, items(itemname)');

      if (warehouse) query = query.eq('warehouse', warehouse);
      if (groupCode) query = query.eq('group_code', groupCode);
      if (direction) query = query.eq('direction', direction);
      if (transType) query = query.eq('trans_type', transType);
      if (dateFrom) query = query.gte('doc_date', dateFrom);
      if (dateTo) query = query.lte('doc_date', dateTo);
      if (search) query = query.ilike('item_code', `%${search}%`);

      const { data, error } = await query
        .order('doc_date', { ascending: false })
        .order('trans_num', { ascending: false })
        .limit(500_000);

      if (error) throw error;

      exportToExcel((data ?? []).map((tx: any) => ({
        'Trans#': tx.trans_num,
        'Date': tx.doc_date,
        'Type': tx.trans_name,
        'Direction': tx.direction,
        'Warehouse': tx.warehouse,
        'Whs Name': tx.whs_name,
        'Item Code': tx.item_code,
        'Item Name': tx.items?.itemname || '—',
        'Group': tx.group_name,
        'In Qty': Number(tx.in_qty),
        'Out Qty': Number(tx.out_qty),
        'Amount': Number(tx.amount),
      })), `Movement_History_${new Date().toISOString().split('T')[0]}`);
    } catch (err) {
      alert(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trend Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
            Monthly Movement Trend
          </h3>
          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            {monthlyData?.length ?? 0} เดือน
          </span>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={(monthlyData ?? []).map(m => ({ ...m, net: m.In - m.Out }))} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E7D32" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2E7D32" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C62828" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C62828" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => {
                  const d = new Date(v);
                  const m = d.toLocaleDateString('th-TH', { month: 'short' });
                  const y = String(d.getFullYear() + 543).slice(-2);
                  return `${m} ${y}`;
                }}
                stroke="var(--text-muted)"
                fontSize={11}
                tick={{ fill: 'var(--text-muted)' }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(Number(v))} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                formatter={(val?: number | string, name?: string) => [formatNumber(Number(val ?? 0), 0), name]}
                labelFormatter={(v) => {
                  const d = new Date(String(v));
                  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
                }}
              />
              <Legend />
              <Area type="monotone" dataKey="In"  name="In (รับเข้า)"  fill="url(#gradIn)"  stroke="#2E7D32" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Out" name="Out (จ่ายออก)" fill="url(#gradOut)" stroke="#C62828" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" name="Net (สุทธิ)"   stroke="#1F3864" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#1F3864' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search item code..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="input pl-9"
            />
          </div>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="input" style={{ width: 'auto' }} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="input" style={{ width: 'auto' }} />
          <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(0); }} className="select">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
          </select>
          <select value={groupCode ?? ''} onChange={(e) => { setGroupCode(e.target.value ? Number(e.target.value) : undefined); setPage(0); }} className="select">
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(0); }} className="select">
            <option value="">All Directions</option>
            <option value="In">In</option>
            <option value="Out">Out</option>
            <option value="Transfers">Transfers</option>
            <option value="Cost">Cost</option>
            <option value="Opening">Opening</option>
          </select>
          <select value={transType ?? ''} onChange={(e) => { setTransType(e.target.value ? Number(e.target.value) : undefined); setPage(0); }} className="select">
            <option value="">All Types</option>
            {TRANS_TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <button onClick={handleExport} disabled={exporting} className="btn btn-secondary ml-auto">
            {exporting
              ? <><Loader2 size={16} className="animate-spin" /> Exporting...</>
              : <><Download size={16} /> Export All</>}
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
          <>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Trans#</th><th>Date</th><th>Type</th><th>Direction</th>
                    <th>Warehouse</th><th>Item Code</th><th>Item Name</th><th>Group</th>
                    <th className="text-right">In Qty</th>
                    <th className="text-right">Out Qty</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(txData?.data ?? []).map((tx) => (
                    <tr key={tx.id}>
                      <td className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>{tx.trans_num}</td>
                      <td>{formatDate(tx.doc_date)}</td>
                      <td>{tx.trans_name}</td>
                      <td>
                        <span className={`badge ${tx.direction === 'In' ? 'badge-success' :
                          tx.direction === 'Out' ? 'badge-critical' :
                            tx.direction === 'Transfers' ? 'badge-info' : 'badge-warning'}`}>
                          {tx.direction}
                        </span>
                      </td>
                      <td>
                        <div>{tx.warehouse}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{tx.whs_name}</div>
                      </td>
                      <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{tx.item_code}</td>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.itemname || (tx as any).item_name || '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{(tx.group_name ?? '').split('-')[0]}</td>
                      <td className="text-right">
                        {Number(tx.in_qty) > 0 && <span className="text-green-600">+{formatNumber(Number(tx.in_qty), 2)}</span>}
                      </td>
                      <td className="text-right">
                        {Number(tx.out_qty) > 0 && <span className="text-red-600">-{formatNumber(Number(tx.out_qty), 2)}</span>}
                      </td>
                      <td className={`text-right font-mono ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(Number(tx.amount))}
                      </td>
                    </tr>
                  ))}
                  {(txData?.data ?? []).length === 0 && (
                    <tr><td colSpan={11} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No transactions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {txData && txData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Showing {page * 50 + 1} - {Math.min((page + 1) * 50, txData.count)} of {formatNumber(txData.count)} records
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-secondary btn-sm">
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="text-sm px-3" style={{ color: 'var(--text)' }}>Page {page + 1} / {txData.totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(txData.totalPages - 1, p + 1))} disabled={page >= txData.totalPages - 1} className="btn btn-secondary btn-sm">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Waterfall ─────────────────────────────────────────────────────────
type Granularity = 'month' | 'quarter';
type Mode = 'split' | 'net';  // split: In+Out separate bars; net: single net bar per period
type Metric = 'value' | 'qty';

interface AggPeriod {
  key: string;          // sortable: "2025-01" or "2025-Q1"
  label: string;        // display: "ม.ค. 25" or "Q1 2568"
  monthStart: string;   // YYYY-MM-DD of first month
  in: number;
  out: number;
  net: number;
  tx: number;
}

interface WaterfallBar {
  label: string;        // x-axis label
  period: string;       // group of bars (period it belongs to)
  type: 'start' | 'in' | 'out' | 'net' | 'end';
  floor: number;        // invisible stack base
  delta: number;        // visible height
  cumulative: number;   // running total after this bar
  rawValue: number;     // raw signed value (for tooltips)
  color: string;
}

function WaterfallTab() {
  // ── Range + granularity controls ────────────────────────────────────────
  const today = new Date();
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const defaultFromDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const defaultFrom = `${defaultFromDate.getFullYear()}-${String(defaultFromDate.getMonth() + 1).padStart(2, '0')}`;

  const [granularity, setGranularity] = useState<Granularity>('month');
  const [mode, setMode]               = useState<Mode>('split');
  const [metric, setMetric]           = useState<Metric>('value');
  const [fromMonth, setFromMonth]     = useState<string>(defaultFrom);   // "YYYY-MM"
  const [toMonth, setToMonth]         = useState<string>(defaultTo);

  // Pull a wide window (36 months) so the user can scrub the range freely
  const { data: monthly = [], isLoading } = useMonthlyTotal(36);

  // ── Step 1: filter raw months to the selected range ──────────────────────
  const monthsInRange = useMemo(() => {
    const fromKey = `${fromMonth}-01`;
    const toKey = (() => {
      const [y, m] = toMonth.split('-').map(Number);
      const last = new Date(y, m, 0);  // last day of "toMonth"
      return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    })();
    return monthly.filter(m => m.month >= fromKey && m.month <= toKey);
  }, [monthly, fromMonth, toMonth]);

  // ── Step 2: aggregate by granularity ─────────────────────────────────────
  const periods: AggPeriod[] = useMemo(() => {
    const inKey = metric === 'value' ? 'in_value'  : 'in_qty';
    const outKey = metric === 'value' ? 'out_value' : 'out_qty';

    if (granularity === 'month') {
      return monthsInRange.map(m => {
        const d = new Date(m.month);
        return {
          key:        m.month.slice(0, 7),
          label:      `${d.toLocaleDateString('th-TH', { month: 'short' })} ${String(d.getFullYear() + 543).slice(-2)}`,
          monthStart: m.month,
          in:         Number(m[inKey as keyof typeof m] || 0),
          out:        Number(m[outKey as keyof typeof m] || 0),
          net:        Number(m[inKey as keyof typeof m] || 0) - Number(m[outKey as keyof typeof m] || 0),
          tx:         Number(m.tx_count),
        };
      });
    } else {
      const qMap = new Map<string, AggPeriod>();
      for (const m of monthsInRange) {
        const d = new Date(m.month);
        const q = Math.floor(d.getMonth() / 3) + 1;
        const key = `${d.getFullYear()}-Q${q}`;
        const cur = qMap.get(key) ?? {
          key,
          label:      `Q${q} ${String(d.getFullYear() + 543).slice(-2)}`,
          monthStart: m.month,
          in: 0, out: 0, net: 0, tx: 0,
        };
        cur.in  += Number(m[inKey as keyof typeof m]  || 0);
        cur.out += Number(m[outKey as keyof typeof m] || 0);
        cur.net  = cur.in - cur.out;
        cur.tx  += Number(m.tx_count);
        qMap.set(key, cur);
      }
      return Array.from(qMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    }
  }, [monthsInRange, granularity, metric]);

  // ── Step 3: build waterfall bars (anchor → period bars → end anchor) ─────
  const waterfall: WaterfallBar[] = useMemo(() => {
    const bars: WaterfallBar[] = [];
    let cumulative = 0;

    // Start anchor at 0
    bars.push({
      label: 'เริ่ม',
      period: 'anchor',
      type: 'start',
      floor: 0,
      delta: 0,
      cumulative: 0,
      rawValue: 0,
      color: '#1F3864',
    });

    for (const p of periods) {
      if (mode === 'split') {
        // In bar: rises from cumulative to cumulative + in
        const prev = cumulative;
        cumulative += p.in;
        bars.push({
          label: `${p.label}\n+In`,
          period: p.key,
          type: 'in',
          floor: prev,
          delta: p.in,
          cumulative,
          rawValue: p.in,
          color: '#16a34a',
        });
        // Out bar: drops from cumulative to cumulative - out
        cumulative -= p.out;
        bars.push({
          label: `${p.label}\n−Out`,
          period: p.key,
          type: 'out',
          floor: cumulative,  // floor = the lower point
          delta: p.out,
          cumulative,
          rawValue: -p.out,
          color: '#dc2626',
        });
      } else {
        // Net mode — single bar per period
        const prev = cumulative;
        const net = p.net;
        cumulative += net;
        if (net >= 0) {
          bars.push({
            label: p.label,
            period: p.key,
            type: 'net',
            floor: prev,
            delta: net,
            cumulative,
            rawValue: net,
            color: '#16a34a',
          });
        } else {
          bars.push({
            label: p.label,
            period: p.key,
            type: 'net',
            floor: cumulative,
            delta: Math.abs(net),
            cumulative,
            rawValue: net,
            color: '#dc2626',
          });
        }
      }
    }

    // End anchor — the cumulative running total as a solid bar from 0
    bars.push({
      label: 'รวม',
      period: 'anchor',
      type: 'end',
      floor: cumulative >= 0 ? 0 : cumulative,
      delta: Math.abs(cumulative),
      cumulative,
      rawValue: cumulative,
      color: '#1F3864',
    });

    return bars;
  }, [periods, mode]);

  // ── Step 4: KPI summary ──────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalIn   = periods.reduce((s, p) => s + p.in, 0);
    const totalOut  = periods.reduce((s, p) => s + p.out, 0);
    const totalNet  = totalIn - totalOut;
    const totalTx   = periods.reduce((s, p) => s + p.tx, 0);
    const bestIn    = periods.reduce<AggPeriod | null>((b, p) => (b == null || p.in  > b.in)  ? p : b, null);
    const worstNet  = periods.reduce<AggPeriod | null>((b, p) => (b == null || p.net < b.net) ? p : b, null);
    const avgIn     = periods.length > 0 ? totalIn  / periods.length : 0;
    const avgOut    = periods.length > 0 ? totalOut / periods.length : 0;
    return { totalIn, totalOut, totalNet, totalTx, bestIn, worstNet, avgIn, avgOut };
  }, [periods]);

  // ── Step 5: Export ───────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = periods.map(p => ({
      'Period':       p.label,
      'Period Key':   p.key,
      [metric === 'value' ? 'In Value (฿)' : 'In Qty']:   p.in,
      [metric === 'value' ? 'Out Value (฿)' : 'Out Qty']: p.out,
      [metric === 'value' ? 'Net Value (฿)' : 'Net Qty']: p.net,
      'Transactions': p.tx,
    }));
    // Append cumulative running total
    let cum = 0;
    const rowsWithCum = rows.map((r, idx) => {
      cum += periods[idx].net;
      return { ...r, [metric === 'value' ? 'Running Total (฿)' : 'Running Qty']: cum };
    });
    exportToExcel(rowsWithCum, `Waterfall_${granularity}_${fromMonth}_${toMonth}`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const yFormatter = (v: number) => metric === 'value' ? `฿${formatCompact(v)}` : formatCompact(v);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />

          {/* Date range (month inputs) */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>ตั้งแต่</label>
            <input
              type="month"
              value={fromMonth}
              onChange={e => setFromMonth(e.target.value)}
              className="input"
              style={{ width: 'auto' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>—</span>
            <input
              type="month"
              value={toMonth}
              onChange={e => setToMonth(e.target.value)}
              className="input"
              style={{ width: 'auto' }}
            />
          </div>

          {/* Granularity toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
            {(['month', 'quarter'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={granularity === g
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {g === 'month' ? 'รายเดือน' : 'รายไตรมาส'}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
            {(['split', 'net'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={mode === m
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {m === 'split' ? 'แยก In/Out' : 'รวม Net'}
              </button>
            ))}
          </div>

          {/* Metric toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
            {(['value', 'qty'] as Metric[]).map(mt => (
              <button
                key={mt}
                onClick={() => setMetric(mt)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={metric === mt
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {mt === 'value' ? 'มูลค่า (฿)' : 'จำนวน (Qty)'}
              </button>
            ))}
          </div>

          <button onClick={handleExport} disabled={periods.length === 0} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="รวม In" value={metric === 'value' ? `฿${formatCompact(kpi.totalIn)}` : formatCompact(kpi.totalIn)}
                 subtitle={`เฉลี่ย/${granularity === 'month' ? 'เดือน' : 'ไตรมาส'}: ${metric === 'value' ? '฿' : ''}${formatCompact(kpi.avgIn)}`}
                 color="#16a34a" icon={<TrendingUp size={16} />} />
        <KpiCard label="รวม Out" value={metric === 'value' ? `฿${formatCompact(kpi.totalOut)}` : formatCompact(kpi.totalOut)}
                 subtitle={`เฉลี่ย/${granularity === 'month' ? 'เดือน' : 'ไตรมาส'}: ${metric === 'value' ? '฿' : ''}${formatCompact(kpi.avgOut)}`}
                 color="#dc2626" icon={<TrendingDown size={16} />} />
        <KpiCard label="สุทธิ Net" value={`${kpi.totalNet >= 0 ? '+' : ''}${metric === 'value' ? '฿' : ''}${formatCompact(kpi.totalNet)}`}
                 subtitle={`${periods.length} ${granularity === 'month' ? 'เดือน' : 'ไตรมาส'}`}
                 color={kpi.totalNet >= 0 ? '#16a34a' : '#dc2626'} />
        <KpiCard label="ธุรกรรมรวม" value={formatNumber(kpi.totalTx)}
                 subtitle={kpi.bestIn ? `รับสูงสุด: ${kpi.bestIn.label}` : ''}
                 color="#1F3864" />
      </div>

      {/* Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
            Waterfall — {granularity === 'month' ? 'รายเดือน' : 'รายไตรมาส'} ({mode === 'split' ? 'In/Out แยก' : 'Net'})
          </h3>
          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            {periods.length} {granularity === 'month' ? 'เดือน' : 'ไตรมาส'}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
            ไม่พบข้อมูลในช่วงที่เลือก — ลองขยายช่วงวันที่หรือเปลี่ยน Filter
          </div>
        ) : (
          <div style={{ height: Math.max(360, Math.min(560, 80 + waterfall.length * 30)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={waterfall}
                margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tick={{ fill: 'var(--text-muted)' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickFormatter={yFormatter}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{ backgroundColor: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                  formatter={(_val, _name, item: any) => {
                    const p = item?.payload as WaterfallBar | undefined;
                    if (!p) return ['—', ''];
                    const sign = p.rawValue > 0 ? '+' : '';
                    const typeLabel =
                      p.type === 'start' ? 'จุดเริ่มต้น' :
                      p.type === 'end'   ? 'ยอดสะสม' :
                      p.type === 'in'    ? 'รับเข้า (In)' :
                      p.type === 'out'   ? 'จ่ายออก (Out)' : 'สุทธิ Net';
                    return [
                      `${sign}${metric === 'value' ? '฿' : ''}${formatCompact(p.rawValue)}  •  สะสม: ${metric === 'value' ? '฿' : ''}${formatCompact(p.cumulative)}`,
                      typeLabel,
                    ];
                  }}
                  labelFormatter={l => String(l).replace('\n', ' ')}
                />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                {/* Invisible floor — stacked below visible delta */}
                <Bar dataKey="floor" stackId="wf" fill="transparent" isAnimationActive={false} />
                {/* Visible delta — each bar colored independently via Cell */}
                <Bar dataKey="delta" stackId="wf" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                  {waterfall.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
                {/* Cumulative running-total line */}
                <Line
                  type="stepAfter"
                  dataKey="cumulative"
                  name="ยอดสะสม"
                  stroke="#1F3864"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 2.5, fill: '#1F3864' }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Custom legend chips */}
        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#16a34a' }} /> In (รับเข้า)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#dc2626' }} /> Out (จ่ายออก)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#1F3864' }} /> ยอดสะสมสุทธิ</span>
          <span className="flex items-center gap-1.5">
            <span className="block w-4 border-t-2 border-dashed" style={{ borderColor: '#1F3864' }} /> เส้นยอดสะสมตามเวลา
          </span>
        </div>

        {/* How-to-read */}
        <div className="mt-3 p-3 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>วิธีอ่าน:</strong>{' '}
          แต่ละแท่งคือการเปลี่ยนแปลงในช่วงนั้น — แท่ง <strong style={{ color: '#16a34a' }}>เขียวลอย</strong> สูงขึ้น (รับเข้า),
          แท่ง <strong style={{ color: '#dc2626' }}>แดงลอย</strong> ลดลง (จ่ายออก),
          แท่ง <strong style={{ color: '#1F3864' }}>น้ำเงิน</strong> ด้านขวาคือ <strong>ยอดสะสมสุทธิ</strong> ตลอดช่วง,
          เส้นประน้ำเงินตามขั้นบันได = ยอดสะสมตามเวลา (Running Total)
        </div>
      </div>

      {/* Period detail table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>รายละเอียดต่อช่วง</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase">ช่วง</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">In</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Net</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">สะสม</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Tx</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let cum = 0;
              return periods.map(p => {
                cum += p.net;
                return (
                  <tr key={p.key} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2 text-xs font-medium" style={{ color: 'var(--text)' }}>{p.label}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums" style={{ color: '#16a34a' }}>
                      {metric === 'value' ? '฿' : ''}{formatCompact(p.in)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums" style={{ color: '#dc2626' }}>
                      {metric === 'value' ? '฿' : ''}{formatCompact(p.out)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums font-semibold" style={{ color: p.net >= 0 ? '#16a34a' : '#dc2626' }}>
                      {p.net >= 0 ? '+' : ''}{metric === 'value' ? '฿' : ''}{formatCompact(p.net)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums" style={{ color: cum >= 0 ? 'var(--text)' : '#dc2626' }}>
                      {cum >= 0 ? '' : '−'}{metric === 'value' ? '฿' : ''}{formatCompact(Math.abs(cum))}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {formatNumber(p.tx)}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
          {periods.length > 0 && (
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                <td className="px-4 py-2 text-xs font-bold" style={{ color: 'var(--text)' }}>รวม</td>
                <td className="px-4 py-2 text-right text-xs tabular-nums font-bold" style={{ color: '#16a34a' }}>
                  {metric === 'value' ? '฿' : ''}{formatCompact(kpi.totalIn)}
                </td>
                <td className="px-4 py-2 text-right text-xs tabular-nums font-bold" style={{ color: '#dc2626' }}>
                  {metric === 'value' ? '฿' : ''}{formatCompact(kpi.totalOut)}
                </td>
                <td className="px-4 py-2 text-right text-xs tabular-nums font-bold" style={{ color: kpi.totalNet >= 0 ? '#16a34a' : '#dc2626' }}>
                  {kpi.totalNet >= 0 ? '+' : ''}{metric === 'value' ? '฿' : ''}{formatCompact(kpi.totalNet)}
                </td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2 text-right text-xs tabular-nums font-bold" style={{ color: 'var(--text)' }}>
                  {formatNumber(kpi.totalTx)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── KPI card helper ──────────────────────────────────────────────────────────
function KpiCard({ label, value, subtitle, color, icon }: {
  label: string; value: string; subtitle?: string; color: string; icon?: React.ReactNode;
}) {
  return (
    <div className="card border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      {subtitle && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
    </div>
  );
}
