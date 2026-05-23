import { useMemo, useState } from 'react';
import { Search, Filter, Layers, Download, Clock, AlertTriangle } from 'lucide-react';
import { useLotDetail, useLatestLotSnapshot, useLotAging } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatCurrency, formatCompact, formatDate } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpLegend } from '@/components/HelpButton';

const PAGE_SIZE = 100;

const BUCKET_COLORS: Record<string, string> = {
  expired: '#7f1d1d',
  '0-30':  '#dc2626',
  '31-60': '#ea580c',
  '61-90': '#d97706',
  '91-180':'#65a30d',
  '180+':  '#16a34a',
  unknown: '#94a3b8',
};

const BUCKET_LABELS: Record<string, string> = {
  expired: 'หมดอายุแล้ว',
  '0-30':  '≤ 30 วัน',
  '31-60': '31 – 60 วัน',
  '61-90': '61 – 90 วัน',
  '91-180':'91 – 180 วัน',
  '180+':  '> 180 วัน',
  unknown: 'ไม่ระบุ',
};

const BUCKET_ORDER = ['expired', '0-30', '31-60', '61-90', '91-180', '180+', 'unknown'];

/** Exact day-range per aging bucket — must mirror v_lot_aging's CASE so the
 *  table count matches the card count exactly. */
const BUCKET_RANGE: Record<string, { min?: number; max?: number; nullDays?: boolean }> = {
  expired:  { max: -1 },          // days_remaining < 0
  '0-30':   { min: 0,   max: 30 },
  '31-60':  { min: 31,  max: 60 },
  '61-90':  { min: 61,  max: 90 },
  '91-180': { min: 91,  max: 180 },
  '180+':   { min: 181 },          // days_remaining > 180
  unknown:  { nullDays: true },    // days_remaining IS NULL
};

export function LotInventoryPage() {
  const { data: snap } = useLatestLotSnapshot();
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  /** Selected aging bucket (null = no filter). Clicking a card sets this to
   *  an EXACT bucket so the table count matches the card count. */
  const [bucket, setBucket] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const range = bucket ? BUCKET_RANGE[bucket] : {};

  const { data: result, isLoading } = useLotDetail({
    warehouse: warehouse || undefined,
    groupCode,
    search: search || undefined,
    snapshotDate: snap,
    daysRemainingMin:  range.min,
    daysRemainingMax:  range.max,
    daysRemainingNull: range.nullDays,
    page,
    pageSize: PAGE_SIZE,
  });

  const { data: aging = [] } = useLotAging(snap, { warehouse: warehouse || undefined });

  const bucketTotals = useMemo(() => {
    const map = new Map<string, { lots: number; value: number; qty: number }>();
    for (const k of BUCKET_ORDER) map.set(k, { lots: 0, value: 0, qty: 0 });
    for (const a of aging) {
      const cur = map.get(a.aging_bucket) ?? { lots: 0, value: 0, qty: 0 };
      cur.lots  += Number(a.lot_count);
      cur.value += Number(a.total_value);
      cur.qty   += Number(a.total_qty);
      map.set(a.aging_bucket, cur);
    }
    return BUCKET_ORDER.map(k => ({ key: k, label: BUCKET_LABELS[k], color: BUCKET_COLORS[k], ...map.get(k)! }));
  }, [aging]);

  const totalValue = bucketTotals.reduce((s, b) => s + b.value, 0);
  const totalLots  = bucketTotals.reduce((s, b) => s + b.lots, 0);

  const lots = result?.data ?? [];
  const totalRows = result?.count ?? 0;
  const totalPages = result?.totalPages ?? 0;

  const handleExport = () => {
    exportToExcel(
      lots.map(l => ({
        Item:        l.item_code,
        Itemname:    l.itemname,
        Group:       l.group_name,
        Warehouse:   l.warehouse,
        Whs_Name:    l.whs_name,
        Batch:       l.batch_num,
        Qty:         l.qty,
        UOM:         l.uom,
        Unit_Cost:   l.unit_cost,
        Total_Value: l.amount,
        In_Date:     l.in_date,
        Prod_Date:   l.production_date,
        Exp_Date:    l.expire_date,
        Days_Left:   l.days_remaining,
      })),
      'Lot_Inventory',
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lot Inventory"
        subtitle={`สต็อกแยกตาม lot — ใช้เพื่อวางแผนการตลาดตามวันหมดอายุของแต่ละ lot${snap ? ` · snapshot ${formatDate(snap)}` : ''}`}
        helpTitle="Lot Inventory (สต็อกตาม lot)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            สต็อก "ละเอียดถึงระดับ lot" — รายการเดียวกันที่มีหลาย lot จะแยกแถวให้ดูตามวันหมดอายุและต้นทุนของ lot นั้น
          </HelpSection>
          <HelpSection title="Aging Buckets ด้านบน">
            <HelpLegend items={[
              { color: BUCKET_COLORS.expired,  label: 'หมดอายุแล้ว', meaning: 'ต้องตัดสต็อก / ทำลาย' },
              { color: BUCKET_COLORS['0-30'],  label: '≤ 30 วัน',    meaning: 'เร่งระบายด่วน' },
              { color: BUCKET_COLORS['31-60'], label: '31 – 60 วัน', meaning: 'เร่งทำโปรโมชั่น' },
              { color: BUCKET_COLORS['61-90'], label: '61 – 90 วัน', meaning: 'วางแผนระบายปกติ' },
              { color: BUCKET_COLORS['91-180'],label: '91 – 180 วัน',meaning: 'ยังปลอดภัย' },
              { color: BUCKET_COLORS['180+'],  label: '> 180 วัน',    meaning: 'สดเต็มที่' },
            ]} />
          </HelpSection>
          <HelpSection title="หลัก FEFO (First-Expired-First-Out)">
            กำหนดให้หยิบ lot ที่ "ใกล้หมดอายุก่อน" ออกก่อน — เรียงตาราง by Expire Date ก็เห็นลำดับการหยิบทันที
          </HelpSection>
        </>)}
      />

      {/* Aging Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {bucketTotals.map(b => {
          const isActive = bucket === b.key;
          const isDimmed = bucket !== null && !isActive;
          return (
            <button
              key={b.key}
              onClick={() => {
                // Toggle exact-bucket filter — click same card again to clear
                setBucket(prev => (prev === b.key ? null : b.key));
                setPage(0);
              }}
              className="card text-left transition-all"
              style={{
                borderLeft: `4px solid ${b.color}`,
                opacity: isDimmed ? 0.5 : 1,
                boxShadow: isActive ? `0 0 0 2px ${b.color}` : undefined,
                backgroundColor: isActive ? `${b.color}0d` : undefined,
              }}
              title={isActive ? 'คลิกซ้ำเพื่อยกเลิกตัวกรอง' : `คลิกเพื่อดูเฉพาะ ${b.label} (${formatNumber(b.lots)} lots)`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: b.color }}>
                <Clock size={13} /> {b.label}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                {formatNumber(b.lots)} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>lots</span>
              </div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                ฿{formatCompact(b.value)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Totals row */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span><Layers size={13} className="inline mr-1" /> รวม <strong style={{ color: 'var(--text)' }}>{formatNumber(totalLots)}</strong> lots</span>
        <span>· มูลค่ารวม <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</strong></span>
        {bucket !== null && (
          <button
            onClick={() => { setBucket(null); setPage(0); }}
            className="ml-auto text-xs px-3 py-1 rounded-full border hover:bg-[var(--bg-alt)]"
            style={{ borderColor: BUCKET_COLORS[bucket] ?? 'var(--border)', color: 'var(--text)' }}
          >
            <AlertTriangle size={12} className="inline mr-1" /> กรอง: {BUCKET_LABELS[bucket]}
            {' '}({formatNumber(totalRows)} lots) — คลิกเพื่อลบ
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="ค้นหา รหัสสินค้า / ชื่อ / batch..."
              className="input pl-9 w-full"
            />
          </div>
          <select className="select" value={warehouse} onChange={e => { setWarehouse(e.target.value); setPage(0); }}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => { setGroupCode(e.target.value ? Number(e.target.value) : undefined); setPage(0); }}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto" disabled={lots.length === 0}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Table — fits page width without horizontal scroll.
          Columns combine related fields so we stay at 7 columns total. */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: '24%' }} />{/* Item (code + name) */}
            <col style={{ width: '10%' }} />{/* Whs / Grp */}
            <col style={{ width: '17%' }} />{/* Batch / Lot */}
            <col style={{ width: '10%' }} />{/* Qty */}
            <col style={{ width: '10%' }} />{/* Unit Cost */}
            <col style={{ width: '13%' }} />{/* Total Value */}
            <col style={{ width: '16%' }} />{/* Exp Date + Days Left */}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Item</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Whs / Grp</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Batch / Lot</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Unit ฿</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Value ฿</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Exp · Days</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
            ) : lots.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่มีข้อมูล lot</td></tr>
            ) : (
              lots.map((l) => {
                const dr = l.days_remaining;
                const bucket =
                  dr == null         ? 'unknown' :
                  dr < 0             ? 'expired' :
                  dr <= 30           ? '0-30'    :
                  dr <= 60           ? '31-60'   :
                  dr <= 90           ? '61-90'   :
                  dr <= 180          ? '91-180'  : '180+';
                return (
                  <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Item: code on top (mono, blue), name below (truncated) */}
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs font-medium truncate" style={{ color: 'var(--color-primary-light)' }} title={l.item_code}>
                        {l.item_code}
                      </div>
                      <div className="text-xs truncate" title={l.itemname} style={{ color: 'var(--text)' }}>
                        {l.itemname}
                      </div>
                    </td>
                    {/* Whs / Grp stacked */}
                    <td className="px-3 py-2 align-top">
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }} title={l.warehouse}>
                        {l.warehouse}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }} title={l.group_name ?? ''}>
                        {(l.group_name ?? '').split('-')[0]}
                      </div>
                    </td>
                    {/* Batch */}
                    <td className="px-3 py-2 font-mono text-[11px] align-top truncate" style={{ color: 'var(--text-muted)' }} title={l.batch_num}>
                      {l.batch_num}
                    </td>
                    {/* Qty + UOM */}
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      <div className="text-xs font-medium">{formatNumber(Number(l.qty), 2)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{l.uom}</div>
                    </td>
                    {/* Unit Cost */}
                    <td className="px-3 py-2 text-right tabular-nums text-xs align-top" style={{ color: 'var(--text-muted)' }}>
                      ฿{formatNumber(Number(l.unit_cost), 2)}
                    </td>
                    {/* Total Value (compact thousands for large) */}
                    <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold align-top" style={{ color: 'var(--text)' }}>
                      ฿{formatNumber(Number(l.amount), 2)}
                    </td>
                    {/* Exp + Days badge */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {l.expire_date ? formatDate(l.expire_date) : '—'}
                        </span>
                        {dr != null && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
                            style={{ backgroundColor: BUCKET_COLORS[bucket] }}
                          >
                            {dr < 0 ? `+${-dr}d` : `${dr}d`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>หน้า {page + 1} / {totalPages} · {formatNumber(totalRows)} lots</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="btn btn-secondary"
            >ก่อนหน้า</button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="btn btn-secondary"
            >ถัดไป</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LotInventoryPage;
