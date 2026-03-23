import { useState, useMemo } from 'react';
import { Download, Filter } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { useStockOnHand, useMovementMonthly } from '@/hooks/useSupabaseQuery';
import { formatCurrency, formatNumber, formatDate, formatCompact } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';

export function ValuationPage() {
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data: stockData, isLoading } = useStockOnHand({
    warehouse: warehouse || undefined,
    groupCode,
    isActive: true,
  });

  const { data: monthlyData } = useMovementMonthly({ warehouse: warehouse || undefined, months: 12 });

  // Calculate totals
  const totals = useMemo(() => {
    if (!stockData) return { maValue: 0, stdValue: 0, items: 0 };
    let maValue = 0, stdValue = 0;
    for (const s of stockData) {
      const stock = Number(s.current_stock);
      maValue += stock * Number(s.moving_avg);
      stdValue += stock * Number(s.std_cost);
    }
    return { maValue, stdValue, items: stockData.length };
  }, [stockData]);

  // Group breakdown
  const groupBreakdown = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { group: string; maValue: number; stdValue: number; count: number }>();
    for (const s of stockData) {
      const key = s.group_name;
      const prev = map.get(key) ?? { group: key, maValue: 0, stdValue: 0, count: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      prev.count++;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [stockData]);

  // Warehouse breakdown
  const whsBreakdown = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { warehouse: string; whsName: string; maValue: number; stdValue: number }>();
    for (const s of stockData) {
      const key = s.warehouse;
      const prev = map.get(key) ?? { warehouse: key, whsName: s.whs_name, maValue: 0, stdValue: 0 };
      const stock = Number(s.current_stock);
      prev.maValue += stock * Number(s.moving_avg);
      prev.stdValue += stock * Number(s.std_cost);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.maValue - a.maValue);
  }, [stockData]);

  // Price variance (top items) — deduplicate by item_code across warehouses
  const varianceData = useMemo(() => {
    if (!stockData) return [];
    const map = new Map<string, { item_code: string; itemname: string; moving_avg: number; std_cost: number; variance: number; stock: number }>();
    for (const s of stockData) {
      if (Number(s.std_cost) <= 0) continue;
      const existing = map.get(s.item_code);
      if (existing) {
        existing.stock += Number(s.current_stock);
      } else {
        const moving_avg = Number(s.moving_avg);
        const std_cost = Number(s.std_cost);
        map.set(s.item_code, {
          item_code: s.item_code,
          itemname: s.itemname,
          moving_avg,
          std_cost,
          variance: ((moving_avg - std_cost) / std_cost) * 100,
          stock: Number(s.current_stock),
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 15);
  }, [stockData]);

  // Monthly value trend
  const valueTrend = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.map(m => ({
      month: m.month,
      amount: Math.abs(m.total_amount),
    }));
  }, [monthlyData]);

  const handleExport = () => {
    if (!stockData) return;
    exportToExcel(stockData.map(s => ({
      'Item Code': s.item_code,
      'Item Name': s.itemname,
      'Warehouse': s.warehouse,
      'Group': s.group_name,
      'Current Stock': Number(s.current_stock),
      'UOM': s.uom,
      'Moving Avg': Number(s.moving_avg),
      'Std Cost': Number(s.std_cost),
      'Value (MA)': Number(s.current_stock) * Number(s.moving_avg),
      'Value (STD)': Number(s.current_stock) * Number(s.std_cost),
      'Variance %': Number(s.std_cost) > 0
        ? (((Number(s.moving_avg) - Number(s.std_cost)) / Number(s.std_cost)) * 100).toFixed(2)
        : 'N/A',
    })), 'Cost_Valuation');
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inventory Value (Moving Avg)</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
            {isLoading ? '...' : formatCurrency(totals.maValue)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inventory Value (Std Cost)</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
            {isLoading ? '...' : formatCurrency(totals.stdValue)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Variance (MA vs STD)</p>
          <p className={`text-2xl font-bold mt-1 ${totals.maValue >= totals.stdValue ? 'text-green-600' : 'text-red-600'}`}>
            {isLoading ? '...' : formatCurrency(totals.maValue - totals.stdValue)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />

          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="select">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => (
              <option key={w.code} value={w.code}>{w.code} - {w.name}</option>
            ))}
          </select>

          <select value={groupCode ?? ''} onChange={(e) => setGroupCode(e.target.value ? Number(e.target.value) : undefined)} className="select">
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>

          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value by Group */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Value by Item Group</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={(v) => formatCompact(Number(v))} stroke="var(--text-muted)" fontSize={12} />
                <YAxis type="category" dataKey="group" width={60} stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => v.split('-')[0]} />
                <Tooltip formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))} />
                <Legend />
                <Bar dataKey="maValue" name="Moving Avg" fill="#1F3864" radius={[0, 4, 4, 0]} />
                <Bar dataKey="stdValue" name="Std Cost" fill="#2E75B6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Value Trend */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Transaction Value Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('th-TH', { month: 'short' })}
                  stroke="var(--text-muted)"
                  fontSize={12}
                />
                <YAxis tickFormatter={(v) => formatCompact(Number(v))} stroke="var(--text-muted)" fontSize={12} />
                <Tooltip formatter={(val?: number | string) => formatCurrency(Number(val ?? 0))} labelFormatter={(v) => formatDate(String(v))} />
                <Area type="monotone" dataKey="amount" stroke="#00897B" fill="#00897B" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Warehouse Breakdown Table */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Value by Warehouse</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Name</th>
                <th className="text-right">Value (Moving Avg)</th>
                <th className="text-right">Value (Std Cost)</th>
                <th className="text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {whsBreakdown.map((row) => (
                <tr key={row.warehouse}>
                  <td className="font-medium">{row.warehouse}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.whsName}</td>
                  <td className="text-right font-mono">{formatCurrency(row.maValue)}</td>
                  <td className="text-right font-mono">{formatCurrency(row.stdValue)}</td>
                  <td className={`text-right font-mono ${row.maValue >= row.stdValue ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(row.maValue - row.stdValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price Variance Table */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Top Price Variance (MA vs STD Cost)</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th className="text-right">Moving Avg</th>
                <th className="text-right">Std Cost</th>
                <th className="text-right">Variance %</th>
                <th className="text-right">Stock Qty</th>
              </tr>
            </thead>
            <tbody>
              {varianceData.map((row) => (
                <tr key={row.item_code}>
                  <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{row.item_code}</td>
                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.itemname || (row as any).item_name || '—'}
                  </td>
                  <td className="text-right">{formatCurrency(row.moving_avg)}</td>
                  <td className="text-right">{formatCurrency(row.std_cost)}</td>
                  <td className={`text-right font-bold ${row.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.variance >= 0 ? '+' : ''}{row.variance.toFixed(1)}%
                  </td>
                  <td className="text-right">{formatNumber(row.stock, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
