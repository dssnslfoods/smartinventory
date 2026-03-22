import { useState } from 'react';
import { X, Package, CheckCircle2 } from 'lucide-react';
import { usePurchaseOrderLines, useReceivePOLine } from '@/hooks/useSupabaseQuery';
import type { PurchaseOrder, PurchaseOrderLine } from '@/types/database';

export default function PODetailModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { data: lines = [], isLoading } = usePurchaseOrderLines(po.po_number);
  const receiveMutation = useReceivePOLine();
  const [receivingLine, setReceivingLine] = useState<PurchaseOrderLine | null>(null);
  const [receiveQty, setReceiveQty]       = useState('');

  async function handleReceive(line: PurchaseOrderLine) {
    const qty = parseFloat(receiveQty);
    if (isNaN(qty) || qty <= 0) return;
    await receiveMutation.mutateAsync({
      po_number:   po.po_number,
      item_code:   line.item_code,
      warehouse:   line.warehouse,
      qty,
      unit_price:  line.unit_price,
    });
    setReceivingLine(null);
    setReceiveQty('');
  }

  const remaining = (line: PurchaseOrderLine) => line.ordered_qty - line.received_qty;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{po.po_number}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{po.supplier_name ?? po.supplier_code}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* PO Info */}
        <div className="px-5 py-3 grid grid-cols-3 gap-4 text-sm bg-gray-50 dark:bg-gray-700/50">
          <div><span className="text-gray-500 dark:text-gray-400">วันที่สั่ง:</span> <span className="font-medium ml-1 text-gray-900 dark:text-white">{po.order_date}</span></div>
          <div><span className="text-gray-500 dark:text-gray-400">คาดว่าถึง:</span> <span className="font-medium ml-1 text-gray-900 dark:text-white">{po.expected_arrival ?? '-'}</span></div>
          <div><span className="text-gray-500 dark:text-gray-400">ขนส่ง:</span> <span className="font-medium ml-1 text-gray-900 dark:text-white">{po.shipping_method ?? '-'}</span></div>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="pb-2 text-left">สินค้า</th>
                  <th className="pb-2 text-left">คลัง</th>
                  <th className="pb-2 text-right">สั่ง</th>
                  <th className="pb-2 text-right">รับแล้ว</th>
                  <th className="pb-2 text-right">คงเหลือ</th>
                  <th className="pb-2 text-center">สถานะ</th>
                  <th className="pb-2 text-center">รับสินค้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {lines.map(line => (
                  <tr key={line.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2.5">
                      <div className="font-medium text-gray-900 dark:text-white">{line.item_code}</div>
                      <div className="text-xs text-gray-500">{line.itemname}</div>
                    </td>
                    <td className="py-2.5 text-gray-600 dark:text-gray-300 text-xs">{line.whs_name ?? line.warehouse}</td>
                    <td className="py-2.5 text-right text-gray-900 dark:text-white">
                      {line.ordered_qty.toLocaleString()} <span className="text-xs text-gray-400">{line.uom}</span>
                    </td>
                    <td className="py-2.5 text-right text-green-600 dark:text-green-400">
                      {line.received_qty.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-medium text-orange-600 dark:text-orange-400">
                      {remaining(line).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                        line.status === 'complete'  ? 'bg-green-100 text-green-700' :
                        line.status === 'partial'   ? 'bg-yellow-100 text-yellow-700' :
                        line.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {line.status === 'complete' ? 'รับครบ' : line.status === 'partial' ? 'รับบางส่วน' : line.status === 'cancelled' ? 'ยกเลิก' : 'รอรับ'}
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      {remaining(line) > 0 && po.status !== 'arrived' && po.status !== 'cancelled' ? (
                        receivingLine?.id === line.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              min="0.0001"
                              max={remaining(line)}
                              step="0.0001"
                              value={receiveQty}
                              onChange={e => setReceiveQty(e.target.value)}
                              className="w-20 px-2 py-1 border border-blue-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500
                                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              placeholder="จำนวน"
                            />
                            <button
                              onClick={() => handleReceive(line)}
                              disabled={receiveMutation.isPending}
                              className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setReceivingLine(null); setReceiveQty(''); }}
                              className="p-1 text-gray-400 hover:text-gray-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setReceivingLine(line); setReceiveQty(remaining(line).toString()); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 dark:bg-green-900/30
                                       text-green-700 dark:text-green-400 rounded hover:bg-green-100 mx-auto"
                          >
                            <Package className="w-3.5 h-3.5" /> รับสินค้า
                          </button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
