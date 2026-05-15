import { useState, useMemo, useEffect } from 'react';
import { Download, Search, Filter, X } from 'lucide-react';
import { useStockOnHand } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatCurrency } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { HelpSection, HelpLegend } from '@/components/HelpButton';
import { PageHeader } from '@/components/PageHeader';

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

  const sortedData = useMemo(() => {
    if (!stockData) return [];
    const filtered = stockData.filter((r) => {
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Stock Lines</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatNumber(totalItems)}</p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Stock Value</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Avg Value per Line</p>
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
            {totalItems > 0
              ? <>พบ <strong style={{ color: 'var(--text)' }}>{formatNumber(totalItems)}</strong> รายการ · มูลค่ารวม <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</strong></>
              : <span>ไม่พบรายการที่ตรงกับ filter</span>}
          </span>
        </div>
      </div>

      {/* Data Table */}
      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
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
                  <th onClick={() => handleSort('moving_avg')} className="text-right">
                    Moving Avg {sortField === 'moving_avg' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('stock_value')} className="text-right">
                    Stock Value {sortField === 'stock_value' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row) => (
                  <tr key={`${row.item_code}-${row.warehouse}`}>
                    <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname || (row as any).item_name || '—'}
                    </td>
                    <td>
                      <div style={{ color: 'var(--text)' }}>{row.warehouse}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.whs_name}</div>
                    </td>
                    <td><span className="badge badge-info">{row.group_name.split('-')[0]}</span></td>
                    <td className="text-right font-mono">{formatNumber(Number(row.current_stock), 2)}</td>
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
      </div>
    </div>
  );
}
