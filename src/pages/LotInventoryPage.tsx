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

export function LotInventoryPage() {
  const { data: snap } = useLatestLotSnapshot();
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [daysMax, setDaysMax] = useState<number | undefined>();
  const [page, setPage] = useState(0);

  const { data: result, isLoading } = useLotDetail({
    warehouse: warehouse || undefined,
    groupCode,
    search: search || undefined,
    snapshotDate: snap,
    daysRemainingMax: daysMax,
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
        {bucketTotals.map(b => (
          <button
            key={b.key}
            onClick={() => {
              // Quick filter — clicking a card sets daysMax
              if (b.key === 'expired')      setDaysMax(0);
              else if (b.key === '0-30')    setDaysMax(30);
              else if (b.key === '31-60')   setDaysMax(60);
              else if (b.key === '61-90')   setDaysMax(90);
              else if (b.key === '91-180')  setDaysMax(180);
              else                          setDaysMax(undefined);
              setPage(0);
            }}
            className="card text-left hover:shadow-md transition-shadow"
            style={{ borderLeft: `4px solid ${b.color}` }}
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
        ))}
      </div>

      {/* Totals row */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span><Layers size={13} className="inline mr-1" /> รวม <strong style={{ color: 'var(--text)' }}>{formatNumber(totalLots)}</strong> lots</span>
        <span>· มูลค่ารวม <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</strong></span>
        {daysMax !== undefined && (
          <button
            onClick={() => { setDaysMax(undefined); setPage(0); }}
            className="ml-auto text-xs px-3 py-1 rounded-full border hover:bg-[var(--bg-alt)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <AlertTriangle size={12} className="inline mr-1" /> กรอง: ≤ {daysMax} วัน — คลิกเพื่อลบ
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

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Group</th>
              <th>Warehouse</th>
              <th>Batch / Lot</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Cost</th>
              <th className="text-right">Total Value</th>
              <th>Exp Date</th>
              <th className="text-right">Days Left</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
            ) : lots.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่มีข้อมูล lot</td></tr>
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
                  <tr key={l.id}>
                    <td className="font-mono text-xs" style={{ color: 'var(--color-primary-light)' }}>{l.item_code}</td>
                    <td className="text-xs max-w-[260px] truncate" title={l.itemname}>{l.itemname}</td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{(l.group_name ?? '').split('-')[0]}</td>
                    <td className="text-xs">{l.warehouse}</td>
                    <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{l.batch_num}</td>
                    <td className="text-right tabular-nums">{formatNumber(Number(l.qty), 2)}</td>
                    <td className="text-right tabular-nums">฿{formatNumber(Number(l.unit_cost), 2)}</td>
                    <td className="text-right tabular-nums font-medium">฿{formatNumber(Number(l.amount), 2)}</td>
                    <td className="text-xs">{l.expire_date ? formatDate(l.expire_date) : '—'}</td>
                    <td className="text-right">
                      {dr == null ? (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: BUCKET_COLORS[bucket] }}
                        >
                          {dr < 0 ? `เกิน ${-dr}d` : `${dr}d`}
                        </span>
                      )}
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
