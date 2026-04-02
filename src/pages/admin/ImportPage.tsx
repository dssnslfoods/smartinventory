import { useState, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, PlusCircle, Info, Package, ArrowLeftRight,
  ChevronDown, ChevronUp, Trash2, ToggleLeft, ToggleRight, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useImportLogs } from '@/hooks/useSupabaseQuery';
import { formatDateTime, formatNumber } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedItem {
  item_code: string;
  itemname: string;
  uom: string;
  std_cost: number;
  moving_avg: number;
  group_code: number;
  is_active: boolean;
}

interface ParsedTransaction {
  trans_num: number;
  doc_date: string;
  trans_type: number;
  warehouse: string;
  doc_line_num: number;
  item_code: string;
  in_qty: number;
  out_qty: number;
  amount: number;
  direction: string;
}

interface ParsedData {
  items: ParsedItem[];
  transactions: ParsedTransaction[];
  hasItemSheet: boolean;
  hasTxnSheet: boolean;
  txDateMin: string;
  txDateMax: string;
}

type TxnImportMode = 'replace' | 'append';

interface ProgressState {
  step: string;
  detail: string;
  percent: number;
  error: string;
  done: boolean;
}

interface ImportResult {
  itemsUpserted: number;
  txnInserted: number;
  txnSkipped: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function batchInsertTxns(
  rows: ParsedTransaction[],
  batchSize: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('inventory_transactions').insert(batch);
    if (error) {
      if (error.code === '23505' || error.code === '23503') skipped += batch.length;
      else throw new Error(`[transactions] ${error.message} (code ${error.code})`);
    } else {
      inserted += batch.length;
    }
    onProgress(Math.min(i + batchSize, rows.length), rows.length);
  }
  return { inserted, skipped };
}

async function batchUpsertItems(
  rows: ParsedItem[],
  batchSize: number,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('items').upsert(batch, { onConflict: 'item_code' });
    if (error) throw new Error(`[items] ${error.message}`);
    onProgress(Math.min(i + batchSize, rows.length), rows.length);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ImportPage() {
  const { data: importLogs, refetch: refetchLogs } = useImportLogs();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Import config (what user wants to import)
  const [includeItems, setIncludeItems] = useState(true);
  const [includeTxns, setIncludeTxns] = useState(true);
  const [txnMode, setTxnMode] = useState<TxnImportMode>('replace');

  // ── UI state
  const [showItemPreview, setShowItemPreview] = useState(false);
  const [showTxnPreview, setShowTxnPreview] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    step: '', detail: '', percent: 0, error: '', done: false,
  });
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  // ── Parse Excel ──────────────────────────────────────────────────────────
  const parseExcel = useCallback((f: File) => {
    setProgress({ step: 'กำลัง parse ไฟล์...', detail: '', percent: 5, error: '', done: false });
    setLastResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });

        const getVal = (row: Record<string, unknown>, key: string): unknown => {
          if (key in row) return row[key];
          for (const k of Object.keys(row)) {
            if (k.trim() === key) return row[k];
          }
          return undefined;
        };

        // ── Items (dbo_OITM or Items) ─────────────────────────────────────────────────
        const oitmSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'items' || n === 'dbo_OITM') ?? wb.SheetNames[0];
        const oitmSheet = wb.Sheets[oitmSheetName];
        const hasItemSheet = !!oitmSheet;

        let items: ParsedItem[] = [];
        if (hasItemSheet) {
          let oitmRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oitmSheet);
          if (oitmRaw.length > 0 && !('ItemCode' in oitmRaw[0]) && !('Item Code' in oitmRaw[0])) {
            oitmRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oitmSheet, { range: 1 });
          }
          items = oitmRaw
            .map((row) => ({
              item_code:    String((getVal(row, 'Item Code') || getVal(row, 'ItemCode')) ?? '').trim(),
              itemname:     String((getVal(row, 'Item Name') || getVal(row, 'ItemName')) ?? '').trim(),
              uom:          String((getVal(row, 'UOM') || getVal(row, 'InvntryUom')) ?? 'KG'),
              std_cost:     Number((getVal(row, 'Std Cost') || getVal(row, 'STD COST')) ?? 0),
              moving_avg:   Number((getVal(row, 'Moving Avg') || getVal(row, 'Moving Average')) ?? 0),
              group_code:   Number((getVal(row, 'Group Code') || getVal(row, 'ItmsGrpCod')) ?? 0),
              is_active:    String((getVal(row, 'Status') || getVal(row, 'frozenFor')) ?? '') !== 'Y',
            }))
            .filter((i) => i.item_code);
        }

        // ── Transactions (dbo_OIMN or Transactions) ─────────────────────────────────────────
        const oimnSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'transactions' || n === 'dbo_OIMN') ?? wb.SheetNames[1];
        const oimnSheet = wb.Sheets[oimnSheetName];
        const hasTxnSheet = !!oimnSheet && oitmSheetName !== oimnSheetName;

        let transactions: ParsedTransaction[] = [];
        let txDateMin = '';
        let txDateMax = '';

        if (hasTxnSheet) {
          const oimnRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(oimnSheet);
          transactions = oimnRaw
            .map((row) => {
              let docDate = getVal(row, 'Date') || row['DocDate'];
              if (docDate instanceof Date) {
                docDate = docDate.toISOString().split('T')[0];
              } else {
                docDate = String(docDate ?? '').split('T')[0].split(' ')[0];
              }
              const inQty = Number((getVal(row, 'In Qty') || row['InQuantity']) ?? 0);
              const outQty = Number((getVal(row, 'Out Qty') || row['OutQuantity']) ?? 0);
              return {
                trans_num:    Number((getVal(row, 'Transaction No') || row['TransNum']) ?? 0),
                doc_date:     String(docDate),
                trans_type:   Number((getVal(row, 'Tx Type') || row['TransType']) ?? 0),
                warehouse:    String((getVal(row, 'Warehouse') || row['Warehouse']) ?? '').trim(),
                doc_line_num: getVal(row, 'Line Num') != null ? Number(getVal(row, 'Line Num')) : (row['DocLineNum'] != null ? Number(row['DocLineNum']) : -1),
                item_code:    String((getVal(row, 'Item Code') || row['ItemCode']) ?? '').trim(),
                in_qty:       inQty,
                out_qty:      outQty,
                amount:       Number((getVal(row, 'Total Amount') || row['Amount']) ?? 0),
                direction:    String((getVal(row, 'Direction') || row['Transection']) ?? (inQty > 0 ? 'In' : 'Out')).trim(),
              };
            })
            .filter((t) => t.item_code && t.trans_num);

          if (transactions.length > 0) {
            const dates = transactions.map(t => t.doc_date).filter(Boolean).sort();
            txDateMin = dates[0] ?? '';
            txDateMax = dates[dates.length - 1] ?? '';
          }
        }

        setParsedData({ items, transactions, hasItemSheet, hasTxnSheet, txDateMin, txDateMax });
        // Auto-toggle based on what's found
        setIncludeItems(hasItemSheet && items.length > 0);
        setIncludeTxns(hasTxnSheet && transactions.length > 0);
        setProgress({ step: '', detail: '', percent: 0, error: '', done: false });

      } catch (err) {
        setProgress({ step: 'Parse Error', detail: '', percent: 0, error: String(err), done: false });
      }
    };
    reader.readAsBinaryString(f);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsedData(null);
    setShowItemPreview(false);
    setShowTxnPreview(false);
    parseExcel(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    setParsedData(null);
    parseExcel(f);
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Instructions Sheet
    const instructions = [
      ['ระบบนำเข้าข้อมูล Smart Inventory (Template)'],
      [''],
      ['คำแนะนำการใช้งาน:'],
      ['1. ข้อมูลประกอบด้วย 2 Sheet หลักคือ "Items" (ข้อมูลสินค้า) และ "Transactions" (ข้อมูลการเคลื่อนไหว)'],
      ['2. ระบบจะทำการอัปเดต Items ก่อน จากนั้นจึงนำเข้า Transactions เพื่อป้องกันข้อผิดพลาด'],
      ['3. ห้ามเปลี่ยนชื่อ Sheet และชื่อ Column ที่กำหนดไว้ในหัวตารางแถวที่ 1'],
      [''],
      ['📌 คำอธิบาย Sheet "Items"'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Item Code', 'รหัสสินค้า', 'RM-10001, FG-0500', 'ใช่'],
      ['Item Name', 'ชื่อสินค้า', 'แป้งสาลีอเนกประสงค์, แซนวิชแฮมชีส', 'ใช่'],
      ['Group Code', 'รหัสกลุ่มสินค้า', '125 (Raw), 123 (Finish Goods)', 'ใช่'],
      ['UOM', 'หน่วยนับ', 'KG, PCS', 'ใช่'],
      ['Std Cost', 'ต้นทุนมาตรฐาน', '150.50', 'ไม่'],
      ['Moving Avg', 'ต้นทุนเฉลี่ย', '151.00', 'ไม่'],
      ['Status', 'สถานะการใช้งาน', 'A (Active) หรือ I (Inactive)', 'ไม่ (ค่าเริ่มต้น: A)'],
      [''],
      ['📌 คำอธิบาย Sheet "Transactions"'],
      ['Column', 'ความหมาย', 'ตัวอย่าง / ค่าที่ยอมรับ', 'บังคับ?'],
      ['Date', 'วันที่ทำรายการ', '2026-04-01', 'ใช่'],
      ['Transaction No', 'เลขที่เอกสาร', '100001', 'ใช่'],
      ['Line Num', 'บรรทัดในเอกสาร', '0, 1, 2', 'ใช่'],
      ['Tx Type', 'รหัสประเภทรายการ', '20 (รับเข้า), 60 (จ่ายออก), 67 (โอนย้าย)', 'ใช่'],
      ['Warehouse', 'คลังสินค้า', 'FS-RM01, FS-FG01', 'ใช่'],
      ['Item Code', 'รหัสสินค้า', 'RM-10001', 'ใช่'],
      ['In Qty', 'ยอดรับเข้า', '50.00', 'ไม่'],
      ['Out Qty', 'ยอดจ่ายออก', '10.50', 'ไม่'],
      ['Total Amount', 'มูลค่ารวม (บาท)', '2500.00', 'ไม่'],
      ['Direction', 'ทิศทางการเคลื่อนไหว', 'In, Out, Transfers', 'ไม่ (คำนวณอัตโนมัติ)'],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{wch: 15}, {wch: 25}, {wch: 35}, {wch: 15}];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
    
    // Items Sheet
    const itemsData = [
      {
        'Item Code': 'RM-10001',
        'Item Name': 'แป้งสาลีอเนกประสงค์ (Wheat Flour)',
        'Group Code': 125,
        'UOM': 'KG',
        'Std Cost': 15.50,
        'Moving Avg': 16.00,
        'Status': 'A',
      },
      {
        'Item Code': 'RM-10002',
        'Item Name': 'น้ำตาลทรายขาว (White Sugar)',
        'Group Code': 125,
        'UOM': 'KG',
        'Std Cost': 25.00,
        'Moving Avg': 24.50,
        'Status': 'A',
      },
      {
        'Item Code': 'FG-05001',
        'Item Name': 'แซนวิชแฮมชีส (Ham Cheese Sandwich)',
        'Group Code': 123,
        'UOM': 'PCS',
        'Std Cost': 22.00,
        'Moving Avg': 22.50,
        'Status': 'A',
      }
    ];
    const wsItems = XLSX.utils.json_to_sheet(itemsData);
    XLSX.utils.book_append_sheet(wb, wsItems, 'Items');
    
    // Transactions Sheet
    const txData = [
      {
        'Date': '2026-04-01',
        'Transaction No': 2000101,
        'Line Num': 0,
        'Tx Type': 20,
        'Warehouse': 'FS-RM01',
        'Item Code': 'RM-10001',
        'In Qty': 1000,
        'Out Qty': 0,
        'Total Amount': 16000,
        'Direction': 'In'
      },
      {
        'Date': '2026-04-01',
        'Transaction No': 2000101,
        'Line Num': 1,
        'Tx Type': 20,
        'Warehouse': 'FS-RM01',
        'Item Code': 'RM-10002',
        'In Qty': 500,
        'Out Qty': 0,
        'Total Amount': 12250,
        'Direction': 'In'
      },
      {
        'Date': '2026-04-02',
        'Transaction No': 6000205,
        'Line Num': 0,
        'Tx Type': 60,
        'Warehouse': 'FS-RM01',
        'Item Code': 'RM-10001',
        'In Qty': 0,
        'Out Qty': 50,
        'Total Amount': -800,
        'Direction': 'Out'
      }
    ];
    const wsTx = XLSX.utils.json_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');
    
    XLSX.writeFile(wb, 'SmartInventory_Template.xlsx');
  };

  // ── Main Import ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsedData || !file) return;
    if (!includeItems && !includeTxns) return;

    setImporting(true);
    setLastResult(null);
    let itemsUpserted = 0;
    let txnInserted = 0;
    let txnSkipped = 0;

    const tick = (step: string, detail: string, percent: number) =>
      setProgress({ step, detail, percent, error: '', done: false });

    try {
      let pct = 5;

      // ── A. Upsert Items ─────────────────────────────────────────────────
      if (includeItems && parsedData.items.length > 0) {
        tick('กำลัง import Master Data...', `0 / ${formatNumber(parsedData.items.length)} items`, pct);
        await batchUpsertItems(parsedData.items, 300, (done, total) => {
          tick('กำลัง import Master Data...', `${formatNumber(done)} / ${formatNumber(total)} items`, pct + (done / total) * 30);
        });
        itemsUpserted = parsedData.items.length;
        pct += 33;
        tick('Master Data ✓', `${formatNumber(itemsUpserted)} items upserted`, pct);
      }

      // ── B. Transactions ─────────────────────────────────────────────────
      if (includeTxns && parsedData.transactions.length > 0) {

        // B1. Clear if replace mode
        if (txnMode === 'replace') {
          tick('กำลังลบ Transactions เดิม...', 'Clearing inventory_transactions', pct + 2);
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('inventory_transactions')
              .delete()
              .gt('id', 0)
              .select('id')
              .limit(5000);
            if (error) throw new Error(`Clear error: ${error.message}`);
            hasMore = (data?.length ?? 0) === 5000;
          }
          pct += 8;
        }

        // B2. Filter FK-safe transactions
        const validItemCodes = new Set(parsedData.items.map(i => i.item_code));
        const { data: existingItems } = await supabase.from('items').select('item_code').limit(20000);
        if (existingItems) existingItems.forEach(i => validItemCodes.add(i.item_code));

        const validTxns = parsedData.transactions.filter(t => validItemCodes.has(t.item_code));
        const skippedFK = parsedData.transactions.length - validTxns.length;

        // B3. Insert
        tick('กำลัง import Transactions...', `0 / ${formatNumber(validTxns.length)}`, pct);
        const { inserted, skipped } = await batchInsertTxns(
          validTxns, 1000,
          (done, total) => tick('กำลัง import Transactions...', `${formatNumber(done)} / ${formatNumber(total)}`, pct + (done / total) * 50),
        );
        txnInserted = inserted;
        txnSkipped = skipped + skippedFK;
        pct += 55;
      }

      // ── C. Update last_sync_at ──────────────────────────────────────────
      await supabase.from('system_config').upsert(
        { key: 'last_sync_at', value: new Date().toISOString() },
        { onConflict: 'key' },
      );

      // ── D. Log ─────────────────────────────────────────────────────────
      const hasSkips = txnSkipped > 0;
      await supabase.from('import_logs').insert({
        file_name: file.name,
        items_count: itemsUpserted,
        transactions_count: txnInserted,
        status: hasSkips ? 'partial' : 'success',
        error_summary: hasSkips ? `${txnSkipped} rows skipped (duplicate/missing item)` : null,
      });

      setLastResult({ itemsUpserted, txnInserted, txnSkipped });
      setProgress({ step: '✅ Import สำเร็จ!', detail: '', percent: 100, error: '', done: true });
      queryClient.invalidateQueries();
      refetchLogs();

    } catch (err) {
      const msg = String(err);
      setProgress({ step: '❌ Import ล้มเหลว', detail: '', percent: 0, error: msg, done: false });
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

  // ── Reset All ────────────────────────────────────────────────────────────
  const handleResetAll = async () => {
    if (!window.confirm('⚠️ คำเตือน: จะลบ Items, Transactions และ Thresholds ทั้งหมด\n\nไม่สามารถย้อนคืนได้ ยืนยันหรือไม่?')) return;
    if (!window.confirm('ยืนยันครั้งที่ 2 — ลบข้อมูลทั้งหมดจริงๆ?')) return;

    setImporting(true);
    setProgress({ step: 'กำลังล้างข้อมูลทั้งหมด...', detail: '', percent: 10, error: '', done: false });
    try {
      const { error: rpcErr } = await supabase.rpc('clear_all_data');
      if (rpcErr) {
        await supabase.from('inventory_transactions').delete().neq('id', 0);
        await supabase.from('stock_thresholds').delete().neq('id', 0);
        await supabase.from('items').delete().neq('item_code', '');
        await supabase.from('system_config').upsert({ key: 'last_sync_at', value: '' });
      }
      const { count: txLeft }    = await supabase.from('inventory_transactions').select('*', { count: 'exact', head: true });
      const { count: itemsLeft } = await supabase.from('items').select('*', { count: 'exact', head: true });

      setProgress({ step: '✅ ล้างข้อมูลสำเร็จ', detail: `Tx: ${txLeft ?? 0} | Items: ${itemsLeft ?? 0}`, percent: 100, error: '', done: true });
      queryClient.clear();
      await queryClient.refetchQueries();
      setFile(null); setParsedData(null);
      refetchLogs();
    } catch (err) {
      setProgress({ step: '❌ ล้างข้อมูลล้มเหลว', detail: '', percent: 0, error: String(err), done: false });
    } finally {
      setImporting(false);
    }
  };

  const nothingSelected = !includeItems && !includeTxns;
  const canImport = !!parsedData && !importing && !nothingSelected && (
    (includeItems && parsedData.items.length > 0) ||
    (includeTxns && parsedData.transactions.length > 0)
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ══ Page Header ══════════════════════════════════════════════════════ */}
      {/* ══ Page Header ══════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>ระบบนำเข้าข้อมูล (Data Import)</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          นำเข้าข้อมูล Master Data และพฤติกรรมการเคลื่อนไหวอย่างปลอดภัยตามลำดับขั้นตอน
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left Column: Step 1 & 2 ── */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Step 1 */}
          <div className="card flex flex-col gap-4" style={{ border: '2px solid var(--color-primary-light)' }}>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--color-primary-light)' }}>Step 1</span>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>เตรียมข้อมูลจาก Template</h3>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ดาวน์โหลดฟอร์มมาตรฐาน ซึ่งมีตัวอย่างข้อมูลสมจริงและ "คำแนะนำ" ใน Sheet แรก
            </p>
            <button onClick={handleDownloadTemplate} className="btn btn-primary w-full py-2.5 shadow-sm">
              <Download size={16} className="mr-2" /> โหลด Template 
            </button>
          </div>

          {/* Step 2 */}
          <div className="card flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Step 2</span>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>อัปโหลดไฟล์ Excel</h3>
            </div>
            
            <label
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors flex-1"
              style={{
                borderColor: file ? 'var(--color-primary-light)' : 'var(--border)',
                backgroundColor: file ? '#EFF6FF' : 'var(--bg-alt)',
              }}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={importing} className="hidden" />
              <Upload size={32} style={{ color: file ? 'var(--color-primary-light)' : 'var(--text-muted)' }} />
              <p className="mt-2 font-medium text-sm text-center" style={{ color: 'var(--text)' }}>
                {file ? file.name : 'คลิกหรือลากไฟล์มาวาง'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'รองรับไฟล์ .xlsx'}
              </p>
            </label>

            {parsedData ? (
              <div className="space-y-2 mt-1">
                <SheetBadge label="Items" sublabel="สินค้า" found={parsedData.hasItemSheet} count={parsedData.items.length} unit="items" />
                <SheetBadge label="Transactions" sublabel="เคลื่อนไหว" found={parsedData.hasTxnSheet} count={parsedData.transactions.length} unit="rows" />
              </div>
            ) : (
              <div className="space-y-2 mt-1">
                <SheetBadge label="Items" sublabel="รอข้อมูล..." found={false} count={0} unit="items" waiting />
                <SheetBadge label="Transactions" sublabel="รอข้อมูล..." found={false} count={0} unit="rows" waiting />
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Step 3 (Review) ── */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <ImportPanel
              step="3.1"
              icon={<Package size={20} />}
              title="ตรวจสอบข้อมูล Items"
              subtitle="ระบบจะบันทึก Master Data ก่อนเสมอ"
              waiting={!parsedData}
              available={!!parsedData && parsedData.hasItemSheet && parsedData.items.length > 0}
              count={parsedData?.items.length ?? 0}
              countLabel="items"
              enabled={includeItems}
              onToggle={() => setIncludeItems(v => !v)}
              unavailableReason={
                !parsedData ? undefined
                  : !parsedData.hasItemSheet ? 'ไม่พบ sheet ชื่อ Items ในไฟล์'
                  : 'พบ Sheet แต่ไม่มีข้อมูล'
              }
              modeNode={
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <CheckCircle size={13} className="text-green-600" />
                  <span className="text-green-800"><strong>Upsert:</strong> อัปเดตข้อมูลที่มีอยู่แล้ว หรือสร้างใหม่ (ไม่ลบข้อมูลเก่า)</span>
                </div>
              }
              previewExpanded={showItemPreview}
              onTogglePreview={() => setShowItemPreview(v => !v)}
              previewNode={
                parsedData && parsedData.items.length > 0 ? (
                  <PreviewTable
                    columns={['item_code', 'itemname', 'group_code', 'uom', 'std_cost', 'moving_avg']}
                    labels={['Code', 'ชื่อสินค้า', 'Group', 'UOM', 'Std Cost', 'Moving Avg']}
                    rows={parsedData.items.slice(0, 5) as unknown as Record<string, unknown>[]}
                  />
                ) : null
              }
            />

            <ImportPanel
              step="3.2"
              icon={<ArrowLeftRight size={20} />}
              title="ตั้งค่า Transactions"
              subtitle="นำเข้าหลังจาก Items เรียบร้อยแล้ว"
              waiting={!parsedData}
              available={!!parsedData && parsedData.hasTxnSheet && parsedData.transactions.length > 0}
              count={parsedData?.transactions.length ?? 0}
              countLabel="rows"
              enabled={includeTxns}
              onToggle={() => setIncludeTxns(v => !v)}
              unavailableReason={
                !parsedData ? undefined
                  : !parsedData.hasTxnSheet ? 'ไม่พบ sheet Transactions ในไฟล์'
                  : 'พบ Sheet แต่ไม่มีข้อมูล'
              }
              infoNode={
                parsedData?.txDateMin && parsedData?.txDateMax ? (
                  <div className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                    📅 <strong style={{ color: 'var(--text)' }}>{parsedData.txDateMin}</strong> ถึง <strong style={{ color: 'var(--text)' }}>{parsedData.txDateMax}</strong>
                  </div>
                ) : null
              }
              modeNode={
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <ModeButton
                      icon={<RefreshCw size={13} />}
                      label="Replace All"
                      desc="ล้างข้อมูลเดิม แล้วทับใหม่"
                      active={txnMode === 'replace'}
                      onClick={() => setTxnMode('replace')}
                    />
                    <ModeButton
                      icon={<PlusCircle size={13} />}
                      label="Append Only"
                      desc="เพิ่มบรรทัดใหม่ ข้ามรายการซ้ำ"
                      active={txnMode === 'append'}
                      onClick={() => setTxnMode('append')}
                    />
                  </div>
                  {txnMode === 'replace' && includeTxns && parsedData && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
                      style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <AlertTriangle size={13} className="text-orange-500 mt-0.5 shrink-0" />
                      <span className="text-orange-800"><strong>Replace:</strong> จะลบประวัติการรับจ่าย ยอดคงเหลือเก่าย้อนหลังทั้งหมด แล้วเริ่มต้นใหม่ด้วยไฟล์นี้</span>
                    </div>
                  )}
                </div>
              }
              previewExpanded={showTxnPreview}
              onTogglePreview={() => setShowTxnPreview(v => !v)}
              previewNode={
                parsedData && parsedData.transactions.length > 0 ? (
                  <PreviewTable
                    columns={['item_code', 'doc_date', 'direction', 'warehouse', 'in_qty', 'out_qty', 'amount']}
                    labels={['Item', 'Date', 'Dir', 'WH', 'In', 'Out', 'Amount']}
                    rows={parsedData.transactions.slice(0, 5) as unknown as Record<string, unknown>[]}
                  />
                ) : null
              }
            />
          </div>
        </div>
      </div>

      {/* ══ Section 3: Action & Progress ════════════════════════════════════ */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>4. ยืนยันและ Import</h3>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 min-h-[32px]">
          {!parsedData && (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>รอไฟล์ Excel...</span>
          )}
          {parsedData && includeItems && parsedData.items.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
              <Package size={13} />
              {formatNumber(parsedData.items.length)} Items — Upsert
            </span>
          )}
          {parsedData && includeTxns && parsedData.transactions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: '#E0E7FF', color: '#3730A3' }}>
              <ArrowLeftRight size={13} />
              {formatNumber(parsedData.transactions.length)} Transactions — {txnMode === 'replace' ? 'Replace' : 'Append'}
            </span>
          )}
          {parsedData && nothingSelected && (
            <span className="text-sm flex items-center gap-1" style={{ color: 'var(--color-warning, #D97706)' }}>
              <Info size={14} /> เปิด Master Data หรือ Transactions อย่างน้อยหนึ่งอย่าง
            </span>
          )}
        </div>

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={!canImport}
          className="btn btn-primary w-full py-3 text-base gap-2"
          style={{ opacity: canImport ? 1 : 0.45 }}
        >
          <Upload size={18} />
          {importing
            ? 'กำลัง import...'
            : !parsedData
              ? 'กรุณาอัปโหลดไฟล์ก่อน'
              : nothingSelected
                ? 'เลือกข้อมูลที่ต้องการ import'
                : 'เริ่ม Import'}
        </button>

        {/* Progress */}
        {(importing || progress.step) && (
          <ProgressBar progress={progress} />
        )}

        {/* Success Result */}
        {lastResult && progress.done && !progress.error && (
          <div className="p-4 rounded-xl space-y-2"
            style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <p className="font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle size={17} /> Import สำเร็จ
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-green-700">
              {lastResult.itemsUpserted > 0 && (
                <span>📦 Items upserted: <strong>{formatNumber(lastResult.itemsUpserted)}</strong></span>
              )}
              {lastResult.txnInserted > 0 && (
                <span>📊 Transactions inserted: <strong>{formatNumber(lastResult.txnInserted)}</strong></span>
              )}
              {lastResult.txnSkipped > 0 && (
                <span style={{ color: '#D97706' }}>⚠ Skipped: <strong>{formatNumber(lastResult.txnSkipped)}</strong></span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══ Section 4: Dangerous Zone ════════════════════════════════════════ */}
      {!importing && (
        <div className="card">
          <h4 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} /> Dangerous Zone
          </h4>
          <div className="p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ border: '1px solid #FECACA', backgroundColor: '#FFF5F5' }}>
            <div>
              <p className="font-medium text-sm text-red-900">ล้างข้อมูลทั้งหมดในระบบ</p>
              <p className="text-xs text-red-700 mt-0.5">ลบ Items, Transactions และ Thresholds ทั้งหมด — ไม่สามารถย้อนคืนได้</p>
            </div>
            <button
              onClick={handleResetAll}
              className="btn shrink-0"
              style={{ border: '1px solid #FCA5A5', color: '#DC2626', backgroundColor: 'white' }}
            >
              <Trash2 size={15} /> Clear All Data
            </button>
          </div>
        </div>
      )}

      {/* ══ Section 5: Import History ════════════════════════════════════════ */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>
          Import History
        </h3>
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
                    {log.status === 'success' && <CheckCircle size={17} className="text-green-600" />}
                    {log.status === 'error'   && <XCircle size={17} className="text-red-600" />}
                    {log.status === 'partial' && <AlertTriangle size={17} className="text-orange-500" />}
                  </td>
                  <td className="font-medium" style={{ color: 'var(--text)' }}>{log.file_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatDateTime(log.imported_at)}</td>
                  <td className="text-right">{formatNumber(log.items_count)}</td>
                  <td className="text-right">{formatNumber(log.transactions_count)}</td>
                  <td className="text-sm" style={{ color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SheetBadge({ label, sublabel, found, count, unit, waiting }: {
  label: string; sublabel: string; found: boolean; count: number; unit: string; waiting?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
      style={{
        backgroundColor: waiting ? 'var(--bg-alt)' : found ? '#F0FDF4' : '#FEF2F2',
        border: `1px solid ${waiting ? 'var(--border)' : found ? '#BBF7D0' : '#FECACA'}`,
        color: waiting ? 'var(--text-muted)' : found ? '#166534' : '#991B1B',
      }}>
      {waiting
        ? <FileSpreadsheet size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
        : found
          ? <CheckCircle size={14} className="text-green-600 shrink-0" />
          : <XCircle size={14} className="text-red-500 shrink-0" />}
      <span>
        <strong>{label}</strong>
        <span className="ml-1 opacity-70">({sublabel})</span>
        {waiting ? '' : found ? `: ${formatNumber(count)} ${unit}` : ' — ไม่พบใน Excel'}
      </span>
    </div>
  );
}

interface ImportPanelProps {
  step: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  waiting?: boolean;
  available: boolean;
  count: number;
  countLabel: string;
  enabled: boolean;
  onToggle: () => void;
  unavailableReason?: string;
  infoNode?: React.ReactNode;
  modeNode?: React.ReactNode;
  previewExpanded: boolean;
  onTogglePreview: () => void;
  previewNode: React.ReactNode;
}

function ImportPanel({
  step, icon, title, subtitle, waiting, available, count, countLabel,
  enabled, onToggle, unavailableReason, infoNode, modeNode,
  previewExpanded, onTogglePreview, previewNode,
}: ImportPanelProps) {
  const isEnabled = available && enabled;

  return (
    <div
      className="card flex flex-col gap-4 transition-all"
      style={{
        borderWidth: 2,
        borderColor: isEnabled ? 'var(--color-primary-light)' : 'var(--border)',
      }}
    >
      {/* Step badge + header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span
            className="shrink-0 flex items-center justify-center rounded-full text-xs font-bold w-6 h-6 mt-0.5"
            style={{
              backgroundColor: isEnabled ? 'var(--color-primary-light)' : 'var(--border)',
              color: isEnabled ? 'white' : 'var(--text-muted)',
            }}
          >{step}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span style={{ color: isEnabled ? 'var(--color-primary-light)' : 'var(--text-muted)' }}>{icon}</span>
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{title}</p>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={onToggle}
          disabled={!available}
          className="shrink-0 transition-colors"
          title={isEnabled ? 'ปิด' : 'เปิด'}
          style={{ opacity: available ? 1 : 0.35 }}
        >
          {isEnabled
            ? <ToggleRight size={34} style={{ color: 'var(--color-primary-light)' }} />
            : <ToggleLeft size={34} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>

      {/* Waiting state */}
      {waiting && (
        <div className="flex-1 flex flex-col items-center justify-center py-6 rounded-xl"
          style={{ backgroundColor: 'var(--bg-alt)', border: '1px dashed var(--border)' }}>
          <Upload size={24} style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>อัปโหลดไฟล์ Excel เพื่อดูข้อมูล</p>
        </div>
      )}

      {/* Unavailable (file loaded but sheet not found) */}
      {!waiting && !available && unavailableReason && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
          <XCircle size={14} className="shrink-0" />
          {unavailableReason}
        </div>
      )}

      {/* Available: show count + controls */}
      {available && (
        <>
          {/* Count */}
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: isEnabled ? 'var(--text)' : 'var(--text-muted)' }}>
              {formatNumber(count)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{countLabel}</span>
          </div>

          {infoNode}
          {isEnabled && modeNode}

          {/* Preview */}
          {count > 0 && (
            <div>
              <button
                onClick={onTogglePreview}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                {previewExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {previewExpanded ? 'ซ่อน Preview' : 'ดู Preview (5 แถวแรก)'}
              </button>
              {previewExpanded && (
                <div className="mt-2 overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                  {previewNode}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModeButton({
  icon, label, desc, active, onClick,
}: { icon: React.ReactNode; label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors"
      style={{
        borderColor: active ? 'var(--color-primary-light)' : 'var(--border)',
        backgroundColor: active ? '#EFF6FF' : 'transparent',
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: active ? 'var(--color-primary-light)' : 'var(--text-muted)' }}>{icon}</span>
      <div>
        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
      </div>
    </button>
  );
}

function PreviewTable({ columns, labels, rows }: { columns: string[]; labels: string[]; rows: Record<string, unknown>[] }) {
  return (
    <table style={{ fontSize: 11, width: '100%' }}>
      <thead>
        <tr style={{ backgroundColor: 'var(--bg-alt)' }}>
          {labels.map(l => (
            <th key={l} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
            {columns.map(col => (
              <td key={col} style={{ padding: '4px 8px', color: 'var(--text)', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String(row[col] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProgressBar({ progress }: { progress: ProgressState }) {
  const barColor = progress.error
    ? '#EF4444'
    : progress.done
      ? '#22C55E'
      : 'var(--color-primary-light)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{progress.step}</span>
          {progress.detail && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{progress.detail}</span>
          )}
        </div>
        {!progress.error && (
          <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            {Math.round(progress.percent)}%
          </span>
        )}
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress.percent}%`, backgroundColor: barColor }}
        />
      </div>
      {progress.error && (
        <div className="p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">
          <strong>Error:</strong> {progress.error}
        </div>
      )}
    </div>
  );
}
