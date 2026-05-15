import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/utils/format';

export type SheetConfigKey =
  | 'warehouses'
  | 'item_groups'
  | 'items'
  | 'stock_thresholds'
  | 'inventory_transactions'
  | 'inventory_lots';

export interface ParsedData {
  warehouses: any[];
  item_groups: any[];
  items: any[];
  stock_thresholds: any[];
  inventory_transactions: any[];
  inventory_lots: any[];
}

export interface ImportState {
  parsedData: ParsedData | null;
  sheetFound: Record<SheetConfigKey, boolean>;
  txDateMin: string;
  txDateMax: string;
  lotSnapshotDate: string;   // ToDate (latest) across all lot rows
}

const getVal = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in row) return row[key];
    for (const k of Object.keys(row)) {
      if (k.trim() === key) return row[k];
    }
  }
  return undefined;
};

/**
 * Parse a worksheet that uses the SmartInventory styled-template layout
 * (banner on rows 1-2, blank row 3, header on row 4, description on row 5,
 * data from row 6 onwards) OR a raw layout where the header is on row 1.
 *
 * - Auto-detects which layout by scanning the first ~8 rows for any of
 *   `headerSignals` (e.g. ['Item Code', 'Code']).
 * - Strips the trailing '*' from header cells (required-field marker).
 * - For styled sheets, skips the description row that sits directly under
 *   the header.
 *
 * Returns an array of records keyed by the cleaned header text. Records
 * whose first column is empty are skipped (defensive — trailing blank rows).
 */
function parseSheet(
  wb: XLSX.WorkBook,
  sheetNames: string[],
  headerSignals: string[],
): Record<string, unknown>[] {
  const name = wb.SheetNames.find(n =>
    sheetNames.some(sn => n.toLowerCase().includes(sn.toLowerCase()))
  );
  if (!name) {
    console.warn('[parseSheet] no sheet matched', { signals: sheetNames, available: wb.SheetNames });
    return [];
  }
  const sheet = wb.Sheets[name];

  // Read everything as arrays so we can locate the header ourselves
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
  });
  if (!rows.length) {
    console.warn('[parseSheet] empty sheet', name);
    return [];
  }

  // Locate the header row: first row in which one of the signals appears
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] ?? []).map(c => (c == null ? '' : String(c).replace(/\s*\*\s*$/, '').trim()));
    if (cells.some(c => headerSignals.some(sig => c === sig || c.toLowerCase() === sig.toLowerCase()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    console.warn('[parseSheet] header not found', name, 'looking for', headerSignals,
      'first row sample:', (rows[0] ?? []).slice(0, 6));
    return [];
  }

  const rawHeaders = rows[headerIdx] ?? [];
  const headers: string[] = rawHeaders.map((h, idx) =>
    h == null ? `__col_${idx + 1}` : String(h).replace(/\s*\*\s*$/, '').trim()
  );

  // Detect "styled" layout: row right after header is the description row
  // (entirely text describing each column, no IDs / numbers / dates).
  const next = rows[headerIdx + 1] ?? [];
  // Heuristic: if at least 2 cells of next row contain Thai text and
  // 0 of them look like an ID / number, treat as description row.
  const looksLikeDescription = (() => {
    if (!next || !next.length) return false;
    let textyCount = 0;
    let idLikeCount = 0;
    for (const c of next) {
      if (c == null || c === '') continue;
      const s = String(c).trim();
      // ID-looking: alphanumeric short code or pure number
      if (/^[A-Z]{1,4}-?\w{0,12}$/.test(s) || /^\d+(\.\d+)?$/.test(s)) idLikeCount++;
      else if (s.length > 2) textyCount++;
    }
    return textyCount >= 2 && idLikeCount === 0;
  })();

  const dataStart = headerIdx + (looksLikeDescription ? 2 : 1);
  const out: Record<string, unknown>[] = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    // skip rows where the first column is empty (trailing junk)
    if (row[0] == null || String(row[0]).trim() === '') continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    // Also expose positional accessors so consumers can fall back to col index
    // when a header is missing (e.g. the user's file leaves col 8/9 unlabeled).
    obj.__row = row;
    out.push(obj);
  }
  console.info(`[parseSheet] ${name}: headerRow=${headerIdx + 1} dataStart=${dataStart + 1} rows=${out.length}`);
  return out;
}

/** Helper: read a value at column index N (1-based) from the __row positional cache. */
function getPositional(row: Record<string, unknown>, idx1Based: number): unknown {
  const arr = row.__row as unknown[] | undefined;
  if (!arr) return undefined;
  return arr[idx1Based - 1];
}

// ── 1. Parse Excel into Structured Data ──────────────────────────────────────
export const parseComprehensiveExcel = async (
  file: File,
  onProgress: (step: string, detail: string, percent: number) => void
): Promise<ImportState> => {
  onProgress('กำลังอ่านไฟล์ Excel...', 'Parsing Master Data Templates', 5);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });

        const parseExcelDate = (val: unknown): string | null => {
          if (!val) return null;
          if (val instanceof Date) return val.toISOString().split('T')[0];
          const s = String(val).trim();
          if (!s || s === 'null' || s === 'undefined') return null;
          if (/^\d{5}$/.test(s)) {
            const d = XLSX.SSF.parse_date_code(Number(s));
            if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          }
          return s.split('T')[0].split(' ')[0] || null;
        };

        const warehouses = parseSheet(wb,
          ['Warehouses', 'คลังสินค้า'],
          ['Warehouse Code', 'Code'],
        ).map(row => {
          const code = getVal(row, ['Warehouse Code', 'Code']);
          if (!code) return null;
          return {
            code: String(code).trim(),
            whs_name: String(getVal(row, ['Warehouse Name', 'Name']) ?? code).trim(),
            whs_type: String(getVal(row, ['Type', 'Group']) ?? 'General').trim(),
            is_active: String(getVal(row, ['Active', 'Status']) ?? '') !== 'In',
            sort_order: Number(getVal(row, ['Sort Order', 'Order']) ?? 99),
          };
        }).filter(Boolean) as any[];

        const item_groups = parseSheet(wb,
          ['Item Groups', 'กลุ่มสินค้า'],
          ['Group Code', 'Code'],
        ).map(row => {
          const code = getVal(row, ['Group Code', 'Code']);
          if (!code) return null;
          return {
            group_code: Number(code),
            group_name: String(getVal(row, ['Group Name', 'Name']) ?? code).trim(),
            description: getVal(row, ['Description', 'Desc']) ? String(getVal(row, ['Description', 'Desc'])) : null,
            shelf_life_days: getVal(row, ['Shelf Life Days', 'ShelfLifeDays', 'Shelf Life'])
              ? Number(getVal(row, ['Shelf Life Days', 'ShelfLifeDays', 'Shelf Life']))
              : null,
          };
        }).filter(Boolean) as any[];

        const items = parseSheet(wb,
          ['Items', 'สินค้า', 'dbo_OITM'],
          ['Item Code', 'ItemCode'],
        ).map(row => {
          const code = getVal(row, ['Item Code', 'ItemCode']);
          if (!code) return null;
          // FS Category lives at named column "Category" / "FS Category" if present,
          // otherwise in the original NSL file at the 9th column (col 8 is intentionally blank).
          const fsCatNamed = getVal(row, ['FS Category', 'Category', 'fs_category']);
          const fsCatPositional = fsCatNamed == null ? getPositional(row, 9) : null;
          const fsCategory = (fsCatNamed ?? fsCatPositional);
          return {
            item_code:   String(code).trim(),
            itemname:    String(getVal(row, ['Item Name', 'ItemName']) ?? '').trim(),
            uom:         String(getVal(row, ['UOM', 'InvntryUom']) ?? 'KG'),
            std_cost:    Number(getVal(row, ['Std Cost', 'STD COST']) ?? 0),
            moving_avg:  Number(getVal(row, ['Moving Avg', 'Moving Average']) ?? 0),
            group_code:  Number(getVal(row, ['Group Code', 'ItmsGrpCod']) ?? 0),
            is_active:   String(getVal(row, ['Status', 'frozenFor']) ?? '') !== 'Y'
                        && String(getVal(row, ['Status']) ?? '') !== 'In',
            expire_date: parseExcelDate(getVal(row, ['Expire Date', 'ExpireDate', 'Expiry Date', 'ExpiryDate', 'Expiration Date'])),
            fs_category: fsCategory ? String(fsCategory).trim() : null,
          };
        }).filter(Boolean) as any[];

        const stock_thresholds = parseSheet(wb,
          ['Thresholds', 'จุดสั่งซื้อ', 'Min Max'],
          ['Item Code'],
        ).map(row => {
          const item_code = getVal(row, ['Item Code']);
          const warehouse = getVal(row, ['Warehouse Code', 'Warehouse']);
          if (!item_code || !warehouse) return null;
          // Skip rows with no thresholds set at all
          const min = getVal(row, ['Min Level', 'Min']);
          const rop = getVal(row, ['Reorder Point', 'ROP']);
          const max = getVal(row, ['Max Level', 'Max']);
          if (min == null && rop == null && max == null) return null;
          return {
            item_code:     String(item_code).trim(),
            warehouse:     String(warehouse).trim(),
            min_level:     Number(min ?? 0),
            reorder_point: Number(rop ?? 0),
            max_level:     max != null ? Number(max) : null,
          };
        }).filter(Boolean) as any[];

        const inventory_transactions = parseSheet(wb,
          ['Transactions', 'Movement', 'dbo_OIMN'],
          ['Transaction No', 'TransNum', 'Date'],
        ).map(row => {
          const transNum = getVal(row, ['Transaction No', 'TransNum']);
          const itemCode = getVal(row, ['Item Code', 'ItemCode']);
          if (!transNum || !itemCode) return null;
          return {
            trans_num: Number(transNum),
            doc_date: (() => {
              const d = getVal(row, ['Date', 'DocDate']);
              if (d instanceof Date) return d.toISOString().split('T')[0];
              return String(d ?? '').split('T')[0].split(' ')[0];
            })(),
            trans_type:   Number(getVal(row, ['Tx Type', 'TransType']) ?? 0),
            warehouse:    String(getVal(row, ['Warehouse', 'Warehouse Code']) ?? '').trim(),
            doc_line_num: Number(getVal(row, ['Line Num', 'DocLineNum']) ?? -1),
            item_code:    String(itemCode).trim(),
            in_qty:       Number(getVal(row, ['In Qty', 'InQuantity']) ?? 0),
            out_qty:      Number(getVal(row, ['Out Qty', 'OutQuantity']) ?? 0),
            amount:       Number(getVal(row, ['Total Amount', 'Amount']) ?? 0),
            direction:    String(getVal(row, ['Direction', 'Transection']) ?? '').trim()
                          || (Number(getVal(row, ['In Qty', 'InQuantity'])) > 0 ? 'In' : 'Out'),
          };
        }).filter(Boolean) as any[];

        // ── Inventory Lots ──
        // Match sheets named "Lot", "Lots", or "lot_คงเหลือ" (case-insensitive substring).
        // The NSL lot sheet has the header on row 1 directly, no banner/description rows.
        const inventory_lots = parseSheet(wb,
          ['Lot Inventory', 'Lots', 'lot_คงเหลือ', 'lot คงเหลือ', 'Lot'],
          ['BatchNum Lot', 'BatchNum', 'Batch', 'Lot'],
        ).map(row => {
          const itemCode = getVal(row, ['Item Code', 'ItemCode']);
          const warehouse = getVal(row, ['Warehouse', 'Warehouse Code', 'WhsCode']);
          if (!itemCode || !warehouse) return null;

          const dateLike = (v: unknown): string | null => {
            if (!v) return null;
            if (v instanceof Date) return v.toISOString().split('T')[0];
            const s = String(v).trim();
            if (!s || s === 'null' || s === 'undefined') return null;
            // Excel serial?
            if (/^\d{5}$/.test(s)) {
              const d = XLSX.SSF.parse_date_code(Number(s));
              if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
            }
            // "YYYY.MM.DD..." → take the leading date
            const m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
            if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
            return s.split('T')[0].split(' ')[0] || null;
          };

          const qty = Number(getVal(row, ['Quantity', 'Qty', 'OnHand']) ?? 0);
          const amount = Number(getVal(row, ['Total Amount', 'Amount', 'Value']) ?? 0);
          const batchRaw = getVal(row, ['BatchNum Lot', 'BatchNum', 'Batch', 'Lot']);
          // Keep original batch identifier (preserves the timestamp-style id from SAP)
          const batch_num = batchRaw ? String(batchRaw).trim() : `${itemCode}-${warehouse}-NOBATCH`;
          return {
            item_code:       String(itemCode).trim(),
            warehouse:       String(warehouse).trim(),
            batch_num,
            qty,
            amount,
            in_date:         dateLike(getVal(row, ['InDate', 'In Date'])),
            production_date: dateLike(getVal(row, ['PrdDate', 'Production Date', 'ProductionDate'])),
            expire_date:     dateLike(getVal(row, ['ExpDate', 'Expire Date', 'ExpiryDate', 'Expiration Date'])),
            snapshot_date:   dateLike(getVal(row, ['ToDate', 'Snapshot Date', 'AsOf'])) ?? new Date().toISOString().split('T')[0],
          };
        }).filter(Boolean) as any[];

        let txDateMin = '';
        let txDateMax = '';
        if (inventory_transactions.length > 0) {
          const dates = inventory_transactions.map((t: any) => t.doc_date).filter(Boolean).sort();
          txDateMin = dates[0] ?? '';
          txDateMax = dates[dates.length - 1] ?? '';
        }

        let lotSnapshotDate = '';
        if (inventory_lots.length > 0) {
          // Use the most common (mode) snapshot date — typically all rows share one ToDate
          const counts = new Map<string, number>();
          for (const l of inventory_lots as any[]) {
            counts.set(l.snapshot_date, (counts.get(l.snapshot_date) ?? 0) + 1);
          }
          lotSnapshotDate = [...counts.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] ?? '';
        }

        const parsedData = { warehouses, item_groups, items, stock_thresholds, inventory_transactions, inventory_lots };
        const sheetFound = {
          warehouses: warehouses.length > 0,
          item_groups: item_groups.length > 0,
          items: items.length > 0,
          stock_thresholds: stock_thresholds.length > 0,
          inventory_transactions: inventory_transactions.length > 0,
          inventory_lots: inventory_lots.length > 0,
        };

        resolve({ parsedData, sheetFound, txDateMin, txDateMax, lotSnapshotDate });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
};

// ── 2. Execute Relational Import ─────────────────────────────────────────────
const BATCH_SIZE = 500;

const batchUpsert = async (table: string, data: any[], conflictKey: string, onProgress: (done: number, total: number) => void) => {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictKey });
    if (error) throw new Error(`[${table}] ${error.message}`);
    onProgress(Math.min(i + BATCH_SIZE, data.length), data.length);
  }
};

const batchInsert = async (table: string, data: any[], onProgress: (done: number, total: number) => void) => {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error && error.code !== '23505') throw new Error(`[${table}] ${error.message}`);
    onProgress(Math.min(i + BATCH_SIZE, data.length), data.length);
  }
};

export const executeComprehensiveImport = async (
  data: ParsedData,
  includeSheets: Record<SheetConfigKey, boolean>,
  txnMode: 'replace' | 'append',
  onProgress: (step: string, detail: string, percent: number) => void
): Promise<{ success: boolean; error?: string }> => {
  try {
    let pct = 10;
    const progressSegment = 90 / Object.values(includeSheets).filter(Boolean).length;

    const executeTable = async (key: SheetConfigKey, table: string, conflictKey: string | null, label: string) => {
      if (!includeSheets[key] || data[key].length === 0) return;
      onProgress(`กำลังอัปเดต ${label}...`, `0 / ${formatNumber(data[key].length)} rows`, pct);

      if (conflictKey) {
        await batchUpsert(table, data[key], conflictKey, (d, t) => {
          onProgress(`กำลังอัปเดต ${label}...`, `${formatNumber(d)} / ${formatNumber(t)} rows`, pct + (d / t) * progressSegment);
        });
      } else {
        if (table === 'inventory_transactions' && txnMode === 'replace') {
           onProgress('กำลังล้างตาราง Transactions...', 'Clearing Old Movements', pct);
           let hasMore = true;
           while(hasMore) {
               const { data: qData, error: errClear } = await supabase.from('inventory_transactions').delete().gt('id', 0).select('id').limit(5000);
               if (errClear) throw errClear;
               hasMore = (qData?.length ?? 0) === 5000;
           }
        }
        await batchInsert(table, data[key], (d, t) => {
          onProgress(`กำลังอัปเดต ${label}...`, `${formatNumber(d)} / ${formatNumber(t)} rows`, pct + (d / t) * progressSegment);
        });
      }
      pct += progressSegment;
    };

    // ── Execute in STRICT FOREIGN KEY ORDER ──
    await executeTable('warehouses', 'warehouses', 'code', 'Warehouses (คลังสินค้า)');
    await executeTable('item_groups', 'item_groups', 'group_code', 'Item Groups (กลุ่มสินค้า)');
    await executeTable('items', 'items', 'item_code', 'Items (สินค้า)');
    await executeTable('stock_thresholds', 'stock_thresholds', 'item_code,warehouse', 'Stock Thresholds (จุดสั่งซื้อ)');
    await executeTable('inventory_transactions', 'inventory_transactions', null, 'Transactions (การเคลื่อนไหว)');

    // ── Inventory Lots: snapshot-style replace ──
    // Find the snapshot_date(s) being imported; delete existing rows for those dates, then bulk insert.
    if (includeSheets.inventory_lots && data.inventory_lots.length > 0) {
      const snapshots = Array.from(new Set(data.inventory_lots.map((l: any) => l.snapshot_date)));
      onProgress('กำลังอัปเดต Inventory Lots...', `Replacing snapshot(s): ${snapshots.join(', ')}`, pct);
      for (const sd of snapshots) {
        const { error: errClear } = await supabase.from('inventory_lots').delete().eq('snapshot_date', sd);
        if (errClear) throw new Error(`[inventory_lots clear ${sd}] ${errClear.message}`);
      }
      await batchInsert('inventory_lots', data.inventory_lots, (d, t) => {
        onProgress(`กำลังอัปเดต Inventory Lots...`, `${formatNumber(d)} / ${formatNumber(t)} rows`, pct + (d / t) * progressSegment);
      });
      pct += progressSegment;
    }

    await supabase.from('system_config').upsert({ key: 'last_sync_at', value: new Date().toISOString() }, { onConflict: 'key' });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
};

// ── 3. Template Generator ────────────────────────────────────────────────────
// Modern styled template (ExcelJS) — dynamically imported to keep main bundle slim
export const generateComprehensiveTemplate = async () => {
  const { buildBeautifulTemplate } = await import('./templateBuilder');
  await buildBeautifulTemplate();
};
