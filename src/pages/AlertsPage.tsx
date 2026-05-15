import { useState } from 'react';
import { AlertTriangle, Bell, Download, Plus, Trash2, Save, Package, Layers, Clock } from 'lucide-react';
import { useStockAlerts, useThresholds, useLotDetail, useLatestLotSnapshot } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatNumber, formatCompact, formatDate, getStockStatusColor, getStockStatusLabel } from '@/utils/format';
import { WAREHOUSES } from '@/types/database';
import { exportToExcel } from '@/utils/export';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpLegend } from '@/components/HelpButton';

type AlertTab = 'low_stock' | 'expiring_lots';

export function AlertsPage() {
  const { data: alerts, isLoading } = useStockAlerts();
  const { data: thresholds } = useThresholds();
  const queryClient = useQueryClient();
  const [showThresholdForm, setShowThresholdForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [tab, setTab] = useState<AlertTab>('low_stock');

  // ── Expiring Lots tab ──
  const [expWarehouse, setExpWarehouse] = useState('');
  const [expDaysMax, setExpDaysMax]     = useState<number>(90); // default: show lots with ≤ 90 days
  const { data: lotSnap } = useLatestLotSnapshot();
  const { data: expLotsResult, isLoading: expLoading } = useLotDetail({
    snapshotDate: lotSnap,
    daysRemainingMax: expDaysMax,
    warehouse: expWarehouse || undefined,
    pageSize: 1000,
    page: 0,
  });
  const expLots = expLotsResult?.data ?? [];

  const handleExportLots = () => {
    exportToExcel(expLots.map(l => ({
      'Item Code':   l.item_code,
      'Item Name':   l.itemname,
      'Group':       l.group_name,
      'Warehouse':   l.warehouse,
      'Batch / Lot': l.batch_num,
      'Qty':         Number(l.qty),
      'UOM':         l.uom,
      'Unit Cost':   Number(l.unit_cost),
      'Value':       Number(l.amount),
      'Exp Date':    l.expire_date,
      'Days Left':   l.days_remaining,
    })), 'Expiring_Lots');
  };

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
      <PageHeader
        title="Low Stock Alerts"
        subtitle="แจ้งเตือนสต็อกต่ำ + เครื่องมือตั้ง Threshold"
        helpTitle="Low Stock Alerts (แจ้งเตือนสต็อกต่ำ)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            สรุปจำนวนรายการแยกตามสถานะ + ตารางรายการที่ต้องดำเนินการ + เครื่องมือตั้ง/แก้ Threshold
          </HelpSection>
          <HelpSection title="4 สถานะ">
            <HelpLegend items={[
              { color: '#C62828', label: 'Critical', meaning: 'จำนวนคงเหลือ < Min Level → สั่งด่วน' },
              { color: '#E65100', label: 'Warning',  meaning: 'Min ≤ คงเหลือ < Reorder Point → เตรียมสั่ง' },
              { color: '#2E7D32', label: 'Normal',   meaning: 'อยู่ในช่วงปกติ' },
              { color: '#2E75B6', label: 'Overstock', meaning: 'คงเหลือ > Max Level → พิจารณาระบาย' },
            ]} />
          </HelpSection>
          <HelpSection title="Days Remaining">
            ประมาณการว่าจะหมดสต็อกในกี่วัน — คำนวณจาก: คงเหลือปัจจุบัน ÷ ค่าเฉลี่ยจ่ายออกต่อวันใน 90 วันล่าสุด
            <p className="mt-1 text-xs italic">ถ้าไม่มี movement ใน 90 วัน จะแสดง "—"</p>
          </HelpSection>
          <HelpSection title="ตั้งค่า Threshold">
            <ul className="list-disc ml-5 text-xs space-y-1">
              <li><strong>Min Level</strong> — ระดับต่ำสุด (Safety Stock)</li>
              <li><strong>Reorder Point</strong> — ระดับที่ควรเริ่มสั่งซื้อใหม่</li>
              <li><strong>Max Level</strong> — ระดับสูงสุดที่ต้องการให้มี</li>
            </ul>
            <p className="mt-2 text-xs">ตั้งจากหน้า Settings → Stock Threshold Settings ก็ได้</p>
          </HelpSection>
        </>)}
      />

      {/* Tab bar */}
      <div className="card p-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTab('low_stock')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === 'low_stock'
              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
              : { color: 'var(--text-muted)' }}
          >
            <AlertTriangle size={15} /> Low Stock
          </button>
          <button
            onClick={() => setTab('expiring_lots')}
            disabled={!lotSnap}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={tab === 'expiring_lots'
              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
              : { color: 'var(--text-muted)' }}
            title={!lotSnap ? 'ยังไม่มีข้อมูล Lot — Import sheet "Lot Inventory" ก่อน' : ''}
          >
            <Layers size={15} /> Expiring Lots
          </button>
        </div>
      </div>

      {tab === 'expiring_lots' ? (
        <ExpiringLotsView
          lots={expLots}
          loading={expLoading}
          daysMax={expDaysMax}
          onDaysMaxChange={setExpDaysMax}
          warehouse={expWarehouse}
          onWarehouseChange={setExpWarehouse}
          onExport={handleExportLots}
          snapshotDate={lotSnap}
        />
      ) : (<>

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
      </>)}
    </div>
  );
}

// ── Expiring Lots view ──────────────────────────────────────────────────────
function ExpiringLotsView({
  lots, loading, daysMax, onDaysMaxChange, warehouse, onWarehouseChange, onExport, snapshotDate,
}: {
  lots: Array<{ id: number; item_code: string; itemname: string; group_name: string; warehouse: string; whs_name: string; batch_num: string; qty: number; uom: string; unit_cost: number; amount: number; expire_date: string | null; days_remaining: number | null }>;
  loading: boolean;
  daysMax: number;
  onDaysMaxChange: (n: number) => void;
  warehouse: string;
  onWarehouseChange: (s: string) => void;
  onExport: () => void;
  snapshotDate?: string;
}) {
  const bucketColor = (d: number | null) =>
    d == null     ? '#94a3b8' :
    d < 0         ? '#7f1d1d' :
    d <= 30       ? '#dc2626' :
    d <= 60       ? '#ea580c' :
    d <= 90       ? '#d97706' :
    d <= 180      ? '#65a30d' : '#16a34a';

  const summary = {
    expired:    lots.filter(l => l.days_remaining != null && l.days_remaining < 0).length,
    soon:       lots.filter(l => l.days_remaining != null && l.days_remaining >= 0 && l.days_remaining <= 30).length,
    mid:        lots.filter(l => l.days_remaining != null && l.days_remaining > 30 && l.days_remaining <= 60).length,
    far:        lots.filter(l => l.days_remaining != null && l.days_remaining > 60 && l.days_remaining <= 90).length,
    valueRisk:  lots.filter(l => l.days_remaining != null && l.days_remaining <= 30).reduce((s, l) => s + Number(l.amount), 0),
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: '#7f1d1d' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>หมดอายุแล้ว</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#7f1d1d' }}>{formatNumber(summary.expired)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>lots</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#dc2626' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>≤ 30 วัน</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#dc2626' }}>{formatNumber(summary.soon)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>lots — เร่งระบาย</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#ea580c' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>31 – 60 วัน</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#ea580c' }}>{formatNumber(summary.mid)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>lots</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#d97706' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>61 – 90 วัน</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#d97706' }}>{formatNumber(summary.far)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>lots</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-critical)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>มูลค่า ≤ 30 วัน</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-critical)' }}>฿{formatCompact(summary.valueRisk)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>at-risk</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Clock size={18} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>กรองตามจำนวนวันเหลือ:</span>
          <div className="flex gap-2">
            {[7, 30, 60, 90, 180].map(d => (
              <button
                key={d}
                onClick={() => onDaysMaxChange(d)}
                className="px-3 py-1 rounded text-xs font-medium border transition-colors"
                style={daysMax === d
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                ≤ {d} วัน
              </button>
            ))}
          </div>
          <select className="select" value={warehouse} onChange={e => onWarehouseChange(e.target.value)}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
          </select>
          <button onClick={onExport} className="btn btn-secondary ml-auto" disabled={lots.length === 0}>
            <Download size={16} /> Export
          </button>
          {snapshotDate && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>snapshot {formatDate(snapshotDate)}</span>
          )}
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Grp</th>
              <th>Whs</th>
              <th>Batch / Lot</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Value</th>
              <th>Exp Date</th>
              <th className="text-right">Days Left</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
            ) : lots.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่มี lot ใกล้หมดอายุในเกณฑ์ที่เลือก 🎉</td></tr>
            ) : (
              lots.map(l => (
                <tr key={l.id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--color-primary-light)' }}>{l.item_code}</td>
                  <td className="text-xs max-w-[260px] truncate" title={l.itemname}>{l.itemname}</td>
                  <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{(l.group_name ?? '').split('-')[0]}</td>
                  <td className="text-xs">{l.warehouse}</td>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{l.batch_num}</td>
                  <td className="text-right tabular-nums">{formatNumber(Number(l.qty), 2)} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{l.uom}</span></td>
                  <td className="text-right tabular-nums font-medium">฿{formatNumber(Number(l.amount), 2)}</td>
                  <td className="text-xs">{l.expire_date ? formatDate(l.expire_date) : '—'}</td>
                  <td className="text-right">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: bucketColor(l.days_remaining) }}
                    >
                      {l.days_remaining == null
                        ? '—'
                        : l.days_remaining < 0
                          ? `เกิน ${-l.days_remaining}d`
                          : `${l.days_remaining}d`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
