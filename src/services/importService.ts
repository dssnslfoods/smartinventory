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

        const extract = (sheetNames: string[], transform: (row: any) => any) => {
          const name = wb.SheetNames.find(n => sheetNames.some(sn => n.toLowerCase().includes(sn.toLowerCase())));
          if (!name) return [];
          const sheet = wb.Sheets[name];
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
          return raw.map(transform).filter(Boolean);
        };

        const warehouses = extract(['Warehouses', 'คลังสินค้า'], row => {
           const code = getVal(row, ['Warehouse Code', 'Code']);
           return code ? {
             code: String(code).trim(),
             whs_name: String(getVal(row, ['Warehouse Name', 'Name']) ?? code).trim(),
             whs_type: String(getVal(row, ['Type', 'Group']) ?? 'General').trim(),
             is_active: String(getVal(row, ['Status', 'Active']) ?? '') !== 'In',
             sort_order: Number(getVal(row, ['Sort Order', 'Order']) ?? 99)
           } : null;
        });

        const item_groups = extract(['Item Groups', 'กลุ่มสินค้า'], row => {
           const code = getVal(row, ['Group Code', 'Code']);
           return code ? {
             group_code: Number(code),
             group_name: String(getVal(row, ['Group Name', 'Name']) ?? code).trim(),
             description: getVal(row, ['Description', 'Desc']) ? String(getVal(row, ['Description', 'Desc'])) : null,
             shelf_life_days: getVal(row, ['Shelf Life Days', 'ShelfLifeDays', 'Shelf Life']) ? Number(getVal(row, ['Shelf Life Days', 'ShelfLifeDays', 'Shelf Life'])) : null
           } : null;
        });

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

        const items = extract(['Items', 'สินค้า', 'dbo_OITM'], row => {
           const code = getVal(row, ['Item Code', 'ItemCode']);
           return code ? {
             item_code: String(code).trim(),
             itemname: String(getVal(row, ['Item Name', 'ItemName']) ?? '').trim(),
             uom: String(getVal(row, ['UOM', 'InvntryUom']) ?? 'KG'),
             std_cost: Number(getVal(row, ['Std Cost', 'STD COST']) ?? 0),
             moving_avg: Number(getVal(row, ['Moving Avg', 'Moving Average']) ?? 0),
             group_code: Number(getVal(row, ['Group Code', 'ItmsGrpCod']) ?? 0),
             is_active: String(getVal(row, ['Status', 'frozenFor']) ?? '') !== 'Y' && String(getVal(row, ['Status']) ?? '') !== 'In',
             expire_date: parseExcelDate(getVal(row, ['Expire Date', 'ExpireDate', 'Expiry Date', 'ExpiryDate', 'Expiration Date']))
           } : null;
        });

        const stock_thresholds = extract(['Thresholds', 'จุดสั่งซื้อ', 'Min Max'], row => {
           const item_code = getVal(row, ['Item Code']);
           const warehouse = getVal(row, ['Warehouse Code', 'Warehouse']);
           return (item_code && warehouse) ? {
             item_code: String(item_code).trim(),
             warehouse: String(warehouse).trim(),
             min_level: Number(getVal(row, ['Min Level', 'Min']) ?? 0),
             reorder_point: Number(getVal(row, ['Reorder Point', 'ROP']) ?? 0),
             max_level: getVal(row, ['Max Level', 'Max']) ? Number(getVal(row, ['Max Level', 'Max'])) : null
           } : null;
        });

        const inventory_transactions = extract(['Transactions', 'Movement', 'dbo_OIMN'], row => {
           const transNum = getVal(row, ['Transaction No', 'TransNum']);
           const itemCode = getVal(row, ['Item Code', 'ItemCode']);
           return (transNum && itemCode) ? {
              trans_num: Number(transNum),
              doc_date: (() => {
                let d = getVal(row, ['Date', 'DocDate']);
                if (d instanceof Date) return d.toISOString().split('T')[0];
                return String(d ?? '').split('T')[0].split(' ')[0];
              })(),
              trans_type: Number(getVal(row, ['Tx Type', 'TransType']) ?? 0),
              warehouse: String(getVal(row, ['Warehouse Code', 'Warehouse']) ?? '').trim(),
              doc_line_num: Number(getVal(row, ['Line Num', 'DocLineNum']) ?? -1),
              item_code: String(itemCode).trim(),
              in_qty: Number(getVal(row, ['In Qty', 'InQuantity']) ?? 0),
              out_qty: Number(getVal(row, ['Out Qty', 'OutQuantity']) ?? 0),
              amount: Number(getVal(row, ['Total Amount', 'Amount']) ?? 0),
              direction: String(getVal(row, ['Direction', 'Transection']) ?? '').trim() || (Number(getVal(row, ['In Qty', 'InQuantity'])) > 0 ? 'In' : 'Out')
           } : null;
        });

        // ── Inventory Lots ──
        // Match sheets named "Lot", "Lots", or "lot_คงเหลือ" (case-insensitive substring)
        const inventory_lots = extract(['Lot Inventory', 'Lots', 'lot_คงเหลือ', 'lot คงเหลือ', 'Lot'], row => {
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
        });

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
