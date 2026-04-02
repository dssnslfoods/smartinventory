import { useState, useMemo } from 'react';
import { Download, Search, Filter } from 'lucide-react';
import { useStockOnHand } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatCurrency } from '@/utils/format';
import { WAREHOUSES, ITEM_GROUPS } from '@/types/database';
import { exportToExcel } from '@/utils/export';

export function StockOnHandPage() {
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('stock_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: stockData, isLoading } = useStockOnHand({
    warehouse: warehouse || undefined,
    groupCode,
    isActive,
    search: search || undefined,
  });

  const sortedData = useMemo(() => {
    if (!stockData) return [];
    return [...stockData].sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField];
      const bVal = (b as unknown as Record<string, unknown>)[sortField];
      const aNum = typeof aVal === 'number' ? aVal : Number(aVal) || 0;
      const bNum = typeof bVal === 'number' ? bVal : Number(bVal) || 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [stockData, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const totalValue = sortedData.reduce((sum, s) => sum + Number(s.stock_value), 0);
  const totalItems = sortedData.length;

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
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search item code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>

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

          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
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
                {sortedData.map((row) => (
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
      </div>
    </div>
  );
}
