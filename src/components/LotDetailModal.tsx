import { useEffect } from 'react';
import { X, Package, Calendar, Layers, AlertTriangle } from 'lucide-react';
import { useLotsForItemWarehouse } from '@/hooks/useSupabaseQuery';
import { formatNumber, formatCurrency, formatDate, formatCompact } from '@/utils/format';

interface Props {
  /** Open when item_code is set; close by setting to null */
  itemCode:    string | null;
  itemName?:   string;
  warehouse:   string | null;
  whsName?:    string;
  snapshotDate?: string;
  onClose:     () => void;
}

/**
 * Drill-down modal showing every lot of a given (item × warehouse).
 *
 * Reuses useLotsForItemWarehouse — already cached if other parts of the
 * app have queried the same key. Sorted FEFO (earliest expire first).
 *
 * Each row shows: batch_num · qty · unit_cost · amount · in_date ·
 * expire_date · days_remaining · color-coded age vs expiry.
 */
export function LotDetailModal({
  itemCode, itemName, warehouse, whsName, snapshotDate, onClose,
}: Props) {
  const open = !!itemCode && !!warehouse;

  const { data: lots = [], isLoading } = useLotsForItemWarehouse(
    itemCode ?? undefined,
    warehouse ?? undefined,
    snapshotDate,
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Compute aggregates
  const totalQty = lots.reduce((s, l) => s + Number(l.qty ?? 0), 0);
  const totalVal = lots.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const today = Date.now();
  const oldestInDays = lots.reduce<number | null>((max, l) => {
    if (!l.in_date) return max;
    const d = Math.floor((today - new Date(l.in_date).getTime()) / 86_400_000);
    return max == null || d > max ? d : max;
  }, null);
  const expiredCount = lots.filter(l => l.days_remaining != null && l.days_remaining < 0).length;
  const expiringSoonCount = lots.filter(l => l.days_remaining != null && l.days_remaining >= 0 && l.days_remaining <= 30).length;
  const hasFefoViolation = oldestInDays != null && oldestInDays >= 180 && lots.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(31,56,100,0.1)' }}>
              <Layers size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-primary-light)' }}>
                  {itemCode}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                  {warehouse}{whsName && ` — ${whsName}`}
                </span>
              </div>
              <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{itemName ?? '—'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-[var(--bg-alt)]" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Summary strip */}
        <div className="px-6 py-3 border-b grid grid-cols-2 md:grid-cols-5 gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <SummaryStat label="Lots"            value={formatNumber(lots.length)} icon={<Layers size={12} />} />
          <SummaryStat label="Total Qty"       value={formatNumber(totalQty, 2)}
                       sub={lots[0]?.uom ?? ''} />
          <SummaryStat label="Total Value"     value={`฿${formatCompact(totalVal)}`} color="#1F3864" />
          <SummaryStat label="Oldest Lot"
                       value={oldestInDays != null ? `${formatNumber(oldestInDays)}d` : '—'}
                       color={oldestInDays != null && oldestInDays >= 180 ? '#7c3aed'
                            : oldestInDays != null && oldestInDays >= 90  ? '#d97706'
                            :                                                undefined} />
          <SummaryStat label="At Risk"
                       value={`${formatNumber(expiredCount)} + ${formatNumber(expiringSoonCount)}`}
                       sub="หมดแล้ว / ≤30d"
                       color={expiredCount > 0 ? '#dc2626' : expiringSoonCount > 0 ? '#d97706' : undefined} />
        </div>

        {/* FEFO violation banner */}
        {hasFefoViolation && (
          <div className="px-6 py-2.5 flex items-center gap-2 text-xs"
               style={{ backgroundColor: 'rgba(124,58,237,0.08)', borderBottom: '1px solid var(--border)', color: '#7c3aed' }}>
            <AlertTriangle size={14} />
            <span>
              <strong>⚠️ FEFO Violation</strong> — มี lot อายุ {formatNumber(oldestInDays!)} วัน ทั้งที่มี lot ใหม่กว่าในคลังเดียวกัน · ทีมควรหยิบ lot เก่าก่อน
            </span>
          </div>
        )}

        {/* Lot table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : lots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: 'var(--text-muted)' }}>
              <Package size={32} className="opacity-40 mb-2" />
              <p className="text-sm">ไม่มีข้อมูล lot ของรายการนี้</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 0 var(--border)' }}>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">Batch / Lot</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Value</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">In Date</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">Expire Date</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l, idx) => {
                  const daysLeft = l.days_remaining;
                  const inDateDays = l.in_date
                    ? Math.floor((today - new Date(l.in_date).getTime()) / 86_400_000)
                    : null;
                  // Color code days left
                  const daysLeftColor =
                    daysLeft == null   ? 'var(--text-muted)' :
                    daysLeft < 0       ? '#7f1d1d' :
                    daysLeft <= 30     ? '#dc2626' :
                    daysLeft <= 90     ? '#ea580c' :
                    daysLeft <= 180    ? '#65a30d' :
                                          '#16a34a';
                  // Highlight FEFO-violating row (oldest if multiple lots)
                  const isOldestFefoRisk = inDateDays != null && inDateDays >= 180 && lots.length > 1;
                  return (
                    <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.batch_num ?? '—'}
                        {isOldestFefoRisk && (
                          <span
                            className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold cursor-help"
                            style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}
                            title={
                              `OLD: lot นี้อายุ ${formatNumber(inDateDays!)} วัน (≥ 180 วัน) ` +
                              `และมี lot ใหม่กว่าในคลังเดียวกัน → ละเมิด FEFO\n\n` +
                              `ทำไมถึง flag:\n` +
                              `• สินค้าค้างคลังนาน เสี่ยงเสื่อมคุณภาพและใกล้หมดอายุ\n` +
                              `• ทีมหยิบ lot ใหม่ไปก่อนแทนที่จะหยิบ lot นี้\n` +
                              `• กระทบ GMP/HACCP audit\n\n` +
                              `ควรทำอย่างไร:\n` +
                              `• หยิบ lot นี้ออกก่อน (First-Expired-First-Out)\n` +
                              `• ถ้าใกล้หมดอายุมาก → ทำโปรโมชัน clearance\n` +
                              `• ถ้าเลย shelf life → ดำเนินการ write-off ตาม SOP`
                            }
                          >
                            ⚠️ OLD
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums">
                        {formatNumber(Number(l.qty ?? 0), 2)}
                      </td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {l.unit_cost != null ? formatCurrency(Number(l.unit_cost)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold">
                        ฿{formatCompact(Number(l.amount ?? 0))}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div style={{ color: 'var(--text)' }}>{l.in_date ? formatDate(l.in_date) : '—'}</div>
                        {inDateDays != null && (
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <Calendar size={9} className="inline mr-0.5" />
                            {formatNumber(inDateDays)} วันก่อน
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text)' }}>
                        {l.expire_date ? formatDate(l.expire_date) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-right font-semibold tabular-nums" style={{ color: daysLeftColor }}>
                        {daysLeft == null ? '—'
                         : daysLeft < 0   ? `หมด ${formatNumber(Math.abs(daysLeft))}d`
                         :                  `${formatNumber(daysLeft)}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer hint + OLD badge legend */}
        <div className="px-6 py-2.5 border-t flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-center"
             style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <span>เรียงตามวันหมดอายุน้อย → มาก (FEFO order)</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>
              ⚠️ OLD
            </span>
            = lot อายุ ≥ 180 วัน + มี lot ใหม่กว่าในคลังเดียวกัน (ละเมิด FEFO)
          </span>
          <span>·</span>
          <span>กด Esc หรือคลิกพื้นที่นอกเพื่อปิด</span>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        {icon}<span>{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}
