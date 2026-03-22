import { useState } from 'react';
import { ShoppingCart, Plus, ChevronRight, Truck, Package, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';
import { usePurchaseOrders, useUpdatePOStatus, useSuppliers } from '@/hooks/useSupabaseQuery';
import type { PurchaseOrder, POStatus } from '@/types/database';
import CreatePOModal from './CreatePOModal';
import PODetailModal from './PODetailModal';

const STATUS_CONFIG: Record<POStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft:       { label: 'ร่าง',          color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',       icon: <Clock className="w-3 h-3" /> },
  confirmed:   { label: 'อนุมัติแล้ว',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',    icon: <CheckCircle2 className="w-3 h-3" /> },
  shipped:     { label: 'จัดส่งแล้ว',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: <Truck className="w-3 h-3" /> },
  in_transit:  { label: 'ระหว่างขนส่ง',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: <Truck className="w-3 h-3" /> },
  customs:     { label: 'ผ่านศุลกากร',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: <Package className="w-3 h-3" /> },
  arrived:     { label: 'ถึงคลังแล้ว',   color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',   icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled:   { label: 'ยกเลิก',        color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',           icon: <XCircle className="w-3 h-3" /> },
};

const STATUS_FLOW: POStatus[] = ['draft', 'confirmed', 'shipped', 'in_transit', 'customs', 'arrived'];

export default function PurchaseOrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch]             = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [selectedPO, setSelectedPO]     = useState<PurchaseOrder | null>(null);

  const { data: pos = [], isLoading } = usePurchaseOrders({
    status:   filterStatus || undefined,
    search:   search || undefined,
  });
  const updateStatus = useUpdatePOStatus();

  async function advanceStatus(po: PurchaseOrder) {
    const idx  = STATUS_FLOW.indexOf(po.status as POStatus);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    await updateStatus.mutateAsync({ po_number: po.po_number, status: next });
  }

  const activeCount   = pos.filter(p => ['confirmed','shipped','in_transit','customs'].includes(p.status)).length;
  const arrivedCount  = pos.filter(p => p.status === 'arrived').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Purchase Orders</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">ติดตามใบสั่งซื้อและสถานะการขนส่ง</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> สร้าง PO ใหม่
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['draft','confirmed','in_transit','arrived'] as POStatus[]).map(s => {
          const count = pos.filter(p => p.status === s).length;
          const cfg   = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`p-4 rounded-xl border text-left transition-all ${
                filterStatus === s
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">รายการ</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาเลข PO..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">กำลังโหลด...</div>
        ) : pos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <ShoppingCart className="w-10 h-10 opacity-30" />
            <span className="text-sm">ไม่มีใบสั่งซื้อ</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">เลข PO</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-center">วันที่สั่ง</th>
                <th className="px-4 py-3 text-center">คาดว่าจะถึง</th>
                <th className="px-4 py-3 text-left">วิธีขนส่ง</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-center">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {pos.map(po => {
                const cfg        = STATUS_CONFIG[po.status];
                const canAdvance = STATUS_FLOW.indexOf(po.status as POStatus) < STATUS_FLOW.length - 1;
                const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(po.status as POStatus) + 1];

                return (
                  <tr key={po.po_number} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedPO(po)}
                        className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {po.po_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{po.supplier_name ?? po.supplier_code}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{po.order_date}</td>
                    <td className="px-4 py-3 text-center">
                      {po.expected_arrival ? (
                        <span className={`font-medium ${
                          po.expected_arrival < new Date().toISOString().split('T')[0] && po.status !== 'arrived'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {po.expected_arrival}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{po.shipping_method ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedPO(po)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                          title="ดูรายละเอียด"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        {canAdvance && nextStatus && (
                          <button
                            onClick={() => advanceStatus(po)}
                            disabled={updateStatus.isPending}
                            className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                                       rounded hover:bg-blue-100 disabled:opacity-50"
                            title={`เปลี่ยนเป็น: ${STATUS_CONFIG[nextStatus].label}`}
                          >
                            → {STATUS_CONFIG[nextStatus].label}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreatePOModal onClose={() => setShowCreate(false)} />}
      {selectedPO && <PODetailModal po={selectedPO} onClose={() => setSelectedPO(null)} />}
    </div>
  );
}
