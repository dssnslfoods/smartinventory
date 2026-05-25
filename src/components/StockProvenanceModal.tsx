import { useEffect } from 'react';
import { X, ArrowDownToLine, ArrowUpFromLine, Calculator, AlertTriangle } from 'lucide-react';
import { useStockProvenance } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatDate } from '@/utils/format';

interface Props {
  /** Open when itemCode is set; close by setting to null */
  itemCode: string | null;
  itemName?: string;
  uom?: string;
  onClose: () => void;
}

/**
 * "ที่มา Stock" — audits how an item's current_stock was derived from raw
 * transactions. Per (item × warehouse): tx count, Σ in, Σ out, and the
 * resulting net = current_stock. Shows ALL warehouses (incl. zero/negative)
 * so data anomalies (negative stock) are visible.
 */
export function StockProvenanceModal({ itemCode, itemName, uom, onClose }: Props) {
  const open = !!itemCode;
  const { data: rows = [], isLoading } = useStockProvenance(itemCode ?? undefined);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const totIn   = rows.reduce((s, r) => s + Number(r.total_in), 0);
  const totOut  = rows.reduce((s, r) => s + Number(r.total_out), 0);
  const totNet  = rows.reduce((s, r) => s + Number(r.current_stock), 0);
  const totTx   = rows.reduce((s, r) => s + Number(r.tx_count), 0);
  const u = uom ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(31,56,100,0.1)' }}>
              <Calculator size={18} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-primary-light)' }}>{itemCode}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                  ที่มา Current Stock
                </span>
              </div>
              <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{itemName ?? '—'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-[var(--bg-alt)]" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Formula strip */}
        <div className="px-6 py-2.5 border-b text-xs flex items-center gap-2 flex-wrap"
             style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
          <span className="font-mono">current_stock = Σ รับเข้า (In) − Σ จ่ายออก (Out)</span>
          <span>· คำนวณต่อ (สินค้า × คลัง) จากทุก transaction ในประวัติ</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>ไม่มี transaction ของรายการนี้</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 0 var(--border)' }}>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">คลัง</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Tx</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase"><ArrowDownToLine size={11} className="inline mr-0.5" />รวมรับเข้า</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase"><ArrowUpFromLine size={11} className="inline mr-0.5" />รวมจ่ายออก</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">= current_stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const net = Number(r.current_stock);
                  const isNeg = net < 0;
                  const isZero = net === 0;
                  return (
                    <tr key={r.warehouse} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 text-xs">
                        <div style={{ color: 'var(--text)' }}>{r.warehouse}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.whs_name ?? ''}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatNumber(r.tx_count, 0)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: '#16a34a' }}>{formatNumber(Number(r.total_in), 2)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: '#dc2626' }}>{formatNumber(Number(r.total_out), 2)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-bold"
                          style={{ color: isNeg ? '#dc2626' : isZero ? 'var(--text-muted)' : 'var(--text)' }}>
                        {formatNumber(net, 2)} {u}
                        {isNeg && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold"
                                style={{ backgroundColor: 'rgba(220,38,38,0.12)', color: '#dc2626' }}
                                title="stock ติดลบ — จ่ายออกมากกว่ารับเข้าในบันทึก (data anomaly)">
                            <AlertTriangle size={9} className="inline" /> ติดลบ
                          </span>
                        )}
                        {isZero && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>(หมด)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                  <td className="px-3 py-2 text-xs">รวม {rows.length} คลัง</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{formatNumber(totTx, 0)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: '#16a34a' }}>{formatNumber(totIn, 2)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: '#dc2626' }}>{formatNumber(totOut, 2)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: 'var(--text)' }}>{formatNumber(totNet, 2)} {u}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t text-[10px] text-center" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          {(() => {
            const firsts = rows.map(r => r.first_tx_date).filter(Boolean) as string[];
            const lasts  = rows.map(r => r.last_tx_date).filter(Boolean) as string[];
            if (firsts.length === 0 || lasts.length === 0) return null;
            const minDate = firsts.reduce((a, b) => (b < a ? b : a));
            const maxDate = lasts.reduce((a, b) => (b > a ? b : a));
            return <>ช่วงข้อมูล: {formatDate(minDate)} – {formatDate(maxDate)} · </>;
          })()}
          แถวที่ stock ≤ 0 ไม่แสดงในหน้า Stock On-Hand แต่แสดงที่นี่เพื่อให้เห็นที่มาครบ · กด Esc เพื่อปิด
        </div>
      </div>
    </div>
  );
}
