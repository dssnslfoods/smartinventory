/* Build an Excel report of unbalanced Inventory Transfers for the NSL ERP team.
 *
 * Root issue: SAP export records the transfer-OUT leg as in_qty (or omits it),
 * so per item transfer_in >> transfer_out. This inflates on-hand stock. This
 * report lists every item's transfer imbalance so the ERP team can fix the
 * export at source.
 *
 * Usage: node scripts/build_transfer_imbalance_report.cjs
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Read Supabase creds from .env
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const URL  = (env.match(/VITE_SUPABASE_URL=(.*)/)        || [])[1]?.trim();
const ANON = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)   || [])[1]?.trim();
if (!URL || !ANON) { console.error('Missing Supabase env'); process.exit(1); }

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function fetchAll(pathQuery) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}`, Prefer: 'count=exact' },
    });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

const NAVY = 'FF1F3864', RED = 'FFC62828', GREY = 'FFF2F2F2', HEAD = 'FFD9E2F3';
const money = (n) => Number(n || 0);

(async () => {
  console.log('Fetching transfer imbalance data…');
  const items = await fetchAll('v_transfer_imbalance?select=*&order=imbalance_value.desc');
  console.log(`  ${items.length} items`);

  // Example pairs — the F7000100056 transfer pairs (both legs as in_qty)
  const pairs = await fetchAll(
    'inventory_transactions?select=trans_num,doc_date,warehouse,in_qty,out_qty,amount,direction' +
    '&item_code=eq.F7000100056&direction=eq.Transfers&order=trans_num.asc&limit=20'
  );

  const totIn   = items.reduce((s, r) => s + money(r.transfer_in_qty), 0);
  const totOut  = items.reduce((s, r) => s + money(r.transfer_out_qty), 0);
  const totImbV = items.reduce((s, r) => s + money(r.imbalance_value), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SmartInventory · NSL Food Service';
  wb.created = new Date();

  // ── Sheet 1: Summary ───────────────────────────────────────────────────
  const s1 = wb.addWorksheet('สรุปปัญหา', { properties: { tabColor: { argb: RED } } });
  s1.columns = [{ width: 28 }, { width: 60 }];
  const title = s1.addRow(['รายงานตรวจสอบ Inventory Transfer ไม่สมดุล', '']);
  title.font = { bold: true, size: 16, color: { argb: NAVY } };
  s1.addRow(['', '']);
  s1.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH')]);
  s1.addRow(['', '']);
  const h = s1.addRow(['ปัญหาที่พบ', '']); h.font = { bold: true, size: 13, color: { argb: RED } };
  [
    ['อาการ', 'มูลค่าสต็อก / current_stock สูงกว่าความจริง'],
    ['สาเหตุ', 'SAP export บันทึกขา transfer-OUT เป็น in_qty (หรือไม่มีขา OUT) → transfer ไม่หักล้างกัน'],
    ['ผลกระทบ', `items ทุกตัวที่มี transfer (${items.length} รายการ) มี in > out`],
    ['transfer_in รวม', `${totIn.toLocaleString(undefined,{maximumFractionDigits:0})} units`],
    ['transfer_out รวม', `${totOut.toLocaleString(undefined,{maximumFractionDigits:0})} units`],
    ['ส่วนต่าง (phantom)', `${(totIn-totOut).toLocaleString(undefined,{maximumFractionDigits:0})} units`],
    ['มูลค่า phantom (โดยประมาณ)', `฿${totImbV.toLocaleString(undefined,{maximumFractionDigits:0})}`],
  ].forEach(([k, v]) => {
    const r = s1.addRow([k, v]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true };
  });
  s1.addRow(['', '']);
  const h2 = s1.addRow(['สิ่งที่ขอให้ทีม ERP ตรวจสอบ', '']); h2.font = { bold: true, size: 13, color: { argb: NAVY } };
  [
    '1. การโอนคลัง (Inventory Transfer) export ออกมายังไง — ทำไมขา OUT ไม่มี/อยู่ใน in_qty',
    '2. ควรมี 2 บรรทัดต่อ 1 การโอน: คลังต้นทาง = out_qty, คลังปลายทาง = in_qty (หักล้างกัน = 0)',
    '3. ดูตัวอย่างใน Sheet "ตัวอย่าง Pairs" — ทั้งคู่บันทึกเป็น in_qty (ผิด)',
    '4. รายการทั้งหมดที่ต้องแก้อยู่ใน Sheet "Imbalance by Item"',
  ].forEach(t => { const r = s1.addRow(['', t]); r.getCell(2).alignment = { wrapText: true }; });

  // ── Sheet 2: Imbalance by Item ─────────────────────────────────────────
  const s2 = wb.addWorksheet('Imbalance by Item');
  s2.columns = [
    { header: 'Item Code',     key: 'item_code',        width: 16 },
    { header: 'Item Name',     key: 'itemname',         width: 42 },
    { header: 'Group',         key: 'group_name',       width: 14 },
    { header: 'UOM',           key: 'uom',              width: 8  },
    { header: 'Transfer In',   key: 'transfer_in_qty',  width: 15 },
    { header: 'Transfer Out',  key: 'transfer_out_qty', width: 15 },
    { header: 'Imbalance Qty', key: 'imbalance_qty',    width: 15 },
    { header: 'Imbalance Value (฿)', key: 'imbalance_value', width: 18 },
    { header: 'Transfer Tx',   key: 'transfer_tx',      width: 12 },
    { header: '# Whs',         key: 'warehouses',       width: 8  },
    { header: 'First Transfer', key: 'first_transfer',  width: 14 },
    { header: 'Last Transfer',  key: 'last_transfer',   width: 14 },
  ];
  s2.getRow(1).font = { bold: true, color: { argb: NAVY } };
  s2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
  items.forEach((r, i) => {
    const row = s2.addRow(r);
    if (i % 2 === 1) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; });
    ['transfer_in_qty','transfer_out_qty','imbalance_qty','imbalance_value'].forEach(k => {
      row.getCell(k).numFmt = '#,##0.00';
    });
    row.getCell('imbalance_value').font = { bold: true, color: { argb: RED } };
  });
  s2.views = [{ state: 'frozen', ySplit: 1 }];
  s2.autoFilter = { from: 'A1', to: 'L1' };

  // ── Sheet 3: Example pairs ─────────────────────────────────────────────
  const s3 = wb.addWorksheet('ตัวอย่าง Pairs');
  s3.getColumn(1).width = 14; s3.getColumn(2).width = 14; s3.getColumn(3).width = 12;
  s3.getColumn(4).width = 12; s3.getColumn(5).width = 12; s3.getColumn(6).width = 14; s3.getColumn(7).width = 12;
  const t3 = s3.addRow(['ตัวอย่าง transfer pairs ของ F7000100056 — ทั้งคู่บันทึกเป็น in_qty (ควรมีขาเดียวเป็น out_qty)']);
  t3.font = { bold: true, color: { argb: RED } };
  s3.mergeCells('A1:G1');
  s3.addRow([]);
  const hr = s3.addRow(['Trans Num', 'Date', 'Warehouse', 'In Qty', 'Out Qty', 'Amount', 'Direction']);
  hr.font = { bold: true, color: { argb: NAVY } };
  hr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; });
  pairs.forEach(p => {
    const r = s3.addRow([p.trans_num, p.doc_date, p.warehouse, money(p.in_qty), money(p.out_qty), money(p.amount), p.direction]);
    r.getCell(4).numFmt = '#,##0.00'; r.getCell(5).numFmt = '#,##0.00'; r.getCell(6).numFmt = '#,##0.00';
    // Highlight the in_qty cell that *should* have been out_qty (every other row = source leg)
    if (Number(p.in_qty) > 0) r.getCell(4).font = { bold: true, color: { argb: RED } };
  });

  const out = path.join(__dirname, '..', 'docs', 'Transfer_Imbalance_Report_NSL.xlsx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);
  console.log(`✅ Wrote ${out}`);
  console.log(`   ${items.length} items · phantom ฿${totImbV.toLocaleString(undefined,{maximumFractionDigits:0})}`);
})();
