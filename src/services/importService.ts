import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/utils/format';

export type SheetConfigKey = 'warehouses' | 'item_groups' | 'suppliers' | 'items' | 'stock_thresholds' | 'purchase_orders' | 'purchase_order_lines' | 'inventory_transactions';

export interface ParsedData {
  warehouses: any[];
  item_groups: any[];
  suppliers: any[];
  items: any[];
  stock_thresholds: any[];
  purchase_orders: any[];
  purchase_order_lines: any[];
  inventory_transactions: any[];
}

export interface ImportState {
  parsedData: ParsedData | null;
  sheetFound: Record<SheetConfigKey, boolean>;
  txDateMin: string;
  txDateMax: string;
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
             is_active: String(getVal(row, ['Status', 'Active']) ?? '') !== 'In', // Default true
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

        const suppliers = extract(['Suppliers', 'ผู้จัดจำหน่าย'], row => {
           const code = getVal(row, ['Supplier Code', 'Code']);
           return code ? {
             supplier_code: String(code).trim(),
             supplier_name: String(getVal(row, ['Supplier Name', 'Name']) ?? code).trim(),
             default_lead_days: Number(getVal(row, ['Lead Days', 'Lead Time']) ?? 0),
             contact_name: String(getVal(row, ['Contact Name', 'Contact']) ?? ''),
             is_active: true
           } : null;
        });

        const parseExcelDate = (val: unknown): string | null => {
          if (!val) return null;
          if (val instanceof Date) return val.toISOString().split('T')[0];
          const s = String(val).trim();
          if (!s || s === 'null' || s === 'undefined') return null;
          // Handle Excel serial numbers (e.g. 46000)
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

        const purchase_orders = extract(['Purchase Orders', 'PO'], row => {
           const poInfoItem = getVal(row, ['PO Number', 'PO Num']);
           return poInfoItem ? {
             po_number: String(poInfoItem).trim(),
             supplier_code: String(getVal(row, ['Supplier Code']) ?? '').trim(),
             order_date: (() => {
               let d = getVal(row, ['Order Date', 'Date']);
               if (d instanceof Date) return d.toISOString().split('T')[0];
               return String(d ?? '').split('T')[0].split(' ')[0] || new Date().toISOString().split('T')[0];
             })(),
             expected_arrival: (() => {
               let d = getVal(row, ['Expected Arrival', 'Expected Date']);
               if (d instanceof Date) return d.toISOString().split('T')[0];
               return d ? String(d).split('T')[0].split(' ')[0] : null;
             })(),
             status: String(getVal(row, ['Status']) ?? 'confirmed').trim()
           } : null;
        });

        const purchase_order_lines = extract(['PO Lines', 'PO Details'], row => {
           const poNum = getVal(row, ['PO Number', 'PO Num']);
           const itemCode = getVal(row, ['Item Code']);
           return (poNum && itemCode) ? {
             po_number: String(poNum).trim(),
             item_code: String(itemCode).trim(),
             warehouse: String(getVal(row, ['Warehouse Code', 'Warehouse']) ?? '').trim(),
             ordered_qty: Number(getVal(row, ['Ordered Qty', 'Qty']) ?? 0),
             received_qty: Number(getVal(row, ['Received Qty']) ?? 0),
             unit_price: Number(getVal(row, ['Unit Price', 'Price']) ?? 0),
             status: String(getVal(row, ['Status']) ?? 'pending').trim()
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

        let txDateMin = '';
        let txDateMax = '';
        if (inventory_transactions.length > 0) {
          const dates = inventory_transactions.map((t: any) => t.doc_date).filter(Boolean).sort();
          txDateMin = dates[0] ?? '';
          txDateMax = dates[dates.length - 1] ?? '';
        }

        const parsedData = { warehouses, item_groups, suppliers, items, stock_thresholds, purchase_orders, purchase_order_lines, inventory_transactions };
        const sheetFound = {
          warehouses: warehouses.length > 0,
          item_groups: item_groups.length > 0,
          suppliers: suppliers.length > 0,
          items: items.length > 0,
          stock_thresholds: stock_thresholds.length > 0,
          purchase_orders: purchase_orders.length > 0,
          purchase_order_lines: purchase_order_lines.length > 0,
          inventory_transactions: inventory_transactions.length > 0
        };

        resolve({ parsedData, sheetFound, txDateMin, txDateMax });
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
    if (error && error.code !== '23505') throw new Error(`[${table}] ${error.message}`); // Ignore duplicates for append
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
        // Special logic for transactions replacement
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
    await executeTable('suppliers', 'suppliers', 'supplier_code', 'Suppliers (ผู้จัดจำหน่าย)');
    await executeTable('items', 'items', 'item_code', 'Items (สินค้า)');
    await executeTable('stock_thresholds', 'stock_thresholds', 'item_code,warehouse', 'Stock Thresholds (จุดสั่งซื้อ)');
    await executeTable('purchase_orders', 'purchase_orders', 'po_number', 'Purchase Orders (ใบสั่งซื้อ)');
    await executeTable('purchase_order_lines', 'purchase_order_lines', 'po_number,item_code', 'PO Lines (รายละเอียดใบสั่งซื้อ)');
    await executeTable('inventory_transactions', 'inventory_transactions', null, 'Transactions (การเคลื่อนไหว)');

    // Sync system Config
    await supabase.from('system_config').upsert({ key: 'last_sync_at', value: new Date().toISOString() }, { onConflict: 'key' });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
};

// ── 3. Template Generator ────────────────────────────────────────────────────
export const generateComprehensiveTemplate = () => {
    const wb = XLSX.utils.book_new();

    // 1. Instructions
    const instructions = [
      ['ระบบนำเข้าข้อมูล Smart Inventory (Comprehensive Master Data Template)'],
      [''],
      ['คำแนะนำการใช้งาน:'],
      ['1. ข้อมูลประกอบด้วย 8 Sheet ที่ครอบคลุมทุกระบบ คุณไม่จำเป็นต้องกรอกครบทุก Sheet ก็ได้'],
      ['2. ระบบจะบังคับนำเข้าตามลำดับความสัมพันธ์ (Relational Order) เสมอ (เช่น ใส่ชื่อ Warehouse ให้ตรงกับที่มีก่อนค่อยใช้ใน Transactions)'],
      ['3. ห้ามเปลี่ยนชื่อ Sheet และชื่อ Column ที่เป็นหัวตารางในบรรทัดแรกสุดของแต่ละ Sheet'],
      [''],
      ['📌 คำอธิบาย Sheet "Warehouses" (คลังสินค้า)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Code', 'รหัสคลังสินค้า', 'FS-RM01, W-01', 'ใช่'],
      ['Name', 'ชื่อคลังสินค้า', 'คลังวัตถุดิบ 1', 'ใช่'],
      ['Type', 'ประเภทคลัง', 'Raw Materials, Finish Goods', 'ไม่ (ค่าเริ่มต้น: General)'],
      ['Active', 'สถานะการทำงาน', 'A (Active) หรือ In (Inactive)', 'ไม่ (ค่าเริ่มต้น: A)'],
      ['Order', 'ลำดับการเรียง', '1, 2, 3', 'ไม่'],
      [''],
      ['📌 คำอธิบาย Sheet "Item Groups" (กลุ่มสินค้า)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Code', 'รหัสกลุ่มสินค้า', '125, 123', 'ใช่'],
      ['Name', 'ชื่อกลุ่มสินค้า', 'FRM-Raw Materials', 'ใช่'],
      ['Desc', 'รายละเอียดจำเพาะ', 'คำอธิบายเพิ่มเติมของกลุ่มนี้', 'ไม่'],
      ['Shelf Life Days', 'อายุขัย (default ของกลุ่มนี้, ใช้คำนวณ Expire Date อัตโนมัติ)', '365 = 1 ปี, 548 = 1.5 ปี, 730 = 2 ปี', 'ไม่ (ค่าเริ่มต้น: 365 วัน)'],
      [''],
      ['📌 คำอธิบาย Sheet "Suppliers" (ผู้จัดจำหน่าย)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Code', 'รหัสผู้จัดจำหน่าย', 'SUP-001, VENDOR-99', 'ใช่'],
      ['Name', 'ชื่อบริษัท/บุคคล', 'Thai Flour Company', 'ใช่'],
      ['Lead Days', 'ระยะเวลาจัดส่งปกติ', '3 (แปลว่าใช้เวลา 3 วันส่งของ)', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Contact Name', 'ชื่อผู้ติดต่อ', 'คุณสมชาย', 'ไม่'],
      [''],
      ['📌 คำอธิบาย Sheet "Items" (ข้อมูลสินค้า)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['ItemCode', 'รหัสสินค้า', 'RM-10001, FG-05001', 'ใช่'],
      ['ItemName', 'ชื่อสินค้า', 'แป้งสาลีอเนกประสงค์', 'ใช่'],
      ['ItmsGrpCod', 'รหัสกลุ่มสินค้า', '125 (อ้างอิงจาก Sheet Item Groups)', 'ใช่'],
      ['InvntryUom', 'หน่วยนับ', 'KG, PCS', 'ไม่ (ค่าเริ่มต้น: KG)'],
      ['STD COST', 'ต้นทุนมาตรฐาน', '15.5', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Moving Average', 'ต้นทุนเฉลี่ย', '16.0', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Status', 'สถานะใช้งาน', 'A (Active) หรือ In (Inactive)', 'ไม่ (ค่าเริ่มต้น: A)'],
      ['Expire Date', 'วันหมดอายุของสินค้า (สำหรับ VV Matrix)', '2026-12-31', 'ไม่ (ถ้าว่างจะคำนวณจาก Shelf Life อัตโนมัติ)'],
      [''],
      ['📌 คำอธิบาย Sheet "Thresholds" (จุดสั่งซื้อแจ้งเตือน)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Item Code', 'รหัสสินค้า', 'RM-10001', 'ใช่'],
      ['Warehouse', 'คลังสินค้า', 'FS-RM01', 'ใช่'],
      ['Min', 'ระดับขั้นต่ำ (Safety Stock)', '100', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['ROP', 'จุดสั่งซื้อซ้ำ (Reorder Point)', '500', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Max', 'ระะดับสูงสุด', '2000', 'ไม่'],
      [''],
      ['📌 คำอธิบาย Sheet "Purchase Orders" (ใบสั่งซื้อหลัก)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['PO Number', 'หมายเลขใบสั่งซื้อ', 'PO26-001', 'ใช่'],
      ['Supplier Code', 'รหัส Supplier', 'SUP-001', 'ใช่'],
      ['Date', 'วันที่สั่งซื้อ', '2026-04-01', 'ไม่ (ค่าเริ่มต้นจะใช้วันที่อัปโหลด)'],
      ['Expected Date', 'วันที่คาดว่าของจะมา', '2026-04-04', 'ไม่'],
      ['Status', 'สถานะใบสั่งซื้อ', 'draft, confirmed, in_transit', 'ไม่ (ค่าเริ่มต้น: confirmed)'],
      [''],
      ['📌 คำอธิบาย Sheet "PO Lines" (รายละเอียดสั่งซื้อ)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['PO Number', 'ผูกกับใบสั่งซื้อใด', 'PO26-001 (อ้างอิงจาก Purchase Orders)', 'ใช่'],
      ['Item Code', 'รหัสสินค้า', 'RM-10001', 'ใช่'],
      ['Warehouse', 'ส่งเข้าคลังใด', 'FS-RM01', 'ไม่'],
      ['Qty', 'จำนวนที่สั่ง', '1000', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Received Qty', 'จำนวนที่รับเข้าแล้ว', '500', 'ไม่ (ค่าเริ่มต้น: 0)'],
      ['Price', 'ราคาหรือต้นทุนต่อหน่วย', '15.5', 'ไม่ (ค่าเริ่มต้น: 0)'],
      [''],
      ['📌 คำอธิบาย Sheet "Transactions" (การเคลื่อนไหวสินค้า)'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Date', 'วันที่ทำรายการ', '2026-04-01', 'ใช่'],
      ['TransNum', 'เลขที่เอกสาร', '2000101', 'ใช่'],
      ['TransType', 'รหัสประเภทรายการ', '20 (รับเข้า), 60 (จ่ายออก), 67 (โอน)', 'ไม่'],
      ['Warehouse', 'คลังสินค้าที่อ้างอิง', 'FS-RM01', 'ไม่'],
      ['Line Num', 'บรรทัดเอกสาร', '0, 1, 2', 'ไม่'],
      ['ItemCode', 'รหัสสินค้า', 'RM-10001', 'ใช่'],
      ['InQuantity', 'จำนวนรับเข้า', '500', 'ไม่'],
      ['OutQuantity', 'จำนวนจ่ายออก', '0', 'ไม่'],
      ['Amount', 'มูลค่ารวม (Total Cost)', '7750', 'ไม่'],
      ['Direction', 'ทิศทาง (บังคับยอดถ้าว่าง)', 'In, Out, Transfers', 'ไม่ (ถ้ารับเข้าเป็น In ทันที)'],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    
    // Set explicit width formatting parameter constraints for rendering perfectly in excel
    wsInstructions['!cols'] = [{wch: 18}, {wch: 30}, {wch: 45}, {wch: 25}];
    
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // 2. Warehouses
    const wsWhs = XLSX.utils.json_to_sheet([{
      'Warehouse Code': 'FS-RM01', 'Warehouse Name': 'คลังวัตถุดิบ 1', 'Type': 'Raw Materials', 'Active': 'A', 'Sort Order': 1
    }]);
    XLSX.utils.book_append_sheet(wb, wsWhs, 'Warehouses');

    // 3. Item Groups
    const wsGroups = XLSX.utils.json_to_sheet([
      { 'Group Code': 123, 'Group Name': 'FFG-Finish Goods',  'Shelf Life Days': 365 },
      { 'Group Code': 125, 'Group Name': 'FRM-Raw Materials', 'Shelf Life Days': 548 },
      { 'Group Code': 126, 'Group Name': 'FBY-By Product',    'Shelf Life Days': 730 },
      { 'Group Code': 127, 'Group Name': 'FPKG-Packaging',    'Shelf Life Days': 365 },
    ]);
    wsGroups['!cols'] = [{wch: 13}, {wch: 24}, {wch: 18}];
    XLSX.utils.book_append_sheet(wb, wsGroups, 'Item Groups');

    // 4. Suppliers
    const wsSuppliers = XLSX.utils.json_to_sheet([{
      'Supplier Code': 'SUP-001', 'Supplier Name': 'Thai Flour Company', 'Lead Days': 3, 'Contact Name': 'Somchai'
    }]);
    XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Suppliers');

    // 5. Items
    const wsItems = XLSX.utils.json_to_sheet([
      { 'Item Code': 'RM-10001', 'Item Name': 'แป้งสาลีอเนกประสงค์', 'Group Code': 125, 'UOM': 'KG', 'Std Cost': 15.5, 'Moving Avg': 16.0, 'Status': 'A', 'Expire Date': '2026-12-31' },
      { 'Item Code': 'RM-10002', 'Item Name': 'น้ำตาลทราย', 'Group Code': 125, 'UOM': 'KG', 'Std Cost': 22.0, 'Moving Avg': 23.5, 'Status': 'A', 'Expire Date': '2027-06-30' },
    ]);
    wsItems['!cols'] = [{wch: 14}, {wch: 28}, {wch: 13}, {wch: 8}, {wch: 12}, {wch: 14}, {wch: 10}, {wch: 14}];
    XLSX.utils.book_append_sheet(wb, wsItems, 'Items');

    // 6. PO & Lines (Combined for example logic, but separate sheets)
    const wsPO = XLSX.utils.json_to_sheet([{
      'PO Number': 'PO26-001', 'Supplier Code': 'SUP-001', 'Order Date': '2026-04-01', 'Expected Arrival': '2026-04-04', 'Status': 'confirmed'
    }]);
    XLSX.utils.book_append_sheet(wb, wsPO, 'Purchase Orders');

    const wsPOLine = XLSX.utils.json_to_sheet([{
      'PO Number': 'PO26-001', 'Item Code': 'RM-10001', 'Warehouse': 'FS-RM01', 'Ordered Qty': 1000, 'Received Qty': 0, 'Unit Price': 15.5
    }]);
    XLSX.utils.book_append_sheet(wb, wsPOLine, 'PO Lines');

    const wsTx = XLSX.utils.json_to_sheet([{
        'Date': '2026-04-01', 'Transaction No': 2000101, 'Line Num': 0, 'Tx Type': 20, 'Warehouse': 'FS-RM01', 'Item Code': 'RM-10001', 'In Qty': 500, 'Out Qty': 0, 'Total Amount': 7750, 'Direction': 'In'
    }]);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

    XLSX.writeFile(wb, 'SmartInventory_MasterSetup_Template.xlsx');
};
