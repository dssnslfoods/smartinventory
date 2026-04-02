import { useState } from 'react';
import { Building2, Plus, Pencil, Search, Globe, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useSuppliers, useUpsertSupplier } from '@/hooks/useSupabaseQuery';
import type { Supplier } from '@/types/database';

const EMPTY_FORM: Partial<Supplier> = {
  supplier_code: '', supplier_name: '', country: '',
  default_lead_days: 30, contact_name: '', contact_email: '', is_active: true,
};

export default function SuppliersPage() {
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Partial<Supplier>>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);

  const { data: suppliers = [], isLoading } = useSuppliers({ search: search || undefined });
  const upsert = useUpsertSupplier();

  function openCreate() {
    setForm(EMPTY_FORM);
    setIsEditing(false);
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setForm({ ...s });
    setIsEditing(true);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_code || !form.supplier_name) return;
    await upsert.mutateAsync(form as Supplier & { supplier_code: string; supplier_name: string });
    setShowForm(false);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Supplier Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">จัดการข้อมูล Supplier และ Lead Time</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> เพิ่ม Supplier
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="ค้นหารหัส หรือชื่อ Supplier..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg
                     bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">กำลังโหลด...</div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <Building2 className="w-10 h-10 opacity-30" />
            <span className="text-sm">ยังไม่มีข้อมูล Supplier</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">รหัส</th>
                <th className="px-4 py-3 text-left">ชื่อ Supplier</th>
                <th className="px-4 py-3 text-left">ประเทศ</th>
                <th className="px-4 py-3 text-center">Lead Time (วัน)</th>
                <th className="px-4 py-3 text-left">ผู้ติดต่อ</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {suppliers.map(s => (
                <tr key={s.supplier_code} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono font-medium text-blue-600 dark:text-blue-400">
                    {s.supplier_code}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.supplier_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                      <Globe className="w-3.5 h-3.5" />
                      {s.country ?? '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-gray-600 dark:text-gray-300">
                      <Clock className="w-3.5 h-3.5" />
                      {s.default_lead_days} วัน
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <div>{s.contact_name ?? '-'}</div>
                    {s.contact_email && (
                      <div className="text-xs text-gray-400">{s.contact_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                        <CheckCircle className="w-3 h-3" /> ใช้งาน
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">
                        <XCircle className="w-3 h-3" /> ปิดใช้
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"
                      title="แก้ไข"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEditing ? 'แก้ไข Supplier' : 'เพิ่ม Supplier ใหม่'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    รหัส Supplier <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    disabled={isEditing}
                    value={form.supplier_code ?? ''}
                    onChange={e => setForm(f => ({ ...f, supplier_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                               disabled:bg-gray-100 dark:disabled:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="SUP-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ชื่อ Supplier <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={form.supplier_name ?? ''}
                    onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="บริษัท ..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ประเทศ</label>
                  <input
                    value={form.country ?? ''}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Thailand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Lead Time (วัน)</label>
                  <input
                    type="number" min="1" max="365"
                    value={form.default_lead_days ?? 30}
                    onChange={e => setForm(f => ({ ...f, default_lead_days: +e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ผู้ติดต่อ</label>
                  <input
                    value={form.contact_name ?? ''}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อ-นามสกุล"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">อีเมล</label>
                  <input
                    type="email"
                    value={form.contact_email ?? ''}
                    onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active ?? true}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">ใช้งานอยู่</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={upsert.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {upsert.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
