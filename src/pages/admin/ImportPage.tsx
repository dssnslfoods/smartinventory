import { useState } from 'react';
import {
  Upload, AlertTriangle, Package, ArrowLeftRight,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Download, Truck, Archive, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useImportLogs } from '@/hooks/useSupabaseQuery';
import { formatNumber } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';
import { 
  parseComprehensiveExcel, 
  executeComprehensiveImport, 
  generateComprehensiveTemplate
} from '@/services/importService';
import type { 
  SheetConfigKey,
  ImportState
} from '@/services/importService';

interface ProgressState {
  step: string;
  detail: string;
  percent: number;
  error: string;
  done: boolean;
}

const SHEET_CONFIG: { key: SheetConfigKey; label: string; sub: string; icon: any; cols: string[]; headers: string[] }[] = [
  { key: 'warehouses', label: 'Warehouses', sub: 'คลังสินค้า', icon: <Archive size={20}/>, cols: ['code', 'whs_name', 'whs_type'], headers: ['Code', 'Name', 'Type'] },
  { key: 'item_groups', label: 'Item Groups', sub: 'กลุ่มสินค้า', icon: <Package size={20}/>, cols: ['group_code', 'group_name'], headers: ['Code', 'Name'] },
  { key: 'suppliers', label: 'Suppliers', sub: 'ผู้จัดจำหน่าย', icon: <Truck size={20}/>, cols: ['supplier_code', 'supplier_name'], headers: ['Code', 'Name'] },
  { key: 'items', label: 'Items', sub: 'สินค้า', icon: <Package size={20}/>, cols: ['item_code', 'itemname', 'uom', 'expire_date'], headers: ['Code', 'Name', 'UOM', 'Expire Date'] },
  { key: 'stock_thresholds', label: 'Thresholds', sub: 'จุดสั่งซื้อ', icon: <AlertTriangle size={20}/>, cols: ['item_code', 'warehouse', 'min_level'], headers: ['Item', 'Whs', 'Min'] },
  { key: 'purchase_orders', label: 'Purchase Orders', sub: 'ใบสั่งซื้อ', icon: <FileSpreadsheet size={20}/>, cols: ['po_number', 'supplier_code', 'order_date'], headers: ['PO', 'Supplier', 'Date'] },
  { key: 'purchase_order_lines', label: 'PO Lines', sub: 'รายละเอียดสั่งซื้อ', icon: <FileSpreadsheet size={20}/>, cols: ['po_number', 'item_code', 'ordered_qty'], headers: ['PO', 'Item', 'Qty'] },
  { key: 'inventory_transactions', label: 'Transactions', sub: 'เคลื่อนไหว', icon: <ArrowLeftRight size={20}/>, cols: ['item_code', 'doc_date', 'direction', 'warehouse'], headers: ['Item', 'Date', 'Type', 'Whs'] }
];

export function ImportPage() {
  const { refetch: refetchLogs } = useImportLogs();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [importing, setImporting] = useState(false);

  const [includeSheets, setIncludeSheets] = useState<Record<SheetConfigKey, boolean>>(
    SHEET_CONFIG.reduce((acc, c) => ({ ...acc, [c.key]: true }), {} as any)
  );
  
  const [txnMode, setTxnMode] = useState<'replace' | 'append'>('replace');
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

  const [progress, setProgress] = useState<ProgressState>({ step: '', detail: '', percent: 0, error: '', done: false });


  const setSheetInclude = (key: SheetConfigKey, val: boolean) => setIncludeSheets(p => ({ ...p, [key]: val }));
  const togglePreview = (key: string) => setPreviewOpen(p => ({ ...p, [key]: !p[key] }));

  // ── Handlers
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const processFile = async (f: File) => {
    setFile(f);
    setImportState(null);
    setProgress({ step: 'Reading Excel...', detail: '', percent: 0, error: '', done: false });
    try {
      const state = await parseComprehensiveExcel(f, (step, detail, pct) => setProgress({ step, detail, percent: pct, error: '', done: false }));
      setImportState(state);
      setIncludeSheets(state.sheetFound as Record<SheetConfigKey, boolean>);
      setProgress({ step: '', detail: '', percent: 0, error: '', done: false });
    } catch (err: any) {
      setProgress({ step: 'Parse Error', detail: '', percent: 0, error: err.message, done: false });
    }
  };

  const handleImport = async () => {
    if (!importState || !importState.parsedData) return;
    setImporting(true);
    setProgress({ step: 'Initializing Import...', detail: '', percent: 10, error: '', done: false });
    
    const result = await executeComprehensiveImport(
      importState.parsedData,
      includeSheets,
      txnMode,
      (step, detail, pct) => setProgress({ step, detail, percent: pct, error: '', done: false })
    );

    setImporting(false);
    
    if (result.success) {
      setProgress({ step: '✅ Import สำเร็จ', detail: 'Completed successfully', percent: 100, error: '', done: true });
      await supabase.from('import_logs').insert({ file_name: file?.name || 'unknown', status: 'success', items_count: importState.parsedData.items.length, transactions_count: importState.parsedData.inventory_transactions.length });
      queryClient.invalidateQueries();
      refetchLogs();
    } else {
      setProgress({ step: '❌ Import Failed', detail: '', percent: 0, error: result.error || 'Unknown error', done: false });
      await supabase.from('import_logs').insert({ file_name: file?.name || 'unknown', status: 'error', error_summary: result.error?.substring(0, 500) });
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('⚠️ คำเตือน: จะล้างข้อมูลทั้งหมดในระบบ ไม่สามารถย้อนคืนได้ ยืนยันหรือไม่?')) return;
    setImporting(true);
    try {
      await supabase.rpc('clear_all_data');
      await supabase.from('inventory_transactions').delete().neq('id', 0);
      await supabase.from('stock_thresholds').delete().neq('id', 0);
      await supabase.from('items').delete().neq('item_code', '');
      await supabase.from('purchase_order_lines').delete().neq('id', 0);
      await supabase.from('purchase_orders').delete().neq('po_number', '');
      await supabase.from('item_groups').delete().neq('group_code', 0);
      await supabase.from('suppliers').delete().neq('supplier_code', '');
      await supabase.from('warehouses').delete().neq('code', '');
      
      queryClient.clear();
      await queryClient.refetchQueries();
      setFile(null); setImportState(null); refetchLogs();
    } catch(err) {
      alert('Error clearing data: ' + err);
    } finally {
      setImporting(false);
    }
  };

  const hasAnySelection = Object.values(includeSheets).some(Boolean);

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>ระบบนำเข้าข้อมูล Master Data & Transactions</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>นำเข้าโครงสร้างและข้อมูลทั้งหมดของระบบจาก Excel เดียว ตามลำดับความสัมพันธ์ตารางอัตโนมัติ</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card flex flex-col gap-4 border-2 border-primary-light/50">
            <div>
              <span className="text-xs font-bold uppercase text-primary-light">Step 1</span>
              <h3 className="font-semibold text-sm">เตรียมข้อมูลจาก Template</h3>
            </div>
            <p className="text-xs text-muted-foreground">แบบฟอร์ม Comprehensive Template จะมีครบทั้ง 8 หน้า (Warehouses, Suppliers, POs, Items, ฯลฯ)</p>
            <button onClick={generateComprehensiveTemplate} className="btn btn-primary py-2.5 shadow-sm">
              <Download size={16} className="mr-2" /> โหลด All-in-One Template
            </button>
          </div>

          <div className="card flex flex-col gap-4">
            <div>
              <span className="text-xs font-bold uppercase text-muted-foreground">Step 2</span>
              <h3 className="font-semibold text-sm">อัปโหลดไฟล์ Excel</h3>
            </div>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-8 cursor-pointer hover:bg-blue-50/50 transition-colors"
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={importing} className="hidden" />
              <Upload size={32} className={file ? 'text-primary' : 'text-muted'} />
              <p className="mt-2 font-medium text-sm text-center">{file ? file.name : 'คลิกหรือลากไฟล์มาวาง'}</p>
            </label>

            {importState && (
               <div className="space-y-2 mt-2">
                 <h4 className="text-xs font-bold uppercase mb-1">ตรวจพบ Sheet</h4>
                 {SHEET_CONFIG.map(c => {
                    const count = importState.parsedData?.[c.key]?.length || 0;
                    if (!count) return null;
                    return (
                      <div key={c.key} className="flex items-center justify-between p-2 rounded bg-background border text-xs">
                        <div className="flex gap-2">
                           <span className="text-primary">{c.icon}</span>
                           <span className="font-medium">{c.label} ({c.sub})</span>
                        </div>
                        <span className="font-bold">{formatNumber(count)}</span>
                      </div>
                    );
                 })}
               </div>
            )}
          </div>
        </div>

        {/* Right Side */}
        <div className="lg:col-span-8 space-y-6">
          <div className="card">
            <h3 className="font-semibold text-sm mb-4">Step 3: ตรวจสอบและเลือกข้อมูลที่ต้องการนำเข้า</h3>
            
            {/* Iterative Import Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SHEET_CONFIG.map(c => {
                 const count = importState?.parsedData?.[c.key]?.length || 0;
                 const isAvail = count > 0;
                 const isEnabled = includeSheets[c.key];
                 return (
                   <div key={c.key} className={`border rounded-xl flex flex-col transition-all ${isAvail ? 'bg-card' : 'bg-muted/30 opacity-70'} overflow-hidden`}>
                     {/* Header */}
                     <button className="flex items-center gap-3 p-4 text-left focus:outline-none" onClick={() => isAvail && setSheetInclude(c.key, !isEnabled)}>
                       <div className={`p-2 rounded-lg ${isAvail && isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                         {c.icon}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm truncate">{c.label}</h4>
                            {isAvail ? (
                               <div className="flex items-center gap-1.5"><span className="text-xs font-bold">{formatNumber(count)}</span></div>
                            ) : (<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted border">No Data</span>)}
                         </div>
                         <p className="text-xs text-muted-foreground truncate">{c.sub}</p>
                       </div>
                       {isAvail && (isEnabled ? <ToggleRight size={24} className="text-primary" /> : <ToggleLeft size={24} className="text-muted-foreground" />)}
                     </button>
                     
                     {/* Details & Preview */}
                     {isAvail && isEnabled && (
                       <div className="px-4 pb-4 border-t bg-muted/10">
                         {(c.key === 'inventory_transactions') ? (
                           <div className="mt-3 space-y-2">
                             <p className="text-xs font-semibold text-muted-foreground">Import Mode:</p>
                             <div className="flex flex-wrap gap-2 mb-2">
                               <button onClick={() => setTxnMode('replace')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border ${txnMode === 'replace' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-background hover:bg-muted'}`}>Replace All</button>
                               <button onClick={() => setTxnMode('append')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border ${txnMode === 'append' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-background hover:bg-muted'}`}>Append Only</button>
                             </div>
                             {txnMode === 'replace' && <div className="text-xs p-2 bg-orange-50 text-orange-800 border border-orange-200 rounded">💡 จะล้าง Transactions เก่าทิ้งทั้งหมด</div>}
                           </div>
                         ) : (
                           <div className="mt-3 text-xs p-2 bg-green-50 text-green-800 border border-green-200 rounded">
                             💡 <strong>Upsert:</strong> อัปเดตข้อมูลที่มีอยู่แล้ว หรือสร้างขึั้นใหม่
                           </div>
                         )}

                         <div className="mt-3">
                           <button onClick={() => togglePreview(c.key)} className="flex items-center justify-between w-full p-2 bg-background border rounded-lg text-xs font-medium hover:bg-muted">
                             <span>Preview ({Math.min(5, count)} rows)</span>
                             {previewOpen[c.key] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                           </button>
                           {previewOpen[c.key] && (
                             <div className="mt-2 text-xs overflow-x-auto border rounded bg-background">
                               <table className="w-full text-left whitespace-nowrap">
                                 <thead className="bg-muted">
                                   <tr>{c.headers.map(h => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
                                 </thead>
                                 <tbody>
                                   {importState?.parsedData?.[c.key]?.slice(0, 5).map((row: any, i: number) => (
                                     <tr key={i} className="border-t">{c.cols.map(col => <td key={col} className="px-2 py-1.5">{String(row[col] ?? '')}</td>)}</tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                   </div>
                 );
              })}
            </div>
          </div>

          <div className="card space-y-4">
             <h3 className="font-semibold text-sm">Step 4: ยืนยันและ Import</h3>
             <button disabled={!importState || !hasAnySelection || importing} onClick={handleImport} className="btn btn-primary w-full py-3 text-base justify-center">
               <Upload size={18} className="mr-2" /> 
               {importing ? 'กำลัง Import เข้าสู่ระบบ...' : (!importState ? 'กรุณาอัปโหลดไฟล์ Excel' : (hasAnySelection ? 'เริ่ม Import (Execute in Relational Order)' : 'ยังไม่เลือกข้อมูล'))}
             </button>
             
             {(importing || progress.step) && (
               <div className="p-4 rounded-xl border bg-muted/20">
                 <div className="flex justify-between text-xs font-medium mb-2"><span>{progress.step}</span><span className="text-primary">{Math.round(progress.percent)}%</span></div>
                 <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-1"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress.percent}%` }} /></div>
                 {progress.error ? <p className="text-xs text-red-600 mt-2">{progress.error}</p> : <p className="text-xs text-muted-foreground mt-1">{progress.detail}</p>}
               </div>
             )}
          </div>
          
          {!importing && (
            <div className="card border-red-200">
               <h4 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2"><AlertTriangle size={15}/> Dangerous Zone</h4>
               <div className="p-4 flex items-center justify-between border border-red-200 bg-red-50 rounded-xl">
                 <div>
                   <p className="font-medium text-sm text-red-900">ล้างฐานข้อมูลระบบทั้งหมด (Clear All Database)</p>
                   <p className="text-xs text-red-700 mt-0.5">ลบรหัสและประวัติทั้งหมดเพื่อเริ่มโปรเจกต์ใหม่</p>
                 </div>
                 <button onClick={handleResetAll} className="btn bg-white border-red-300 text-red-600 hover:bg-red-100">Clear All Data</button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
