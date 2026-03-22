import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useSuppliers, useItems, useWarehouses, useCreatePurchaseOrder } from '@/hooks/useSupabaseQuery';
import type { POStatus, ShippingMethod } from '@/types/database';

interface LineForm {
  item_code: string;
  warehouse: string;
  ordered_qty: number;
  unit_price: number;
}

const EMPTY_LINE: LineForm = { item_code: '', warehouse: '', ordered_qty: 1, unit_price: 0 };

export default function CreatePOModal({ onClose }: { onClose: () => void }) {
  const [poNumber,        setPoNumber]        = useState('');
  const [supplierCode,    setSupplierCode]    = useState('');
  const [orderDate,       setOrderDate]       = useState(new Date().toISOString().split('T')[0]);
  const [expectedArrival, setExpectedArrival] = useState('');
  const [shippingMethod,  setShippingMethod]  = useState<ShippingMethod | ''>('Sea');
  const [trackingNumber,  setTrackingNumber]  = useState('');
  const [notes,           setNotes]           = useState('');
  const [lines,           setLines]           = useState<LineForm[]>([{ ...EMPTY_LINE }]);

  const { data: suppliers = [] } = useSuppliers({ isActive: true });
  const { data: items = [] }     = useItems({ isActive: true });
  const { data: warehouses = [] } = useWarehouses();
  const createPO = useCreatePurchaseOrder();

  // Auto-fill lead days when supplier selected
  function handleSupplierChange(code: string) {
    setSupplierCode(code);
    const sup = suppliers.find(s => s.supplier_code === code);
    if (sup && orderDate) {
      const d = new Date(orderDate);
      d.setDate(d.getDate() + sup.default_lead_days);
      setExpectedArrival(d.toISOString().split('T')[0]);
    }
  }

  function updateLine(i: number, field: keyof LineForm, value: string | number) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function addLine()    { setLines(prev => [...prev, { ...EMPTY_LINE }]); }
  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!poNumber || !supplierCode || lines.some(l => !l.item_code || !l.warehouse)) return;

    await createPO.mutateAsync({
      po: {
        po_number:        poNumber,
        supplier_code:    supplierCode,
        order_date:       orderDate,
        expected_arrival: expectedArrival || null,
        actual_arrival:   null,
        status:           'confirmed' as POStatus,
        shipping_method:  (shippingMethod as ShippingMethod) || null,
        tracking_number:  trackingNumber || null,
        notes:            notes || null,
        created_by:       null,
      },
      lines: lines.map(l => ({
        po_number:    poNumber,
        item_code:    l.item_code,
        warehouse:    l.warehouse,
        ordered_qty:  l.ordered_qty,
        received_qty: 0,
        unit_price:   l.unit_price,
        status:       'pending' as const,
        notes:        null,
      })),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้างใบสั่งซื้อใหม่</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {/* PO Header */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  เลขที่ PO <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={poNumber}
                  onChange={e => setPoNumber(e.target.value)}
                  placeholder="PO-2024-001"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={supplierCode}
                  onChange={e => handleSupplierChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- เลือก Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่สั่ง</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่คาดว่าจะถึง</label>
                <input type="date" value={expectedArrival} onChange={e => setExpectedArrival(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">วิธีขนส่ง</label>
                <select value={shippingMethod} onChange={e => setShippingMethod(e.target.value as ShippingMethod)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none">
                  <option value="">-- เลือก --</option>
                  <option value="Sea">Sea (ทางเรือ)</option>
                  <option value="Air">Air (ทางอากาศ)</option>
                  <option value="Land">Land (ทางบก)</option>
                  <option value="Courier">Courier</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tracking Number</label>
                <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)}
                  placeholder="เลข Tracking..."
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">รายการสินค้า</label>
                <button type="button" onClick={addLine}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
                </button>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left">สินค้า</th>
                      <th className="px-3 py-2 text-left">คลัง</th>
                      <th className="px-3 py-2 text-right">จำนวน</th>
                      <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <select value={line.item_code} onChange={e => updateLine(i, 'item_code', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-200 dark:border-gray-600 rounded text-xs
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">-- เลือกสินค้า --</option>
                            {items.slice(0, 200).map(item => (
                              <option key={item.item_code} value={item.item_code}>
                                {item.item_code} - {item.itemname}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={line.warehouse} onChange={e => updateLine(i, 'warehouse', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-200 dark:border-gray-600 rounded text-xs
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">-- คลัง --</option>
                            {warehouses.map(w => (
                              <option key={w.code} value={w.code}>{w.whs_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0.0001" step="0.0001"
                            value={line.ordered_qty}
                            onChange={e => updateLine(i, 'ordered_qty', +e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-200 dark:border-gray-600 rounded text-xs text-right
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="0.01"
                            value={line.unit_price}
                            onChange={e => updateLine(i, 'unit_price', +e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-600 rounded text-xs text-right
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          {lines.length > 1 && (
                            <button type="button" onClick={() => removeLine(i)}
                              className="p-1 text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex justify-end gap-3 px-5 pb-5 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              ยกเลิก
            </button>
            <button type="submit" disabled={createPO.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {createPO.isPending ? 'กำลังบันทึก...' : 'สร้าง PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
