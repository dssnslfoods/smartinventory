import { useState } from 'react';
import {
  Upload, AlertTriangle, Package, ArrowLeftRight,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Download, Archive, Layers,
  X, Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/auditLog';
import { useImportLogs } from '@/hooks/useSupabaseQuery';
import { formatNumber } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseComprehensiveExcel,
  executeComprehensiveImport,
  generateComprehensiveTemplate
} from '@/services/importService';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpLegend } from '@/components/HelpButton';
import { PasswordConfirmModal } from '@/components/PasswordConfirmModal';
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

const SHEET_CONFIG: { key: SheetConfigKey; label: string; sub: string; icon: any; cols: string[]; headers: string[]; requiredCols: string[] }[] = [
  { key: 'warehouses', label: 'Warehouses', sub: 'คลังสินค้า', icon: <Archive size={20}/>, cols: ['code', 'whs_name', 'whs_type'], headers: ['Code', 'Name', 'Type'], requiredCols: ['code', 'whs_name'] },
  { key: 'item_groups', label: 'Item Groups', sub: 'กลุ่มสินค้า', icon: <Package size={20}/>, cols: ['group_code', 'group_name'], headers: ['Code', 'Name'], requiredCols: ['group_code', 'group_name'] },
  { key: 'items', label: 'Items', sub: 'สินค้า', icon: <Package size={20}/>, cols: ['item_code', 'itemname', 'uom', 'fs_category'], headers: ['Code', 'Name', 'UOM', 'FS Category'], requiredCols: ['item_code', 'itemname'] },
  { key: 'stock_thresholds', label: 'Thresholds', sub: 'จุดสั่งซื้อ', icon: <AlertTriangle size={20}/>, cols: ['item_code', 'warehouse', 'min_level'], headers: ['Item', 'Whs', 'Min'], requiredCols: ['item_code', 'warehouse'] },
  { key: 'inventory_transactions', label: 'Transactions', sub: 'เคลื่อนไหว', icon: <ArrowLeftRight size={20}/>, cols: ['item_code', 'doc_date', 'direction', 'warehouse'], headers: ['Item', 'Date', 'Type', 'Whs'], requiredCols: ['item_code', 'doc_date', 'warehouse'] },
  { key: 'inventory_lots', label: 'Lot Inventory', sub: 'สต็อกต่อ lot', icon: <Layers size={20}/>, cols: ['item_code', 'warehouse', 'batch_num', 'qty', 'expire_date'], headers: ['Item', 'Whs', 'Batch', 'Qty', 'Expire'], requiredCols: ['item_code', 'warehouse'] },
];

/** A row is "incomplete" if any required column is empty/null/blank. */
const isRowIncomplete = (requiredCols: string[], row: any): boolean =>
  requiredCols.some(col => {
    const v = row?.[col];
    return v === undefined || v === null || String(v).trim() === '';
  });

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

  /** Row indices (within parsedData[key]) the user has chosen to exclude from
   *  the import. Lets them drop junk rows (e.g. items with no name) before
   *  committing. */
  const [excluded, setExcluded] = useState<Record<SheetConfigKey, Set<number>>>(() =>
    SHEET_CONFIG.reduce((acc, c) => ({ ...acc, [c.key]: new Set<number>() }), {} as any)
  );
  const toggleRowExclude = (key: SheetConfigKey, idx: number) => setExcluded(prev => {
    const next = new Set(prev[key]); next.has(idx) ? next.delete(idx) : next.add(idx);
    return { ...prev, [key]: next };
  });
  const excludeAllIncomplete = (key: SheetConfigKey) => {
    const c = SHEET_CONFIG.find(x => x.key === key)!;
    const rows = importState?.parsedData?.[key] ?? [];
    setExcluded(prev => {
      const next = new Set(prev[key]);
      rows.forEach((r: any, i: number) => { if (isRowIncomplete(c.requiredCols, r)) next.add(i); });
      return { ...prev, [key]: next };
    });
  };
  const clearExclusions = (key: SheetConfigKey) =>
    setExcluded(prev => ({ ...prev, [key]: new Set<number>() }));

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

    // Drop user-excluded rows from each sheet before sending to the importer.
    const cleanedData: any = { ...importState.parsedData };
    for (const c of SHEET_CONFIG) {
      const ex = excluded[c.key];
      if (ex && ex.size > 0 && Array.isArray(cleanedData[c.key])) {
        cleanedData[c.key] = cleanedData[c.key].filter((_: any, i: number) => !ex.has(i));
      }
    }

    const result = await executeComprehensiveImport(
      cleanedData,
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

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const performResetAll = async () => {
    setImporting(true);

    // Snapshot deletion scope BEFORE we wipe, so the audit log can record it
    const [{ count: lotsCount }, { count: txCount }, { count: itemsCount },
           { count: groupsCount }, { count: whsCount }] = await Promise.all([
      supabase.from('inventory_lots').select('*', { count: 'exact', head: true }),
      supabase.from('inventory_transactions').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('item_groups').select('*', { count: 'exact', head: true }),
      supabase.from('warehouses').select('*', { count: 'exact', head: true }),
    ]);

    try {
      await supabase.rpc('clear_all_data');
      await supabase.from('inventory_lots').delete().neq('id', 0);
      await supabase.from('inventory_transactions').delete().neq('id', 0);
      await supabase.from('stock_thresholds').delete().neq('id', 0);
      await supabase.from('items').delete().neq('item_code', '');
      await supabase.from('item_groups').delete().neq('group_code', 0);
      await supabase.from('warehouses').delete().neq('code', '');

      // Record audit success
      await recordAudit({
        action:   'CLEAR_ALL_DATA_FROM_IMPORT',
        resource: 'inventory_lots + transactions + thresholds + items + item_groups + warehouses',
        payload:  {
          deleted_counts: {
            lots:         lotsCount   ?? 0,
            transactions: txCount     ?? 0,
            items:        itemsCount  ?? 0,
            item_groups:  groupsCount ?? 0,
            warehouses:   whsCount    ?? 0,
          },
          source_page: 'Import → Dangerous Zone',
        },
        status: 'success',
      });

      queryClient.clear();
      await queryClient.refetchQueries();
      setFile(null); setImportState(null); refetchLogs();
    } catch(err) {
      // Record failure too — we want to know who attempted and why it failed
      await recordAudit({
        action:   'CLEAR_ALL_DATA_FROM_IMPORT',
        resource: 'inventory_lots + transactions + thresholds + items + item_groups + warehouses',
        status:   'failed',
        error_message: err instanceof Error ? err.message : String(err),
        payload:  { source_page: 'Import → Dangerous Zone' },
      });
      alert('Error clearing data: ' + err);
    } finally {
      setImporting(false);
    }
  };

  const hasAnySelection = Object.values(includeSheets).some(Boolean);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Data Import"
        subtitle="นำเข้า Master Data + Transactions จาก Excel ตามลำดับความสัมพันธ์"
        helpTitle="Data Import (นำเข้าข้อมูล)"
        helpBody={(<>
          <HelpSection title="ทำงานยังไง">
            อัปโหลด Excel เดียวที่มี 6 sheets — ระบบจะนำเข้าทีละตารางตามลำดับ FK (Warehouses → Item Groups → Items → Thresholds → Transactions → Lot Inventory)
          </HelpSection>
          <HelpSection title="🧾 Lot Inventory (ใหม่)">
            Sheet สำหรับ "สต็อกต่อ lot" — แต่ละ lot มี expire date และต้นทุนของตัวเอง ทำให้ VV Matrix แม่นยำขึ้นและเปิดทาง FEFO pick list. โหมด import: ระบบจะลบข้อมูล lot ของ <strong>snapshot_date เดียวกัน</strong> ก่อน insert ใหม่ (snapshot-style replace)
          </HelpSection>
          <HelpSection title="ขั้นตอน 4 Step">
            <ol className="list-decimal ml-5 text-xs space-y-1">
              <li>กดปุ่ม "โหลด All-in-One Template" → ได้ไฟล์ Excel ที่จัดดีไซน์มาแล้ว</li>
              <li>กรอกข้อมูลในแต่ละ Sheet ตามตัวอย่าง — ใช้ dropdown ที่ระบบเตรียมให้</li>
              <li>กลับมาหน้านี้ ลากไฟล์มาวาง — ระบบจะ preview จำนวนแถวแต่ละ Sheet</li>
              <li>เลือก toggle Sheet ที่ต้องการ → กด "เริ่ม Import"</li>
            </ol>
          </HelpSection>
          <HelpSection title="โหมด Transactions">
            <HelpLegend items={[
              { color: '#E65100', label: 'Replace All', meaning: 'ลบ Transactions เดิมทั้งหมดก่อน Import (ใช้ตอนเริ่มต้นใหม่)' },
              { color: '#2E75B6', label: 'Append Only', meaning: 'เพิ่มเฉพาะรายการใหม่ (ใช้ในการดำเนินงานปกติ)' },
            ]} />
          </HelpSection>
          <HelpSection title="Shelf Life อัตโนมัติ">
            ลำดับการคำนวณ Expire Date เมื่อไม่ระบุใน Excel:
            <ol className="list-decimal ml-5 text-xs space-y-1 mt-1">
              <li>ใช้ Expire Date จาก Excel ถ้ามี</li>
              <li>ใช้ Shelf Life ของ Item Group</li>
              <li>ใช้ Global Fallback ที่ Settings (default 365 วัน)</li>
            </ol>
          </HelpSection>
          <HelpSection title="⚠️ Danger Zone">
            ปุ่ม "Clear All Data" จะลบข้อมูลทั้งหมด — ใช้สำหรับเริ่มโครงการใหม่เท่านั้น
          </HelpSection>
        </>)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card flex flex-col gap-4 border-2 border-primary-light/50">
            <div>
              <span className="text-xs font-bold uppercase text-primary-light">Step 1</span>
              <h3 className="font-semibold text-sm">เตรียมข้อมูลจาก Template</h3>
            </div>
            <p className="text-xs text-muted-foreground">แบบฟอร์ม Master Data Template จะมี 5 หน้า (Warehouses, Item Groups, Items, Thresholds, Transactions)</p>
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

                         {(() => {
                           const allRows: any[] = importState?.parsedData?.[c.key] ?? [];
                           const exSet = excluded[c.key] ?? new Set<number>();
                           // index incompleteness once
                           const incompleteIdx = allRows.reduce<number[]>((acc, r, i) => {
                             if (isRowIncomplete(c.requiredCols, r)) acc.push(i);
                             return acc;
                           }, []);
                           const incompleteCount = incompleteIdx.length;
                           const effectiveCount = allRows.length - exSet.size;
                           // Build the preview list: incomplete rows first, then a few valid ones (cap 25)
                           const validIdx = allRows.map((_, i) => i).filter(i => !incompleteIdx.includes(i));
                           const previewIdx = [...incompleteIdx, ...validIdx].slice(0, 25);
                           return (
                             <div className="mt-3">
                               {/* Incomplete-rows banner */}
                               {incompleteCount > 0 && (
                                 <div className="mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-xs"
                                      style={{ backgroundColor: 'rgba(234,88,12,0.08)', color: '#9a3412' }}>
                                   <AlertTriangle size={13} className="flex-shrink-0" />
                                   <span>พบ <strong>{incompleteCount}</strong> แถวไม่สมบูรณ์ (เว้นว่างคอลัมน์: {c.requiredCols.join(', ')})</span>
                                   <button
                                     onClick={() => excludeAllIncomplete(c.key)}
                                     className="ml-auto px-2 py-0.5 rounded border text-[11px] font-medium hover:bg-white/40"
                                     style={{ borderColor: '#ea580c', color: '#9a3412' }}
                                   >
                                     ตัดออกทั้งหมด
                                   </button>
                                 </div>
                               )}

                               <button onClick={() => togglePreview(c.key)} className="flex items-center justify-between w-full p-2 bg-background border rounded-lg text-xs font-medium hover:bg-muted">
                                 <span>
                                   Preview · {formatNumber(effectiveCount)} / {formatNumber(allRows.length)} rows
                                   {exSet.size > 0 && <span style={{ color: '#dc2626' }}> · ตัดออก {formatNumber(exSet.size)}</span>}
                                 </span>
                                 {previewOpen[c.key] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                               </button>

                               {previewOpen[c.key] && (
                                 <div className="mt-2 text-xs overflow-x-auto border rounded bg-background">
                                   <table className="w-full text-left whitespace-nowrap">
                                     <thead className="bg-muted">
                                       <tr>
                                         <th className="px-2 py-1.5 w-8"></th>
                                         {c.headers.map(h => <th key={h} className="px-2 py-1.5">{h}</th>)}
                                       </tr>
                                     </thead>
                                     <tbody>
                                       {previewIdx.map((rowIdx) => {
                                         const row = allRows[rowIdx];
                                         const isExcluded = exSet.has(rowIdx);
                                         const isIncomplete = incompleteIdx.includes(rowIdx);
                                         return (
                                           <tr key={rowIdx} className="border-t"
                                               style={{
                                                 backgroundColor: isExcluded ? 'rgba(148,163,184,0.12)'
                                                                : isIncomplete ? 'rgba(234,88,12,0.06)' : undefined,
                                                 opacity: isExcluded ? 0.5 : 1,
                                                 textDecoration: isExcluded ? 'line-through' : undefined,
                                               }}>
                                             <td className="px-2 py-1.5">
                                               <button
                                                 onClick={() => toggleRowExclude(c.key, rowIdx)}
                                                 title={isExcluded ? 'นำกลับเข้า import' : 'ตัดแถวนี้ออกจาก import'}
                                                 className="p-0.5 rounded hover:bg-muted"
                                                 style={{ color: isExcluded ? '#16a34a' : '#dc2626' }}
                                               >
                                                 {isExcluded ? <Plus size={13}/> : <X size={13}/>}
                                               </button>
                                             </td>
                                             {c.cols.map(col => <td key={col} className="px-2 py-1.5">{String(row[col] ?? '')}</td>)}
                                           </tr>
                                         );
                                       })}
                                     </tbody>
                                   </table>
                                   {allRows.length > previewIdx.length && (
                                     <p className="px-2 py-1.5 text-[10px] border-t" style={{ color: 'var(--text-muted)' }}>
                                       แสดง {previewIdx.length} จาก {formatNumber(allRows.length)} แถว (แถวไม่สมบูรณ์ขึ้นก่อน) ·
                                       {exSet.size > 0 && (
                                         <button onClick={() => clearExclusions(c.key)} className="ml-1 underline" style={{ color: 'var(--color-primary)' }}>
                                           ยกเลิกการตัดออกทั้งหมด
                                         </button>
                                       )}
                                     </p>
                                   )}
                                 </div>
                               )}
                             </div>
                           );
                         })()}
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
                 <button onClick={() => setShowClearConfirm(true)} className="btn bg-white border-red-300 text-red-600 hover:bg-red-100">Clear All Data</button>
               </div>
            </div>
          )}
        </div>
      </div>

      {showClearConfirm && (
        <PasswordConfirmModal
          title="ล้างฐานข้อมูลทั้งหมด"
          message="การล้างข้อมูลนี้จะลบทุกอย่างและไม่สามารถย้อนคืนได้"
          consequences={[
            'Inventory Lots — สต็อกต่อ lot ทั้งหมด',
            'Transactions — การเคลื่อนไหวทุกรายการ',
            'Stock Thresholds — Min/ROP/Max',
            'Items — รายการสินค้าทั้งหมด',
            'Item Groups — กลุ่มสินค้า',
            'Warehouses — รหัสคลังสินค้า',
          ]}
          typeToConfirm="CLEAR ALL"
          confirmLabel="ลบทั้งหมดถาวร"
          onConfirm={performResetAll}
          onClose={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
