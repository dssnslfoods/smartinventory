import { useState } from 'react';
import { Download, Search, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTransactions, useMovementMonthly } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatCurrency, formatDate } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS, TRANS_TYPES } from '@/types/database';
import { exportToExcel } from '@/utils/export';

export function MovementHistoryPage() {
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
    months: 24,
  });

  // Export ALL matching rows (not just current page)
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
      {/* Movement Trend Chart */}
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
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickFormatter={(v) => {
                  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                  return String(v);
                }}
              />
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
              <Area type="monotone" dataKey="In" name="In (รับเข้า)" fill="url(#gradIn)" stroke="#2E7D32" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Out" name="Out (จ่ายออก)" fill="url(#gradOut)" stroke="#C62828" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" name="Net (สุทธิ)" stroke="#1F3864" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#1F3864' }} />
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

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="input"
            style={{ width: 'auto' }}
          />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="input"
            style={{ width: 'auto' }}
          />

          <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(0); }} className="select">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => (
              <option key={w.code} value={w.code}>{w.code}</option>
            ))}
          </select>

          <select value={groupCode ?? ''} onChange={(e) => { setGroupCode(e.target.value ? Number(e.target.value) : undefined); setPage(0); }} className="select">
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
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
            {TRANS_TYPES.map(t => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-secondary ml-auto"
          >
            {exporting
              ? <><Loader2 size={16} className="animate-spin" /> Exporting...</>
              : <><Download size={16} /> Export All</>
            }
          </button>
        </div>
      </div>

      {/* Transaction Table */}
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
                    <th>Trans#</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Direction</th>
                    <th>Warehouse</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Group</th>
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
                            tx.direction === 'Transfers' ? 'badge-info' :
                              'badge-warning'
                          }`}>
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
                      <td style={{ color: 'var(--text-muted)' }}>{tx.group_name.split('-')[0]}</td>
                      <td className="text-right">
                        {Number(tx.in_qty) > 0 && (
                          <span className="text-green-600">+{formatNumber(Number(tx.in_qty), 2)}</span>
                        )}
                      </td>
                      <td className="text-right">
                        {Number(tx.out_qty) > 0 && (
                          <span className="text-red-600">-{formatNumber(Number(tx.out_qty), 2)}</span>
                        )}
                      </td>
                      <td className={`text-right font-mono ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(Number(tx.amount))}
                      </td>
                    </tr>
                  ))}
                  {(txData?.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                        No transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {txData && txData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Showing {page * 50 + 1} - {Math.min((page + 1) * 50, txData.count)} of {formatNumber(txData.count)} records
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn btn-secondary btn-sm"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="text-sm px-3" style={{ color: 'var(--text)' }}>
                    Page {page + 1} / {txData.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(txData.totalPages - 1, p + 1))}
                    disabled={page >= txData.totalPages - 1}
                    className="btn btn-secondary btn-sm"
                  >
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
