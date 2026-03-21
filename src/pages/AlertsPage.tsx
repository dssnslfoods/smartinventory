import { useState } from 'react';
import { AlertTriangle, Bell, Download, Plus, Trash2, Save, Package } from 'lucide-react';
import { useStockAlerts, useThresholds } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatCompact, getStockStatusColor, getStockStatusLabel } from '@/utils/format';
import { WAREHOUSES } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { useQueryClient } from '@tanstack/react-query';

export function AlertsPage() {
  const { data: alerts, isLoading } = useStockAlerts();
  const { data: thresholds } = useThresholds();
  const queryClient = useQueryClient();
  const [showThresholdForm, setShowThresholdForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  // Threshold form state
  const [newItemCode, setNewItemCode] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newMinLevel, setNewMinLevel] = useState('');
  const [newReorderPoint, setNewReorderPoint] = useState('');
  const [newMaxLevel, setNewMaxLevel] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredAlerts = filterStatus
    ? (alerts ?? []).filter(a => a.status === filterStatus)
    : (alerts ?? []);

  const criticalCount  = alerts?.filter(a => a.status === 'critical').length  ?? 0;
  const warningCount   = alerts?.filter(a => a.status === 'warning').length   ?? 0;
  const overstockCount = alerts?.filter(a => a.status === 'overstock').length ?? 0;
  const atRiskValue    = (alerts ?? [])
    .filter(a => a.status === 'critical' || a.status === 'warning')
    .reduce((s, a) => s + Number((a as any).stock_value ?? 0), 0);

  const handleSaveThreshold = async () => {
    if (!newItemCode || !newWarehouse) return;
    setSaving(true);
    try {
      await supabase.from('stock_thresholds').upsert({
        item_code: newItemCode,
        warehouse: newWarehouse,
        min_level: Number(newMinLevel) || 0,
        reorder_point: Number(newReorderPoint) || 0,
        max_level: newMaxLevel ? Number(newMaxLevel) : null,
      }, { onConflict: 'item_code,warehouse' });

      queryClient.invalidateQueries({ queryKey: ['stockAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      setShowThresholdForm(false);
      setNewItemCode('');
      setNewWarehouse('');
      setNewMinLevel('');
      setNewReorderPoint('');
      setNewMaxLevel('');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteThreshold = async (itemCode: string, warehouse: string) => {
    await supabase.from('stock_thresholds')
      .delete()
      .eq('item_code', itemCode)
      .eq('warehouse', warehouse);
    queryClient.invalidateQueries({ queryKey: ['stockAlerts'] });
    queryClient.invalidateQueries({ queryKey: ['thresholds'] });
  };

  const handleExport = () => {
    exportToExcel(filteredAlerts.map(a => ({
      'Item Code':      a.item_code,
      'Item Name':      a.itemname,
      'Warehouse':      a.warehouse,
      'Group':          a.group_name,
      'Current Stock':  a.current_stock,
      'UOM':            a.uom,
      'Stock Value':    Number((a as any).stock_value ?? 0),
      'Min Level':      a.min_level,
      'Reorder Point':  a.reorder_point,
      'Max Level':      a.max_level ?? 'N/A',
      'Daily Avg Out':  Number(a.daily_avg_out),
      'Days Remaining': a.days_remaining ?? 'N/A',
      'Status':         getStockStatusLabel(a.status),
    })), 'Low_Stock_Alerts');
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-critical)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-600" size={24} />
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Critical Items</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-critical)' }}>{criticalCount}</p>
            </div>
          </div>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-warning)' }}>
          <div className="flex items-center gap-3">
            <Bell className="text-orange-600" size={24} />
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Warning Items</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{warningCount}</p>
            </div>
          </div>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#2E75B6' }}>
          <div className="flex items-center gap-3">
            <Package className="text-blue-600" size={24} />
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Overstock Items</p>
              <p className="text-2xl font-bold text-blue-600">{overstockCount}</p>
            </div>
          </div>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-primary-light)' }}>
          <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>At-Risk Value (C+W)</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>฿{formatCompact(atRiskValue)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{thresholds?.length ?? 0} thresholds set</p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select"
          >
            <option value="">All Statuses</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="normal">Normal</option>
            <option value="overstock">Overstock</option>
          </select>

          <button onClick={() => setShowThresholdForm(!showThresholdForm)} className="btn btn-primary">
            <Plus size={16} /> Set Threshold
          </button>

          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>

        {/* Add Threshold Form */}
        {showThresholdForm && (
          <div className="mt-4 p-4 rounded-lg grid grid-cols-1 md:grid-cols-6 gap-3 items-end" style={{ backgroundColor: 'var(--bg-alt)' }}>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Item Code</label>
              <input value={newItemCode} onChange={(e) => setNewItemCode(e.target.value)} className="input mt-1" placeholder="e.g. F10100002" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Warehouse</label>
              <select value={newWarehouse} onChange={(e) => setNewWarehouse(e.target.value)} className="select w-full mt-1">
                <option value="">Select...</option>
                {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Min Level</label>
              <input type="number" value={newMinLevel} onChange={(e) => setNewMinLevel(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Reorder Point</label>
              <input type="number" value={newReorderPoint} onChange={(e) => setNewReorderPoint(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Max Level</label>
              <input type="number" value={newMaxLevel} onChange={(e) => setNewMaxLevel(e.target.value)} className="input mt-1" placeholder="Optional" />
            </div>
            <div>
              <button onClick={handleSaveThreshold} disabled={saving} className="btn btn-primary w-full">
                <Save size={16} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alerts Table */}
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
                  <th>Status</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Warehouse</th>
                  <th>Group</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Min Level</th>
                  <th className="text-right">Reorder Point</th>
                  <th className="text-right">Days Left</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={`${alert.item_code}-${alert.warehouse}`}>
                    <td>
                      <span className={`badge ${getStockStatusColor(alert.status)}`}>
                        {getStockStatusLabel(alert.status)}
                      </span>
                    </td>
                    <td className="font-medium" style={{ color: 'var(--color-primary-light)' }}>{alert.item_code}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {alert.itemname || (alert as any).item_name || '—'}
                    </td>
                    <td>{alert.warehouse}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{alert.group_name.split('-')[0]}</td>
                    <td className="text-right font-mono">{formatNumber(alert.current_stock, 2)} {alert.uom}</td>
                    <td className="text-right" style={{ color: 'var(--text-muted)' }}>{formatNumber(alert.min_level, 2)}</td>
                    <td className="text-right" style={{ color: 'var(--text-muted)' }}>{formatNumber(alert.reorder_point, 2)}</td>
                    <td className="text-right">
                      {alert.days_remaining !== null ? (
                        <span className={alert.days_remaining < 7 ? 'text-red-600 font-bold' : ''}>
                          {formatNumber(alert.days_remaining, 0)} days
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDeleteThreshold(alert.item_code, alert.warehouse)}
                        className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                        title="Remove threshold"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAlerts.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                      {thresholds?.length === 0
                        ? 'No thresholds configured. Click "Set Threshold" to add one.'
                        : 'No alerts matching the current filter.'}
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
