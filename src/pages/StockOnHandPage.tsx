import { useState, useMemo, useEffect } from 'react';
import { Download, Search, Filter, X } from 'lucide-react';
import { useStockOnHand, useLatestLotSnapshot } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatCurrency } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { HelpSection, HelpLegend } from '@/components/HelpButton';
import { PageHeader } from '@/components/PageHeader';
import { InfoTooltip } from '@/components/InfoTooltip';
import { LotDetailModal } from '@/components/LotDetailModal';
import { StockProvenanceModal } from '@/components/StockProvenanceModal';

export function StockOnHandPage() {
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('stock_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [fsCategory, setFsCategory] = useState('');
  const [minValue, setMinValue] = useState('');     // ฿
  const [minQty, setMinQty] = useState('');         // units
  const [valueBucket, setValueBucket] = useState<'all' | '100k' | '1M' | '10M'>('all');

  /** Drill-down state — click a row to see all lots for that (item × warehouse). */
  const [drillDown, setDrillDown] = useState<{
    item_code: string; itemname: string; warehouse: string; whs_name?: string;
  } | null>(null);
  /** "ที่มา & กระทบยอด Stock" modal — opened by clicking a Current Stock value.
   *  Reconciles the physical lot count (shown) against the transaction book. */
  const [provenance, setProvenance] = useState<{
    item_code: string; itemname: string; uom: string; physicalStock: number;
  } | null>(null);
  const { data: latestSnap } = useLatestLotSnapshot();
  const PAGE_SIZE = 50;

  const { data: stockData, isLoading } = useStockOnHand({
    warehouse: warehouse || undefined,
    groupCode,
    isActive,
    search: search || undefined,
  });

  const availableFsCategories = useMemo(() => {
    if (!stockData) return [];
    const s = new Set<string>();
    for (const r of stockData) {
      const c = (r as any).fs_category;
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [stockData]);

  const minValueNum = useMemo(() => {
    const n = parseFloat(minValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [minValue]);
  const minQtyNum = useMemo(() => {
    const n = parseFloat(minQty);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [minQty]);

  const bucketThreshold = useMemo(() => {
    switch (valueBucket) {
      case '100k': return 100_000;
      case '1M':   return 1_000_000;
      case '10M':  return 10_000_000;
      default:     return null;
    }
  }, [valueBucket]);

  // current_stock now comes from the physical Lot snapshot (inventory_lots),
  // so it is always ≥ 0. A negative row would mean corrupt lot data; we still
  // defensively flag it here so it can't silently skew the total.
  const anomalies = useMemo(() => {
    const neg = (stockData ?? []).filter(r => Number(r.current_stock) < 0);
    return {
      negCount: neg.length,
      negValue: neg.reduce((s, r) => s + Number(r.stock_value), 0),
    };
  }, [stockData]);

  const sortedData = useMemo(() => {
    if (!stockData) return [];
    const filtered = stockData.filter((r) => {
      // Lot-based stock: every row already has physical qty (> 0). Guard against
      // a stray zero just in case.
      if (Number(r.current_stock) === 0) return false;
      // FS Category
      if (fsCategory && (r as any).fs_category !== fsCategory) return false;
      // Min stock value
      const sv = Number(r.stock_value);
      if (minValueNum != null && sv < minValueNum) return false;
      if (bucketThreshold != null && sv < bucketThreshold) return false;
      // Min current stock
      if (minQtyNum != null && Number(r.current_stock) < minQtyNum) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField];
      const bVal = (b as unknown as Record<string, unknown>)[sortField];
      const aNum = typeof aVal === 'number' ? aVal : Number(aVal) || 0;
      const bNum = typeof bVal === 'number' ? bVal : Number(bVal) || 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [stockData, sortField, sortDir, fsCategory, minValueNum, minQtyNum, bucketThreshold]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const totalValue = sortedData.reduce((sum, s) => sum + Number(s.stock_value), 0);
  const totalItems = sortedData.length;
  // Total quantity — only meaningful as a single number when every row shares
  // the same UOM (e.g. all KG). Mixed units → show "หน่วย" generic label.
  const totalQty   = sortedData.reduce((sum, s) => sum + Number(s.current_stock), 0);
  const uomSet     = new Set(sortedData.map(s => s.uom).filter(Boolean));
  const singleUom  = uomSet.size === 1 ? [...uomSet][0] : null;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageStart  = safePage * PAGE_SIZE;
  const pageEnd    = Math.min(pageStart + PAGE_SIZE, totalItems);
  const pagedData  = sortedData.slice(pageStart, pageEnd);

  // Reset to page 0 whenever any filter/search input changes.
  useEffect(() => {
    setPage(0);
  }, [warehouse, groupCode, isActive, search, fsCategory, minValueNum, minQtyNum, bucketThreshold]);

  const resetFilters = () => {
    setSearch(''); setWarehouse(''); setGroupCode(undefined);
    setIsActive(undefined); setFsCategory('');
    setMinValue(''); setMinQty(''); setValueBucket('all');
  };

  const activeFilterCount = [
    search, warehouse, groupCode, isActive !== undefined ? '1' : '',
    fsCategory, minValueNum != null ? '1' : '', minQtyNum != null ? '1' : '',
    valueBucket !== 'all' ? '1' : '',
  ].filter(Boolean).length;

  const handleExport = () => {
    exportToExcel(sortedData.map(s => ({
      'Item Code': s.item_code,
      'Item Name': s.itemname,
      'Warehouse': s.warehouse,
      'Warehouse Name': s.whs_name,
      'Group': s.group_name,
      'Current Stock': Number(s.current_stock),
      'UOM': s.uom,
      'Moving Avg Cost': Number(s.moving_avg),
      'Std Cost': Number(s.std_cost),
      'Stock Value': Number(s.stock_value),
      'Status': s.is_active ? 'Active' : 'Inactive',
    })), 'Stock_OnHand');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock On-Hand"
        subtitle="สต็อกคงเหลือทุกสินค้าในทุกคลัง"
        helpTitle="Stock On-Hand (สต็อกคงเหลือ)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            จำนวนสต็อกปัจจุบันแยกตาม "สินค้า × คลัง" — 1 บรรทัด = สินค้า 1 รหัสในคลัง 1 แห่ง
          </HelpSection>
          <HelpSection title="3 KPI ด้านบน">
            <HelpLegend items={[
              { color: '#1F3864', label: 'Total Stock Lines', meaning: 'จำนวนบรรทัดทั้งหมด (สินค้า × คลัง ที่มีของอยู่)' },
              { color: '#2E75B6', label: 'Total Stock Value', meaning: 'มูลค่ารวมจาก Σ (qty × moving_avg)' },
              { color: '#00897B', label: 'Avg Value per Line', meaning: 'มูลค่าเฉลี่ยต่อ 1 บรรทัด — ใช้ดูสินค้าราคาสูง' },
            ]} />
          </HelpSection>
          <HelpSection title="ฟิลเตอร์">
            <ul className="list-disc ml-5 text-xs space-y-1">
              <li>ค้นหา — พิมพ์รหัสหรือชื่อสินค้า</li>
              <li>All Warehouses — กรองเฉพาะคลัง</li>
              <li>All Groups — กรองตามกลุ่มสินค้า (FFG/FRM/FBY/FPKG)</li>
              <li>All Status — Active / Inactive</li>
            </ul>
          </HelpSection>
          <HelpSection title="Export Excel">
            ปุ่มมุมขวา → ดาวน์โหลดข้อมูลที่กรองอยู่ตอนนี้เป็นไฟล์ .xlsx
          </HelpSection>
        </>)}
      />

      {/* Negative-stock anomaly warning */}
      {anomalies.negCount > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg mb-1"
             style={{ backgroundColor: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)' }}>
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div className="text-xs leading-relaxed" style={{ color: '#991b1b' }}>
            <strong>พบ {formatNumber(anomalies.negCount)} บรรทัดที่ stock ติดลบ</strong>
            {' '}(รวม {formatCurrency(anomalies.negValue)}) — current_stock มาจากการนับ Lot จริง
            จึงไม่ควรติดลบ ค่าติดลบบ่งชี้ว่า<strong>ข้อมูล Lot ของรายการนั้นผิดพลาด</strong>
            {' '}· แนะนำให้ตรวจสอบ snapshot ล่าสุดในตาราง inventory_lots
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ── Total Stock Lines ─────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-1.5">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Stock Lines</p>
            <InfoTooltip title="Total Stock Lines คืออะไร?">
              <p className="mb-2">จำนวน <strong>"บรรทัด" สต็อก</strong> ทั้งหมด = (สินค้า × คลัง × snapshot) ที่ยังมีของอยู่ใน v_stock_onhand</p>
              <div className="rounded p-2 text-[11px] my-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <p className="font-mono mb-1.5 pb-1.5 border-b" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
                  COUNT(*) WHERE current_stock &gt; 0
                </p>
                <div className="flex justify-between"><span>SKU ที่ Active</span><span className="font-mono tabular-nums">{formatNumber(totalItems)} บรรทัด</span></div>
              </div>
              <p className="mt-2 mb-1"><strong>จะวิเคราะห์ได้</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>1 สินค้าอยู่ในหลายคลัง = หลายบรรทัด</li>
                <li>เลขนี้สูง = สินค้ากระจายในคลังเยอะ → SKU ซ้ำซ้อนหรือคลังกระจายตัวเกิน</li>
                <li>เปรียบเทียบกับจำนวน SKU master (items table) เพื่อดูสัดส่วน "ที่ active"</li>
              </ul>
              <p className="mt-2 text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                ใช้ตัวกรอง "เรียงตามมูลค่าสูง→ต่ำ" เพื่อหาบรรทัดที่กิน working capital มากที่สุด
              </p>
            </InfoTooltip>
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatNumber(totalItems)}</p>
        </div>

        {/* ── Total Stock Value ─────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-1.5">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Stock Value</p>
            <InfoTooltip title="Total Stock Value คืออะไร?">
              <p className="mb-2">มูลค่ารวมของสินค้าคงเหลือทั้งหมด — คือ <strong>Working Capital ที่ "จม" อยู่ในคลัง</strong></p>
              <div className="rounded p-2 text-[11px] my-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <p className="font-mono mb-1.5 pb-1.5 border-b" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
                  Σ (current_stock × moving_avg_cost)
                </p>
                <div className="flex justify-between"><span>Inventory Value</span><span className="font-mono tabular-nums font-bold">{formatCurrency(totalValue)}</span></div>
              </div>
              <p className="mt-2 mb-1"><strong>จะวิเคราะห์ได้</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>คือเงินสดที่ถูกแช่ไว้ในสินค้า — ไม่สามารถใช้หมุนเวียนได้</li>
                <li>Carrying Cost ประมาณ <strong>15%/ปี</strong> ของมูลค่านี้ (ค่าเก็บรักษา ดอกเบี้ย ความเสี่ยงเสียหาย)</li>
                <li>ใช้คู่กับ <strong>Inventory Turnover</strong> (Dashboard) — Stock Value / COGS = Days Inventory</li>
              </ul>
              <p className="mt-2 text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                ⚠ ยิ่งสูง → ต้องการเงินสดมาก · เสี่ยง Dead Stock มากขึ้น
              </p>
            </InfoTooltip>
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</p>
        </div>

        {/* ── Avg Value per Line ────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-1.5">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Avg Value per Line</p>
            <InfoTooltip title="Avg Value per Line คืออะไร?">
              <p className="mb-2">มูลค่าเฉลี่ยต่อบรรทัด — ช่วยบอกว่าโดยรวม <strong>สินค้าราคาสูงหรือต่ำ</strong></p>
              <div className="rounded p-2 text-[11px] my-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <p className="font-mono mb-1.5 pb-1.5 border-b" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
                  Total Stock Value ÷ Total Stock Lines
                </p>
                <div className="flex justify-between"><span>{formatCurrency(totalValue)}</span><span className="font-mono tabular-nums">÷ {formatNumber(totalItems)}</span></div>
                <div className="flex justify-between font-bold mt-0.5"><span>= Avg / Line</span><span className="font-mono tabular-nums">{formatCurrency(totalItems > 0 ? totalValue / totalItems : 0)}</span></div>
              </div>
              <p className="mt-2 mb-1"><strong>จะวิเคราะห์ได้</strong></p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>สูง = ส่วนใหญ่เป็นสินค้าราคาแพง (เนื้อ Premium, Seafood) → ใช้เงินทุนต่อหน่วยสูง</li>
                <li>ต่ำ = มีสินค้าราคาถูกจำนวนมาก (Packaging, Daily Goods)</li>
                <li>ดู outlier — กรอง "&gt; ฿1M" จะเหลือเฉพาะบรรทัดที่กิน working capital มากผิดปกติ</li>
              </ul>
              <p className="mt-2 text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                เทคนิค: ถ้า Avg พุ่งสูงผิดปกติ ให้ดูว่ามีบรรทัดเดียวที่มูลค่าโตเกินไป (Pareto 80/20)
              </p>
            </InfoTooltip>
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
            {formatCurrency(totalItems > 0 ? totalValue / totalItems : 0)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        {/* Row 1 — search + action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="ค้นหา รหัสสินค้า / ชื่อ / FS category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                title="ลบ filter ทั้งหมด"
              >
                <X size={12} /> Reset ({activeFilterCount})
              </button>
            )}
            <button onClick={handleExport} className="btn btn-secondary">
              <Download size={16} /> Export ({totalItems})
            </button>
          </div>
        </div>

        {/* Row 2 — dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />

          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="select">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => (
              <option key={w.code} value={w.code}>{w.code} - {w.name}</option>
            ))}
          </select>

          <select
            value={groupCode ?? ''}
            onChange={(e) => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}
            className="select"
          >
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>

          {availableFsCategories.length > 0 && (
            <select className="select" value={fsCategory} onChange={(e) => setFsCategory(e.target.value)}>
              <option value="">All FS Categories</option>
              {availableFsCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <select
            value={isActive === undefined ? '' : isActive ? 'active' : 'inactive'}
            onChange={(e) => {
              if (e.target.value === '') setIsActive(undefined);
              else setIsActive(e.target.value === 'active');
            }}
            className="select"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={`${sortField}|${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split('|');
              setSortField(f);
              setSortDir(d as 'asc' | 'desc');
            }}
            className="select"
            title="เรียงลำดับ"
          >
            <option value="stock_value|desc">เรียง: มูลค่าสูง → ต่ำ</option>
            <option value="stock_value|asc">เรียง: มูลค่าต่ำ → สูง</option>
            <option value="current_stock|desc">เรียง: จำนวนสต็อกสูง → ต่ำ</option>
            <option value="current_stock|asc">เรียง: จำนวนสต็อกต่ำ → สูง</option>
            <option value="item_code|asc">เรียง: รหัสสินค้า A-Z</option>
            <option value="itemname|asc">เรียง: ชื่อสินค้า A-Z</option>
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Min ฿:</span>
            <input
              type="number" min="0" step="1000"
              value={minValue}
              onChange={e => setMinValue(e.target.value)}
              placeholder="0"
              className="input w-28 text-right text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Min Qty:</span>
            <input
              type="number" min="0" step="1"
              value={minQty}
              onChange={e => setMinQty(e.target.value)}
              placeholder="0"
              className="input w-24 text-right text-xs"
            />
          </div>
        </div>

        {/* Row 3 — stock value bucket chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>มูลค่าสต็อก:</span>
          {([
            { label: 'ทั้งหมด',  value: 'all'  as const },
            { label: '> ฿100K', value: '100k' as const },
            { label: '> ฿1M',   value: '1M'   as const },
            { label: '> ฿10M',  value: '10M'  as const },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setValueBucket(opt.value)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
              style={valueBucket === opt.value
                ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
              }
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
            {activeFilterCount === 0
              ? <>คลังมีทั้งหมด <strong style={{ color: 'var(--text)' }}>{formatNumber(stockData?.length ?? 0)}</strong> รายการ — กรุณาค้นหา/เลือก filter ก่อน</>
              : totalItems > 0
                ? <>พบ <strong style={{ color: 'var(--text)' }}>{formatNumber(totalItems)}</strong> รายการ
                    {' '}· รวม <strong style={{ color: 'var(--text)' }}>{formatNumber(totalQty, 2)}</strong> {singleUom ?? 'หน่วย'}
                    {' '}· มูลค่ารวม <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</strong></>
                : <span style={{ color: '#dc2626' }}>ไม่พบรายการที่ตรงกับ filter</span>}
          </span>
        </div>
      </div>

      {/* Data Table — only rendered after the user filters/searches.
          With ≈3,800 stock lines, showing the full list by default is noisy
          and expensive. Prompt the executive to narrow first. */}
      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeFilterCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <Search size={36} className="opacity-30 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
              เริ่มค้นหาหรือเลือก filter
            </p>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
              ระบบมีรายการสต็อกทั้งหมด <strong>{formatNumber(stockData?.length ?? 0)}</strong> รายการ
              — กรุณาใช้ช่องค้นหา หรือเลือก filter ด้านบนเพื่อแสดงผล
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <p className="w-full text-xs mb-1" style={{ color: 'var(--text-muted)' }}>หรือกรองด่วน:</p>
              <button
                onClick={() => setValueBucket('1M')}
                className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                💰 มูลค่า &gt; ฿1M
              </button>
              <button
                onClick={() => setValueBucket('10M')}
                className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                🏆 มูลค่า &gt; ฿10M
              </button>
              <button
                onClick={() => setIsActive(true)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                ✅ Active items
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 rounded-full text-xs font-medium border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                📥 Export ทั้งหมด ({formatNumber(stockData?.length ?? 0)} รายการ)
              </button>
            </div>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('item_code')}>
                    Item Code {sortField === 'item_code' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('item_name')}>
                    Item Name {sortField === 'item_name' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('warehouse')}>
                    Warehouse {sortField === 'warehouse' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Group</th>
                  <th onClick={() => handleSort('current_stock')} className="text-right">
                    Current Stock {sortField === 'current_stock' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>UOM</th>
                  <th onClick={() => handleSort('moving_avg')} className="text-right"
                      title="Moving Average Cost = Σ มูลค่า Lot คงเหลือ ÷ Σ จำนวน Lot คงเหลือ (ต้นทุนเฉลี่ยถ่วงน้ำหนักของของที่เหลือจริง · รวม landed cost) ณ snapshot ล่าสุด">
                    Moving Avg {sortField === 'moving_avg' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('stock_value')} className="text-right">
                    Stock Value {sortField === 'stock_value' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row) => (
                  <tr
                    key={`${row.item_code}-${row.warehouse}`}
                    onClick={() => setDrillDown({
                      item_code: row.item_code,
                      itemname:  row.itemname || (row as any).item_name || '',
                      warehouse: row.warehouse,
                      whs_name:  row.whs_name,
                    })}
                    className="cursor-pointer hover:bg-[var(--bg-alt)] transition-colors"
                    title="คลิกเพื่อดูรายละเอียด lot ทั้งหมดของรายการนี้"
                  >
                    <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname || (row as any).item_name || '—'}
                    </td>
                    <td>
                      <div style={{ color: 'var(--text)' }}>{row.warehouse}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.whs_name}</div>
                    </td>
                    <td><span className="badge badge-info">{row.group_name.split('-')[0]}</span></td>
                    <td className="text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProvenance({
                            item_code: row.item_code,
                            itemname:  row.itemname || (row as any).item_name || '',
                            uom:       row.uom,
                            physicalStock: Number(row.current_stock),
                          });
                        }}
                        className="font-mono underline decoration-dotted underline-offset-2 hover:text-[var(--color-primary)] transition-colors"
                        title="คลิกเพื่อกระทบยอด: นับจริงจาก Lot เทียบกับยอดเคลื่อนไหว (transactions)"
                      >
                        {formatNumber(Number(row.current_stock), 2)}
                      </button>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.uom}</td>
                    <td className="text-right">{formatCurrency(Number(row.moving_avg))}</td>
                    <td className="text-right font-semibold">{formatCurrency(Number(row.stock_value))}</td>
                  </tr>
                ))}
                {sortedData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                      No stock data found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer — 50 rows / page */}
        {totalItems > PAGE_SIZE && (
          <div
            className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <span>
              แสดง <strong style={{ color: 'var(--text)' }}>{formatNumber(pageStart + 1)}</strong>
              {' – '}
              <strong style={{ color: 'var(--text)' }}>{formatNumber(pageEnd)}</strong>
              {' จาก '}
              <strong style={{ color: 'var(--text)' }}>{formatNumber(totalItems)}</strong>
              {' รายการ'}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage === 0}
                onClick={() => setPage(0)}
                className="px-2.5 py-1 rounded-md border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)' }}
                title="หน้าแรก"
              >«</button>
              <button
                disabled={safePage === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-3 py-1 rounded-md border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)' }}
              >‹ ก่อนหน้า</button>
              <span className="px-3 py-1 text-xs tabular-nums">
                หน้า <strong style={{ color: 'var(--text)' }}>{safePage + 1}</strong> / {totalPages}
              </span>
              <button
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="px-3 py-1 rounded-md border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)' }}
              >ถัดไป ›</button>
              <button
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                className="px-2.5 py-1 rounded-md border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)' }}
                title="หน้าสุดท้าย"
              >»</button>
            </div>
          </div>
        )}

        {/* Hint: rows are clickable */}
        <p className="px-4 py-2 text-[10px] text-center border-t"
           style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          💡 คลิกที่แถวเพื่อดูรายละเอียด lot ทั้งหมดของรายการนั้น (เรียงตาม FEFO)
        </p>
      </div>

      {/* Lot drill-down modal */}
      <LotDetailModal
        itemCode={drillDown?.item_code ?? null}
        itemName={drillDown?.itemname}
        warehouse={drillDown?.warehouse ?? null}
        whsName={drillDown?.whs_name}
        snapshotDate={latestSnap}
        onClose={() => setDrillDown(null)}
      />

      {/* Current-stock provenance modal */}
      <StockProvenanceModal
        itemCode={provenance?.item_code ?? null}
        itemName={provenance?.itemname}
        uom={provenance?.uom}
        physicalStock={provenance?.physicalStock}
        onClose={() => setProvenance(null)}
      />
    </div>
  );
}
