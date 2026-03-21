import { useState, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, PlusCircle, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useImportLogs } from '@/hooks/useSupabaseQuery';
import { formatDateTime, formatNumber } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';

interface ParsedData {
  items: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
}

type ImportMode = 'replace' | 'append';

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Insert rows in parallel batches of `batchSize` — no conflict resolution */
async function batchInsert(
  table: string,
  rows: Record<string, unknown>[],
  batchSize: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  // Run batches sequentially to avoid hammering the DB
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);

    if (error) {
      // 23505 = unique_violation — just skip duplicates
      // 23503 = foreign_key_violation — skip rows referencing missing items
      if (error.code === '23505' || error.code === '23503') {
        errors += batch.length;
      } else {
        throw new Error(`[${table}] ${error.message} (code: ${error.code})`);
      }
    } else {
      inserted += batch.length;
    }

    onProgress(Math.min(i + batchSize, rows.length), rows.length);
  }

  return { inserted, errors };
}

/** Upsert items (safe — item_code is a simple PK) */
async function batchUpsertItems(
  rows: Record<string, unknown>[],
  batchSize: number,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('items')
      .upsert(batch, { onConflict: 'item_code' });
    if (error) throw new Error(`[items] ${error.message}`);
    onProgress(Math.min(i + batchSize, rows.length), rows.length);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export function ImportPage() {
  const { data: importLogs, refetch: refetchLogs } = useImportLogs();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
  const [progress, setProgress] = useState({
    step: '',
    detail: '',
    percent: 0,
    error: '',
  });

  // ── Parse Excel ────────────────────────────────────────────────────────────
  const parseExcel = useCallback((f: File) => {
    setProgress({ step: 'กำลัง parse ไฟล์...', detail: '', percent: 0, error: '' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });

        /* ── OITM ── */
        const oitmSheet =
          wb.Sheets['dbo_OITM'] ??
          wb.Sheets[wb.SheetNames[0]];

        // Auto-detect header row: try default (row 0) first, fall back to row 1
        let oitmRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oitmSheet);
        if (oitmRaw.length > 0 && !('ItemCode' in oitmRaw[0])) {
          // Header might be on row 1 (row 0 is a label)
          oitmRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oitmSheet, { range: 1 });
        }

        // Helper: lookup key with trimmed whitespace (SAP exports may have ' STD COST ')
        const getVal = (row: Record<string, unknown>, key: string): unknown => {
          if (key in row) return row[key];
          // Try trimmed match
          for (const k of Object.keys(row)) {
            if (k.trim() === key) return row[k];
          }
          return undefined;
        };

        const items = oitmRaw
          .map((row) => ({
            item_code:   String(getVal(row, 'ItemCode')       ?? ''),
            itemname:    String(getVal(row, 'ItemName')       ?? ''),
            foreign_name: getVal(row, 'FrgnName') ? String(getVal(row, 'FrgnName')) : null,
            uom:         String(getVal(row, 'InvntryUom')     ?? 'KG'),
            std_cost:    Number(getVal(row, 'STD COST')       ?? 0),
            moving_avg:  Number(getVal(row, 'Moving Average') ?? 0),
            group_code:  Number(getVal(row, 'ItmsGrpCod')     ?? 0),
            // group_name removed — normalized into item_groups lookup table
            is_active:   String(getVal(row, 'frozenFor')      ?? '') !== 'Y',
          }))
          .filter((i) => i.item_code);

        /* ── OIMN ── */
        const oimnSheet =
          wb.Sheets['dbo_OIMN'] ??
          wb.Sheets[wb.SheetNames[1]];
        const oimnRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oimnSheet);

        const transactions = oimnRaw
          .map((row) => {
            let docDate = row['DocDate'];
            if (docDate instanceof Date) {
              docDate = docDate.toISOString().split('T')[0];
            } else {
              docDate = String(docDate ?? '').split('T')[0].split(' ')[0];
            }

            return {
              trans_num:    Number(row['TransNum']         ?? 0),
              doc_date:     docDate,
              trans_type:   Number(row['TransType']        ?? 0),
              // trans_name removed — normalized into transaction_types lookup table
              warehouse:    String(row['Warehouse']        ?? ''),
              // whs_name removed — normalized into warehouses lookup table
              group_code:   Number(row['ItmsGrpCod']       ?? 0),
              // group_name removed — normalized into item_groups lookup table
              // *** แปลง NULL → -1 เพื่อให้ unique index ทำงานถูกต้อง ***
              doc_line_num: row['DocLineNum'] != null ? Number(row['DocLineNum']) : -1,
              item_code:    String(row['ItemCode']         ?? ''),
              in_qty:       Number(row['InQuantity']       ?? 0),
              out_qty:      Number(row['OutQuantity']      ?? 0),
              balance_qty:  Number(row['BalanceQuantity']  ?? 0),
              amount:       Number(row['Amount']           ?? 0),
              direction:    String(row['Transection']      ?? ''),
            };
          })
          .filter((t) => t.item_code && t.trans_num);

        setParsedData({ items, transactions });
        setProgress({ step: '', detail: '', percent: 0, error: '' });
      } catch (err) {
        setProgress({
          step: 'Parse Error',
          detail: '',
          percent: 0,
          error: String(err),
        });
      }
    };
    reader.readAsBinaryString(f);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsedData(null);
    parseExcel(f);
  };

  // ── Main Import ────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsedData || !file) return;
    setImporting(true);

    const tick = (step: string, detail: string, percent: number) =>
      setProgress({ step, detail, percent, error: '' });

    try {
      // ── 1. Clear existing transactions (Replace mode) ─────────────────────
      if (importMode === 'replace') {
        tick('กำลังลบข้อมูลเก่า...', 'Clearing inventory_transactions', 3);
        // Delete in chunks to avoid timeout on large datasets
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('inventory_transactions')
            .delete()
            .gt('id', 0) // delete all rows (id is serial > 0)
            .select('id')
            .limit(5000);
          if (error) throw new Error(`Clear error: ${error.message}`);
          hasMore = (data?.length ?? 0) === 5000;
        }
        tick('ลบข้อมูลเก่าเสร็จแล้ว', '', 6);
      }

      // ── 2. Upsert Items ───────────────────────────────────────────────────
      tick('กำลัง import Items...', `0 / ${formatNumber(parsedData.items.length)}`, 8);
      await batchUpsertItems(parsedData.items, 300, (done, total) => {
        tick(
          'กำลัง import Items...',
          `${formatNumber(done)} / ${formatNumber(total)}`,
          8 + (done / total) * 17,
        );
      });
      tick('Items สำเร็จ ✓', `${formatNumber(parsedData.items.length)} รายการ`, 25);

      // ── 3. Filter & Insert Transactions ─────────────────────────────────
      // Collect valid item_codes from parsed items to filter out FK violations
      const validItemCodes = new Set(parsedData.items.map((i) => String(i.item_code)));

      // Also fetch existing item_codes from DB (in case items existed before this import)
      const { data: existingItems } = await supabase
        .from('items')
        .select('item_code')
        .limit(10_000);
      if (existingItems) {
        for (const item of existingItems) {
          validItemCodes.add(item.item_code);
        }
      }

      const validTransactions = parsedData.transactions.filter(
        (t) => validItemCodes.has(String(t.item_code)),
      );
      const skippedFK = parsedData.transactions.length - validTransactions.length;

      if (skippedFK > 0) {
        console.warn(`Skipped ${skippedFK} transactions with missing item_code (FK violation prevention)`);
      }

      const txTotal = validTransactions.length;
      tick('กำลัง import Transactions...', `0 / ${formatNumber(txTotal)}${skippedFK ? ` (ข้าม ${formatNumber(skippedFK)} รายการ item_code ไม่พบ)` : ''}`, 27);

      const { inserted, errors: skipped } = await batchInsert(
        'inventory_transactions',
        validTransactions,
        1000, // 1,000 rows/batch → ~66 batches only
        (done, total) => {
          tick(
            'กำลัง import Transactions...',
            `${formatNumber(done)} / ${formatNumber(total)}`,
            27 + (done / total) * 68,
          );
        },
      );

      const totalSkipped = skipped + skippedFK;

      // ── 4. Update last_sync_at ────────────────────────────────────────────
      await supabase
        .from('system_config')
        .upsert({ key: 'last_sync_at', value: new Date().toISOString() }, { onConflict: 'key' });

      // ── 5. Log ────────────────────────────────────────────────────────────
      await supabase.from('import_logs').insert({
        file_name: file.name,
        items_count: parsedData.items.length,
        transactions_count: inserted,
        status: totalSkipped > 0 ? 'partial' : 'success',
        error_summary: totalSkipped > 0
          ? `${skipped > 0 ? `${skipped} duplicates` : ''}${skipped > 0 && skippedFK > 0 ? ', ' : ''}${skippedFK > 0 ? `${skippedFK} missing item_code` : ''}`
          : null,
      });

      tick(
        '✅ Import สำเร็จ!',
        `Items: ${formatNumber(parsedData.items.length)} | Transactions: ${formatNumber(inserted)}${totalSkipped ? ` | Skipped: ${formatNumber(totalSkipped)}` : ''}`,
        100,
      );

      queryClient.invalidateQueries();
      refetchLogs();
    } catch (err) {
      const msg = String(err);
      setProgress({ step: '❌ Import ล้มเหลว', detail: '', percent: 0, error: msg });
      await supabase.from('import_logs').insert({
        file_name: file?.name ?? 'unknown',
        items_count: 0,
        transactions_count: 0,
        status: 'error',
        error_summary: msg.substring(0, 500),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleResetAll = async () => {
    // Immediate feedback to verify click
    console.log('--- Handle Reset All Clicked ---');

    if (!window.confirm('⚠️ คำเตือน: คุณกำลังจะลบข้อมูลทั้งหมด (Items, Transactions, Thresholds) ออกจากระบบ!\n\nการกระทำนี้ไม่สามารถย้อนคืนได้ ยืนยันที่จะลบหรือไม่?')) {
      console.log('Reset cancelled by user (1st confirm)');
      return;
    }

    if (!window.confirm('กรุณายืนยันอีกครั้งเพื่อความปลอดภัย (ยืนยันครั้งที่ 2)')) {
      console.log('Reset cancelled by user (2nd confirm)');
      return;
    }

    setImporting(true);
    setProgress({ step: 'กำลังล้างข้อมูลทั้งหมด...', detail: 'เริ่มต้น (Server-side reset)...', percent: 5, error: '' });

    try {
      console.log('Step 1: Calling clear_all_data RPC...');
      // 1. ลองใช้ RPC (Remote Procedure Call) เพื่อลบข้อมูลแบบ atomic และข้าม RLS
      const { error: rpcErr } = await supabase.rpc('clear_all_data');

      if (rpcErr) {
        console.warn('RPC Failed or not found, falling back to manual delete...', rpcErr);
        // 2. ถ้า RPC ยังไม่ได้ถูกสร้าง ให้ลบแบบ manual (แต่อาจจะติด RLS)
        await supabase.from('inventory_transactions').delete().neq('id', 0);
        await supabase.from('stock_thresholds').delete().neq('id', 0);
        await supabase.from('items').delete().neq('item_code', '');
        await supabase.from('system_config').upsert({ key: 'last_sync_at', value: '' });
      }

      // Verification Step
      console.log('Verification: Checking actual database counts...');
      const { count: txLeft } = await supabase.from('inventory_transactions').select('*', { count: 'exact', head: true });
      const { count: itemsLeft } = await supabase.from('items').select('*', { count: 'exact', head: true });

      console.log(`Final Database Stats: Transactions: ${txLeft}, Items: ${itemsLeft}`);

      console.log('Reset COMPLETED. Clearing caches...');
      setProgress({ step: '✅ ล้างข้อมูลทั้งหมดสำเร็จ', detail: `คงเหลือ: Tx(${txLeft ?? 0}), Items(${itemsLeft ?? 0})`, percent: 100, error: '' });

      // Force Hard Cache Clear
      queryClient.clear();
      await queryClient.refetchQueries();

      setFile(null);
      setParsedData(null);
      refetchLogs();

      if ((txLeft ?? 0) > 0 || (itemsLeft ?? 0) > 0) {
        alert(`⚠️ ข้อมูลยังลบไม่หมด!\n- Transactions เหลือ: ${txLeft}\n- Items เหลือ: ${itemsLeft}\n\nสาเหตุ: รบกวนคุณลูกค้าเปิดไฟล์ supabase/migration.sql แล้ว Copy โค้ดไปรันใน SQL Editor ของ Supabase Dashboard เพื่ออนุญาตสิทธิ์การลบครับ`);
      } else {
        alert('✨ ล้างข้อมูลสำเร็จ 100% (ข้อมูลเป็น 0 รายการ)');
      }

    } catch (err) {
      console.error('Reset failed:', err);
      setProgress({ step: '❌ ล้างข้อมูลล้มเหลว', detail: '', percent: 0, error: String(err) });
      alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + String(err));
    } finally {
      setImporting(false);
    }
  };

  const isSuccess = progress.percent === 100;
  const barColor = progress.error
    ? 'var(--color-critical)'
    : isSuccess
      ? 'var(--color-success)'
      : 'var(--color-primary-light)';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Upload Card ── */}
      <div className="card">
        <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Import Data from SAP B1 Export
        </h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          อัปโหลดไฟล์ .xlsx ที่มี 2 sheet: <strong>dbo_OITM</strong> (Item Master) และ{' '}
          <strong>dbo_OIMN</strong> (Transactions)
        </p>

        {/* File Drop Zone */}
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-10 cursor-pointer transition-colors"
          style={{ borderColor: file ? '#2E75B6' : 'var(--border)', backgroundColor: file ? '#EFF6FF' : 'var(--bg-alt)' }}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={importing}
            className="hidden"
          />
          <Upload size={36} style={{ color: file ? '#2E75B6' : 'var(--text-muted)' }} />
          <p className="mt-3 font-medium" style={{ color: 'var(--text)' }}>
            {file ? file.name : 'คลิกเพื่อเลือกไฟล์ Excel'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'รองรับ .xlsx เท่านั้น'}
          </p>
        </label>

        {/* Parsed Preview */}
        {parsedData && !importing && (
          <div className="mt-5 space-y-4">
            {/* Stats */}
            <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-alt)' }}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={20} style={{ color: 'var(--color-primary-light)' }} />
                <span style={{ color: 'var(--text)' }}>
                  Items: <strong>{formatNumber(parsedData.items.length)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={20} style={{ color: 'var(--color-accent)' }} />
                <span style={{ color: 'var(--text)' }}>
                  Transactions: <strong>{formatNumber(parsedData.transactions.length)}</strong>
                </span>
              </div>
            </div>

            {/* Import Mode */}
            <div className="flex gap-3">
              <button
                onClick={() => setImportMode('replace')}
                className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${importMode === 'replace'
                  ? 'border-[var(--color-primary)] bg-blue-50 dark:bg-blue-950'
                  : ''
                  }`}
                style={{ borderColor: importMode === 'replace' ? '#1F3864' : 'var(--border)' }}
              >
                <RefreshCw size={20} style={{ color: importMode === 'replace' ? '#1F3864' : 'var(--text-muted)', flexShrink: 0 }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Replace All (แนะนำ)</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    ลบข้อมูลเก่าทั้งหมดแล้ว import ใหม่ — เร็วที่สุด
                  </p>
                </div>
              </button>

              <button
                onClick={() => setImportMode('append')}
                className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors`}
                style={{ borderColor: importMode === 'append' ? '#1F3864' : 'var(--border)', backgroundColor: importMode === 'append' ? '#EFF6FF' : undefined }}
              >
                <PlusCircle size={20} style={{ color: importMode === 'append' ? '#1F3864' : 'var(--text-muted)', flexShrink: 0 }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Append (เพิ่มเฉพาะใหม่)</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    ข้ามรายการที่ซ้ำ — ใช้สำหรับ update ข้อมูลบางส่วน
                  </p>
                </div>
              </button>
            </div>

            {importMode === 'replace' && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <Info size={16} className="text-orange-500 mt-0.5 shrink-0" />
                <span className="text-orange-800">
                  <strong>Replace mode</strong>: จะลบ Transactions ทั้งหมดก่อน import — ข้อมูล Items จะถูก upsert (ไม่ลบ)
                </span>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing}
              className="btn btn-primary w-full py-3 text-base"
            >
              <Upload size={18} />
              {importMode === 'replace' ? 'Replace & Import' : 'Append Import'}
            </button>
          </div>
        )}

        {/* Progress */}
        {(importing || progress.step) && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{progress.step}</span>
                {progress.detail && (
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{progress.detail}</span>
                )}
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                {Math.round(progress.percent)}%
              </span>
            </div>

            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress.percent}%`, backgroundColor: barColor }}
              />
            </div>

            {progress.error && (
              <div className="p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200 mt-2">
                <strong>Error:</strong> {progress.error}
              </div>
            )}
          </div>
        )}

        {/* Dangerous Actions */}
        {!importing && (
          <div className="mt-10 pt-6 border-t border-red-100">
            <h4 className="text-sm font-semibold text-red-600 mb-2">Dangerous Zone</h4>
            <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm text-red-900">ล้างข้อมูลทั้งหมดในระบบ</p>
                <p className="text-xs text-red-700 mt-1">ลบ Items, Transactions และ Thresholds ทั้งหมดเพื่อเริ่มต้นใหม่</p>
              </div>
              <button
                onClick={() => {
                  console.log('Button clicked via inline wrapper');
                  handleResetAll();
                }}
                className="btn border-red-300 text-red-600 hover:bg-red-600 hover:text-white bg-white transition-colors"
                style={{ cursor: 'pointer' }}
                title="ลบข้อมูลทั้งหมดถาวร"
              >
                Clear All Data
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Import History ── */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Import History</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>File Name</th>
                <th>Date</th>
                <th className="text-right">Items</th>
                <th className="text-right">Transactions</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(importLogs ?? []).map((log) => (
                <tr key={log.id}>
                  <td>
                    {log.status === 'success' && <CheckCircle size={18} className="text-green-600" />}
                    {log.status === 'error' && <XCircle size={18} className="text-red-600" />}
                    {log.status === 'partial' && <AlertTriangle size={18} className="text-orange-500" />}
                  </td>
                  <td className="font-medium" style={{ color: 'var(--text)' }}>{log.file_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatDateTime(log.imported_at)}</td>
                  <td className="text-right">{formatNumber(log.items_count)}</td>
                  <td className="text-right">{formatNumber(log.transactions_count)}</td>
                  <td
                    className="text-sm"
                    style={{
                      color: 'var(--text-muted)',
                      maxWidth: '220px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {log.error_summary ?? '—'}
                  </td>
                </tr>
              ))}
              {(importLogs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                    ยังไม่มีประวัติการ import
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
