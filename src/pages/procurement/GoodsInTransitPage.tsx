import { useState } from 'react';
import { Truck, AlertTriangle, Clock, CheckCircle2, Package, Search } from 'lucide-react';
import { useGoodsInTransit, useStockPosition, useWarehouses } from '@/hooks/useSupabaseQuery';
import type { ArrivalStatus } from '@/types/database';
import { formatNumber, formatCurrency } from '@/utils/format';

const ARRIVAL_CONFIG: Record<ArrivalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  overdue:        { label: 'เลยกำหนด',       color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           icon: <AlertTriangle className="w-3 h-3" /> },
  arriving_today: { label: 'ถึงวันนี้',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',        icon: <CheckCircle2 className="w-3 h-3" /> },
  arriving_soon:  { label: 'ใกล้ถึง (≤7 วัน)', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: <Clock className="w-3 h-3" /> },
  on_schedule:    { label: 'ตามแผน',          color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',    icon: <Truck className="w-3 h-3" /> },
  unknown:        { label: 'ไม่ระบุวันถึง',    color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',          icon: <Package className="w-3 h-3" /> },
};

type ViewMode = 'transit' | 'position';

export default function GoodsInTransitPage() {
  const [mode,     setMode]     = useState<ViewMode>('transit');
  const [search,   setSearch]   = useState('');
  const [warehouse, setWarehouse] = useState('');

  const { data: transitItems = [], isLoading: loadingTransit } = useGoodsInTransit({ warehouse: warehouse || undefined });
  const { data: positions    = [], isLoading: loadingPos }     = useStockPosition({ warehouse: warehouse || undefined, search: search || undefined });
  const { data: warehouses   = [] }                            = useWarehouses();

  const filtered = transitItems.filter(t =>
    !search || t.item_code.toLowerCase().includes(search.toLowerCase()) ||
    t.itemname.toLowerCase().includes(search.toLowerCase())
  );

  // Summary counts
  const overdueCount = filtered.filter(t => t.arrival_status === 'overdue').length;
  const todayCount   = filtered.filter(t => t.arrival_status === 'arriving_today').length;
  const soonCount    = filtered.filter(t => t.arrival_status === 'arriving_soon').length;
  const totalValue   = filtered.reduce((s, t) => s + Number(t.pending_value), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Truck className="w-6 h-6 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Goods in Transit</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">สินค้าระหว่างขนส่งและภาพรวมยอดคงคลัง</p>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-red-600 dark:text-red-400">เลยกำหนด</span>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</div>
          <div className="text-xs text-red-500 dark:text-red-500">รายการ</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">ถึงวันนี้</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{todayCount}</div>
          <div className="text-xs text-blue-500">รายการ</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-500" />
            <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">ใกล้ถึง (≤7 วัน)</span>
          </div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{soonCount}</div>
          <div className="text-xs text-yellow-500">รายการ</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">มูลค่ารอรับ</span>
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(totalValue)}
          </div>
          <div className="text-xs text-gray-500">ทั้งหมด {filtered.length} รายการ</div>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button onClick={() => setMode('transit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'transit'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
            ระหว่างขนส่ง
          </button>
          <button onClick={() => setMode('position')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'position'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
            ภาพรวม Stock Position
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาสินค้า..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
          <option value="">ทุกคลัง</option>
          {warehouses.map(w => <option key={w.code} value={w.code}>{w.whs_name}</option>)}
        </select>
      </div>

      {/* Transit View */}
      {mode === 'transit' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loadingTransit ? (
            <div className="flex items-center justify-center py-16 text-gray-400">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
              <Truck className="w-10 h-10 opacity-30" />
              <span className="text-sm">ไม่มีสินค้าระหว่างขนส่ง</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">สินค้า</th>
                  <th className="px-4 py-3 text-left">PO / Supplier</th>
                  <th className="px-4 py-3 text-left">คลังปลายทาง</th>
                  <th className="px-4 py-3 text-right">รอรับ (qty)</th>
                  <th className="px-4 py-3 text-right">มูลค่า</th>
                  <th className="px-4 py-3 text-center">วันที่คาดถึง</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(t => {
                  const cfg = ARRIVAL_CONFIG[t.arrival_status];
                  return (
                    <tr key={t.line_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{t.item_code}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-48">{t.itemname}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-blue-600 dark:text-blue-400">{t.po_number}</div>
                        <div className="text-xs text-gray-500">{t.supplier_name}</div>
                        {t.tracking_number && (
                          <div className="text-xs text-gray-400 font-mono">{t.tracking_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{t.whs_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {formatNumber(Number(t.pending_qty), 2)} <span className="text-xs text-gray-400">{t.uom}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {formatCurrency(Number(t.pending_value))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.expected_arrival ? (
                          <span className={`font-medium text-sm ${
                            t.arrival_status === 'overdue' ? 'text-red-600 dark:text-red-400' :
                            t.arrival_status === 'arriving_today' ? 'text-blue-600 dark:text-blue-400' :
                            'text-gray-700 dark:text-gray-300'
                          }`}>
                            {t.expected_arrival}
                            {t.days_until_arrival !== null && t.days_until_arrival > 0 && (
                              <span className="block text-xs text-gray-400">+{t.days_until_arrival} วัน</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stock Position View */}
      {mode === 'position' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loadingPos ? (
            <div className="flex items-center justify-center py-16 text-gray-400">กำลังโหลด...</div>
          ) : positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
              <Package className="w-10 h-10 opacity-30" />
              <span className="text-sm">ไม่มีข้อมูล</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">สินค้า</th>
                  <th className="px-4 py-3 text-left">คลัง</th>
                  <th className="px-4 py-3 text-right">คงคลัง (จริง)</th>
                  <th className="px-4 py-3 text-right">ระหว่างขนส่ง</th>
                  <th className="px-4 py-3 text-right">คาดการณ์รวม</th>
                  <th className="px-4 py-3 text-right">มูลค่ารวม</th>
                  <th className="px-4 py-3 text-center">ถึงเร็วสุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {positions.map(p => (
                  <tr key={`${p.item_code}-${p.warehouse}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{p.item_code}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-48">{p.itemname}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{p.whs_name}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      {formatNumber(Number(p.current_stock), 2)} <span className="text-xs text-gray-400">{p.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Number(p.transit_qty) > 0 ? (
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          +{formatNumber(Number(p.transit_qty), 2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                      {formatNumber(Number(p.projected_stock), 2)} <span className="text-xs font-normal text-gray-400">{p.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(Number(p.projected_value))}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-300">
                      {p.nearest_arrival ?? <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
