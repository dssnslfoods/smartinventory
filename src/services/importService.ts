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
          // Skip rows with no thresholds set — handles null AND empty string AND zero.
          // (The master file has 37k threshold rows with empty values; importing them all
          // wastes ~70 round trips and pollutes the table with zeros.)
          const min = getVal(row, ['Min Level', 'Min']);
          const rop = getVal(row, ['Reorder Point', 'ROP']);
          const max = getVal(row, ['Max Level', 'Max']);
          const minN = min == null || min === '' ? 0 : Number(min);
          const ropN = rop == null || rop === '' ? 0 : Number(rop);
          const maxN = max == null || max === '' ? null : Number(max);
          if (!minN && !ropN && maxN == null) return null;
          return {
            item_code:     String(item_code).trim(),
            warehouse:     String(warehouse).trim(),
            min_level:     minN,
            reorder_point: ropN,
            max_level:     maxN,
          };
        }).filter(Boolean) as any[];

        const inventory_transactions_raw = parseSheet(wb,
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
              if (d instanceof Date) {
                // Same xlsx rounding quirk as the lot dateLike helper: shift
                // +12h then take local components so "almost-midnight" Excel
                // dates round to the intended day.
                const shifted = new Date(d.getTime() + 12 * 3600 * 1000);
                const y = shifted.getFullYear();
                const m = String(shifted.getMonth() + 1).padStart(2, '0');
                const day = String(shifted.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
              }
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

        // Dedupe by the unique key (trans_num, item_code, doc_line_num) — keep last.
        // The master file can contain duplicate rows for the same line which would
        // crash an atomic batch insert; doing it in memory keeps the import going.
        const txnDedupMap = new Map<string, any>();
        let txnDupCount = 0;
        for (const t of inventory_transactions_raw) {
          const k = `${t.trans_num}|${t.item_code}|${t.doc_line_num}`;
          if (txnDedupMap.has(k)) txnDupCount++;
          txnDedupMap.set(k, t);
        }
        if (txnDupCount > 0) {
          console.warn(`[transactions] deduped ${txnDupCount} duplicate rows on (trans_num,item_code,doc_line_num)`);
        }
        const inventory_transactions = Array.from(txnDedupMap.values());

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
            if (v instanceof Date) {
              // xlsx has a known rounding quirk: an Excel cell "2026-03-31
              // 00:00:00" comes out as 2026-03-30T16:59:56Z, i.e. 4 seconds
              // BEFORE midnight in Bangkok local time. getDate() then returns
              // the wrong day. Shift forward by 12h so any "almost midnight"
              // value rounds up cleanly, then take local components.
              const d = new Date(v.getTime() + 12 * 3600 * 1000);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            }
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
// Tuned for NSL's master file size (≈300k transactions, ≈2k items).
// 2000 rows/batch keeps each request under Supabase's 1MB body limit, and
// 4 concurrent workers ≈ saturates a single TCP connection without
// hammering PostgREST.
const BATCH_SIZE  = 2000;
const CONCURRENCY = 4;

/**
 * Run `worker` against each chunk in parallel, up to CONCURRENCY at a time.
 * Slices share a single index counter so the work is naturally load-balanced.
 */
async function runConcurrently<T>(
  chunks: T[],
  worker: (chunk: T, idx: number) => Promise<number>,
  onProgress: (done: number, total: number) => void,
  total: number,
) {
  let next = 0;
  let done = 0;
  const runOne = async () => {
    while (next < chunks.length) {
      const idx = next++;
      const batchSize = await worker(chunks[idx], idx);
      done += batchSize;
      onProgress(Math.min(done, total), total);
    }
  };
  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, runOne);
  await Promise.all(workers);
}

const sliceIntoChunks = <T>(data: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < data.length; i += size) out.push(data.slice(i, i + size));
  return out;
};

const batchUpsert = async (table: string, data: any[], conflictKey: string, onProgress: (done: number, total: number) => void) => {
  const chunks = sliceIntoChunks(data, BATCH_SIZE);
  await runConcurrently(chunks, async (batch) => {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictKey });
    if (error) throw new Error(`[${table}] ${error.message}`);
    return batch.length;
  }, onProgress, data.length);
};

const batchInsert = async (table: string, data: any[], onProgress: (done: number, total: number) => void) => {
  const chunks = sliceIntoChunks(data, BATCH_SIZE);
  await runConcurrently(chunks, async (batch) => {
    const { error } = await supabase.from(table).insert(batch);
    if (error && error.code !== '23505') throw new Error(`[${table}] ${error.message}`);
    return batch.length;
  }, onProgress, data.length);
};

/**
 * Backfill transaction_types master with any unknown codes seen in the
 * transactions data so the FK insert doesn't fail. Real SAP exports can
 * contain codes outside our seed list (13, 14, 19, 202, ...); rather than
 * failing the whole import we register them as placeholders and let the
 * admin rename them later in Settings.
 */
async function ensureTransactionTypes(
  transactions: any[],
  onProgress: (step: string, detail: string, percent: number) => void,
  pct: number,
) {
  const codes = Array.from(new Set(transactions.map(t => Number(t.trans_type)).filter(n => Number.isFinite(n))));
  if (codes.length === 0) return;

  const { data: existing, error: selErr } = await supabase
    .from('transaction_types')
    .select('trans_type')
    .in('trans_type', codes);
  if (selErr) throw new Error(`[transaction_types lookup] ${selErr.message}`);

  const known = new Set((existing ?? []).map((r: any) => Number(r.trans_type)));
  const missing = codes.filter(c => !known.has(c));
  if (missing.length === 0) return;

  console.warn(`[transactions] backfilling ${missing.length} unknown trans_types:`, missing);
  onProgress('กำลังเพิ่ม trans_type ที่ขาด...', missing.join(', '), pct);

  const rows = missing.map(c => ({
    trans_type:  c,
    trans_name:  `Unknown SAP type ${c}`,
    direction:   'Cost' as const,  // safe default — admin can change in Settings
  }));
  const { error: insErr } = await supabase
    .from('transaction_types')
    .upsert(rows, { onConflict: 'trans_type' });
  if (insErr) throw new Error(`[transaction_types backfill] ${insErr.message}`);
}

/**
 * Backfill warehouses master with any unknown codes referenced from
 * transactions or lots. NSL's history mentions branch warehouses
 * (BT-*, P8-*) that aren't always in the Warehouses sheet. Same idea
 * as ensureTransactionTypes — register placeholders so the import
 * doesn't crash; admin can rename in Settings.
 */
async function ensureWarehouses(
  codes: string[],
  onProgress: (step: string, detail: string, percent: number) => void,
  pct: number,
) {
  const unique = Array.from(new Set(codes.map(c => String(c).trim()).filter(Boolean)));
  if (unique.length === 0) return;

  const { data: existing, error: selErr } = await supabase
    .from('warehouses')
    .select('code')
    .in('code', unique);
  if (selErr) throw new Error(`[warehouses lookup] ${selErr.message}`);

  const known = new Set((existing ?? []).map((r: any) => String(r.code)));
  const missing = unique.filter(c => !known.has(c));
  if (missing.length === 0) return;

  console.warn(`[warehouses] backfilling ${missing.length} unknown codes:`, missing);
  onProgress('กำลังเพิ่ม warehouse ที่ขาด...', missing.join(', '), pct);

  // Guess a sensible whs_type from the suffix in the code (e.g. -RM01 → Raw Materials).
  const guessType = (code: string): string => {
    const suffix = code.toUpperCase();
    if (suffix.includes('-RM')) return 'Raw Materials';
    if (suffix.includes('-FG')) return 'Finished Goods';
    if (suffix.includes('-PD')) return 'Production';
    if (suffix.includes('-PK')) return 'Packaging';
    if (suffix.includes('-QC')) return 'Quality Control';
    if (suffix.includes('-CL')) return 'Claim Hold';
    if (suffix.includes('-CO')) return 'Claim Hold';
    if (suffix.includes('-WS')) return 'Waste';
    return 'General';
  };

  const rows = missing.map((code, idx) => ({
    code,
    whs_name:   `Unknown warehouse ${code}`,
    whs_type:   guessType(code),
    is_active:  true,
    sort_order: 1000 + idx,
  }));
  const { error: insErr } = await supabase
    .from('warehouses')
    .upsert(rows, { onConflict: 'code' });
  if (insErr) throw new Error(`[warehouses backfill] ${insErr.message}`);
}

/**
 * Backfill items master with any unknown item_codes referenced from
 * transactions or lots. Items get minimal placeholder names (group_code
 * is required — defaults to 0 'Unknown' which the admin can fix later).
 */
async function ensureItems(
  codes: string[],
  onProgress: (step: string, detail: string, percent: number) => void,
  pct: number,
) {
  const unique = Array.from(new Set(codes.map(c => String(c).trim()).filter(Boolean)));
  if (unique.length === 0) return;

  // Items table can be large — query in chunks to avoid URL length limits.
  const known = new Set<string>();
  const QUERY_CHUNK = 500;
  for (let i = 0; i < unique.length; i += QUERY_CHUNK) {
    const slice = unique.slice(i, i + QUERY_CHUNK);
    const { data, error } = await supabase.from('items').select('item_code').in('item_code', slice);
    if (error) throw new Error(`[items lookup] ${error.message}`);
    (data ?? []).forEach((r: any) => known.add(String(r.item_code)));
  }

  const missing = unique.filter(c => !known.has(c));
  if (missing.length === 0) return;

  console.warn(`[items] backfilling ${missing.length} unknown item_codes`);
  onProgress('กำลังเพิ่ม items ที่ขาด...', `${missing.length} codes`, pct);

  // Ensure an "Unknown" item_group exists so placeholders have a valid FK target.
  await supabase.from('item_groups')
    .upsert({ group_code: 0, group_name: 'FUNK-Unknown', description: 'Placeholder for items added at import time' }, { onConflict: 'group_code' });

  const rows = missing.map(code => ({
    item_code:   code,
    itemname:    `Unknown ${code}`,
    uom:         'KG',
    std_cost:    0,
    moving_avg:  0,
    group_code:  0,
    is_active:   true,
  }));
  // Insert in batches to stay under request limits
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('items').upsert(batch, { onConflict: 'item_code' });
    if (error) throw new Error(`[items backfill] ${error.message}`);
  }
}

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
        if (table === 'inventory_transactions') {
          // Special-cased: file can contain duplicates and concurrent batches can race,
          // so we always upsert by the existing unique constraint instead of insert+swallow.
          if (txnMode === 'replace') {
            onProgress('กำลังล้างตาราง Transactions...', 'Clearing old movements', pct);
            // Single round-trip delete — Postgres handles 100k+ rows in one call
            // much faster than paginating 5000 at a time over the network.
            const { error: errClear } = await supabase.from('inventory_transactions').delete().gt('id', 0);
            if (errClear) throw errClear;
          }

          // Self-heal: SAP exports can carry trans_type / warehouse / item_code
          // values that aren't in the master tables. Each unknown value would
          // trigger an FK violation and (since batches are atomic) roll back
          // 2000 rows. Backfill placeholders for all three so the import lands
          // and the admin can clean up names later in Settings.
          await ensureTransactionTypes(data.inventory_transactions, onProgress, pct);
          await ensureWarehouses(
            data.inventory_transactions.map((t: any) => t.warehouse),
            onProgress, pct,
          );
          await ensureItems(
            data.inventory_transactions.map((t: any) => t.item_code),
            onProgress, pct,
          );

          await batchUpsert(table, data[key], 'trans_num,item_code,doc_line_num', (d, t) => {
            onProgress(`กำลังอัปเดต ${label}...`, `${formatNumber(d)} / ${formatNumber(t)} rows`, pct + (d / t) * progressSegment);
          });
        } else {
          await batchInsert(table, data[key], (d, t) => {
            onProgress(`กำลังอัปเดต ${label}...`, `${formatNumber(d)} / ${formatNumber(t)} rows`, pct + (d / t) * progressSegment);
          });
        }
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
      // Self-heal FK references the same way transactions does — lots can
      // also point at warehouses / items the master doesn't list.
      await ensureWarehouses(
        data.inventory_lots.map((l: any) => l.warehouse),
        onProgress, pct,
      );
      await ensureItems(
        data.inventory_lots.map((l: any) => l.item_code),
        onProgress, pct,
      );

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
