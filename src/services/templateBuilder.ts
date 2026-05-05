// Beautiful, modern Excel template generator for SmartInventory data import.
// Uses ExcelJS (loaded dynamically) so style features don't bloat the main bundle.

import type { Workbook, Worksheet } from 'exceljs';

// ── Brand & design tokens ────────────────────────────────────────────────────
const COLOR = {
  primary:    'FF1F3864', // dark navy
  primaryAlt: 'FF2E75B6', // accent blue
  headerBg:   'FF1F3864',
  headerFg:   'FFFFFFFF',
  desc:       'FF6B7280', // gray-500
  altRow:     'FFF7F9FC', // very light blue
  mark:       'FFDC2626', // red for required
  required:   'FFFFF7E6', // soft yellow for required-cell hint
  optional:   'FFFFFFFF',
  ok:         'FF16A34A',
  warn:       'FFD97706',
  border:     'FFE5E7EB',
  cardBg:     'FFEAF1FB',
  cover1:     'FF1F3864',
  cover2:     'FF2E75B6',
  cover3:     'FF60A5FA',
};

const FONT = 'TH Sarabun New';

type ColumnSpec = {
  key: string;
  header: string;
  width: number;
  desc?: string;          // shown in description row
  required?: boolean;     // marks header with *
  numFmt?: string;
  alignment?: { horizontal?: 'left' | 'center' | 'right'; vertical?: 'middle' | 'top' | 'bottom' };
  validation?: {
    type: 'list';
    values: string[];
    label?: string;
  };
};

// ── Style helpers ────────────────────────────────────────────────────────────
function applyHeader(ws: Worksheet, rowNumber: number, columns: ColumnSpec[]) {
  const row = ws.getRow(rowNumber);
  row.height = 32;
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.required ? `${c.header} *` : c.header;
    cell.font = { name: FONT, size: 12, bold: true, color: { argb: COLOR.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { horizontal: c.alignment?.horizontal ?? 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'medium', color: { argb: COLOR.headerBg } },
      bottom: { style: 'medium', color: { argb: COLOR.primaryAlt } },
      left:   { style: 'thin',   color: { argb: COLOR.headerBg } },
      right:  { style: 'thin',   color: { argb: COLOR.headerBg } },
    };
  });
}

function applyDescriptionRow(ws: Worksheet, rowNumber: number, columns: ColumnSpec[]) {
  const row = ws.getRow(rowNumber);
  row.height = 36;
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.desc ?? '';
    cell.font = { name: FONT, size: 10, italic: true, color: { argb: COLOR.desc } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.altRow } };
    cell.border = {
      top:    { style: 'thin', color: { argb: COLOR.border } },
      bottom: { style: 'medium', color: { argb: COLOR.primaryAlt } },
      left:   { style: 'thin', color: { argb: COLOR.border } },
      right:  { style: 'thin', color: { argb: COLOR.border } },
    };
  });
}

function applyDataRow(ws: Worksheet, rowNumber: number, columns: ColumnSpec[], values: any[], altRow: boolean) {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = values[i] ?? '';
    cell.font = { name: FONT, size: 11, color: { argb: 'FF111827' } };
    cell.alignment = {
      horizontal: c.alignment?.horizontal ?? (typeof values[i] === 'number' ? 'right' : 'left'),
      vertical: 'middle',
    };
    if (c.numFmt) cell.numFmt = c.numFmt;
    if (altRow) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.altRow } };
    }
    cell.border = {
      top:    { style: 'thin', color: { argb: COLOR.border } },
      bottom: { style: 'thin', color: { argb: COLOR.border } },
      left:   { style: 'thin', color: { argb: COLOR.border } },
      right:  { style: 'thin', color: { argb: COLOR.border } },
    };
  });
}

function setColumnWidths(ws: Worksheet, columns: ColumnSpec[]) {
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
}

function setDataValidations(
  ws: Worksheet,
  columns: ColumnSpec[],
  startRow: number,
  endRow: number,
) {
  columns.forEach((c, i) => {
    if (!c.validation) return;
    const colLetter = String.fromCharCode(64 + i + 1);
    // ExcelJS exposes dataValidations on Worksheet at runtime, but its types only
    // declare the per-cell shape. Cast through any to call the range API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ws as any).dataValidations.add(`${colLetter}${startRow}:${colLetter}${endRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${c.validation.values.join(',')}"`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'ค่าไม่ถูกต้อง',
      error: c.validation.label ?? `กรุณาเลือกจาก: ${c.validation.values.join(', ')}`,
    });
  });
}

function buildDataSheet(
  ws: Worksheet,
  title: { emoji: string; name: string; sub: string },
  columns: ColumnSpec[],
  sampleRows: any[][],
  options: { dataValidationRows?: number } = {},
) {
  // Row 1: big banner
  ws.mergeCells(1, 1, 1, columns.length);
  const banner = ws.getCell(1, 1);
  banner.value = `${title.emoji}  ${title.name}`;
  banner.font = { name: FONT, size: 18, bold: true, color: { argb: COLOR.headerFg } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover1 } };
  banner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 38;

  // Row 2: subtitle
  ws.mergeCells(2, 1, 2, columns.length);
  const sub = ws.getCell(2, 1);
  sub.value = title.sub;
  sub.font = { name: FONT, size: 11, italic: true, color: { argb: COLOR.desc } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.altRow } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 22;

  // Row 3: spacer
  ws.getRow(3).height = 6;

  // Row 4: column header
  applyHeader(ws, 4, columns);
  // Row 5: description
  applyDescriptionRow(ws, 5, columns);

  // Row 6+: data
  sampleRows.forEach((vals, idx) => {
    applyDataRow(ws, 6 + idx, columns, vals, idx % 2 === 1);
  });

  // Set widths and frozen panes
  setColumnWidths(ws, columns);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 0, activeCell: 'A6', showGridLines: false }];

  // Data validation on data area + a few extra rows for users
  const dvRows = options.dataValidationRows ?? 100;
  setDataValidations(ws, columns, 6, 6 + Math.max(sampleRows.length, dvRows));

  // Default font
  ws.properties.defaultRowHeight = 22;
}

// ── Cover sheet ──────────────────────────────────────────────────────────────
function buildCoverSheet(wb: Workbook) {
  const ws = wb.addWorksheet('📘 Welcome', {
    views: [{ showGridLines: false }],
    properties: { defaultColWidth: 14 },
  });

  // Big title banner
  ws.mergeCells('A1:H1');
  const t1 = ws.getCell('A1');
  t1.value = '📦  SmartInventory Master Data Template';
  t1.font = { name: FONT, size: 26, bold: true, color: { argb: COLOR.headerFg } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover1 } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 60;

  // Subtitle band
  ws.mergeCells('A2:H2');
  const t2 = ws.getCell('A2');
  t2.value = 'แม่แบบสำหรับนำเข้าข้อมูลคลังสินค้า — NSL Food Service';
  t2.font = { name: FONT, size: 13, color: { argb: COLOR.headerFg } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover2 } };
  t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 28;

  // Hero box
  ws.mergeCells('A4:H6');
  const hero = ws.getCell('A4');
  hero.value =
    'กรอกข้อมูลในแต่ละ Sheet → กลับเข้าหน้า Data Import ของระบบ → อัปโหลดไฟล์ → กด Import\n' +
    'ไม่จำเป็นต้องกรอกครบทุก Sheet — ระบบจะนำเข้าเฉพาะที่คุณติ๊ก';
  hero.font = { name: FONT, size: 12, color: { argb: 'FF111827' } };
  hero.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cardBg } };
  hero.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 2 };
  hero.border = {
    top:    { style: 'thin', color: { argb: COLOR.primaryAlt } },
    left:   { style: 'medium', color: { argb: COLOR.primaryAlt } },
    right:  { style: 'thin', color: { argb: COLOR.border } },
    bottom: { style: 'thin', color: { argb: COLOR.border } },
  };

  // Steps title
  const stepsTitle = ws.getCell('A8');
  stepsTitle.value = '🚀  ขั้นตอน 4 Step';
  stepsTitle.font = { name: FONT, size: 15, bold: true, color: { argb: COLOR.cover1 } };

  const steps = [
    { n: '1', title: 'เลือก Sheet ที่ต้องการ',  desc: 'ดูรายชื่อ Sheet ด้านล่าง — แต่ละ Sheet มี emoji และคำอธิบายชัดเจน' },
    { n: '2', title: 'กรอกข้อมูล',            desc: 'ใช้แถวตัวอย่างเป็น guide — ห้ามแก้ชื่อ Column ในแถวที่เป็นหัวตาราง' },
    { n: '3', title: 'ตรวจสอบให้ครบ',          desc: 'ช่องที่มี * คือบังคับ ห้ามว่าง — Cell ที่มี dropdown เลือกจาก list ที่กำหนด' },
    { n: '4', title: 'อัปโหลดในระบบ',          desc: 'ที่ Data Import → ลากไฟล์มาวาง → ติ๊ก Sheet ที่ต้องการ → กด Import' },
  ];
  steps.forEach((s, i) => {
    const r = 10 + i;
    ws.mergeCells(`A${r}:A${r}`); // single col
    ws.getCell(`A${r}`).value = s.n;
    ws.getCell(`A${r}`).font = { name: FONT, size: 18, bold: true, color: { argb: COLOR.headerFg } };
    ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover2 } };
    ws.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`A${r}`).border = {
      top:    { style: 'thin', color: { argb: COLOR.border } },
      left:   { style: 'thin', color: { argb: COLOR.border } },
      right:  { style: 'thin', color: { argb: COLOR.border } },
      bottom: { style: 'thin', color: { argb: COLOR.border } },
    };
    ws.mergeCells(`B${r}:H${r}`);
    const detail = ws.getCell(`B${r}`);
    detail.value = `${s.title} — ${s.desc}`;
    detail.font = { name: FONT, size: 11, color: { argb: 'FF111827' } };
    detail.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    detail.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? COLOR.altRow : 'FFFFFFFF' } };
    detail.border = {
      top:    { style: 'thin', color: { argb: COLOR.border } },
      left:   { style: 'thin', color: { argb: COLOR.border } },
      right:  { style: 'thin', color: { argb: COLOR.border } },
      bottom: { style: 'thin', color: { argb: COLOR.border } },
    };
    ws.getRow(r).height = 28;
  });

  // Sheet legend title
  const lgTitle = ws.getCell('A16');
  lgTitle.value = '📑  รายการ Sheet ในไฟล์นี้';
  lgTitle.font = { name: FONT, size: 15, bold: true, color: { argb: COLOR.cover1 } };

  // Legend table
  const legend: { sheet: string; what: string; required: string; mode: string }[] = [
    { sheet: '🏢  Warehouses',   what: 'รหัสและชื่อคลังสินค้า',           required: 'ครั้งแรก',   mode: 'Upsert' },
    { sheet: '📦  Item Groups',  what: 'รหัส/ชื่อกลุ่ม + Shelf Life',     required: 'ครั้งแรก',   mode: 'Upsert' },
    { sheet: '🏷  Items',        what: 'รายการสินค้าทั้งหมด',              required: 'ทุกครั้ง',    mode: 'Upsert' },
    { sheet: '🚦  Thresholds',   what: 'Min / ROP / Max ต่อสินค้า·คลัง',   required: 'ตามต้องการ',  mode: 'Upsert' },
    { sheet: '🔁  Transactions', what: 'การเคลื่อนไหวรับ/จ่าย/โอน',         required: 'ทุกครั้ง',    mode: 'Replace / Append' },
  ];

  // Legend header
  const headerR = 18;
  ['Sheet', 'ข้อมูล', 'ความจำเป็น', 'โหมด Import'].forEach((h, i) => {
    const c = ws.getCell(headerR, i + 1);
    c.value = h;
    c.font = { name: FONT, size: 12, bold: true, color: { argb: COLOR.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover1 } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  });
  ws.mergeCells(headerR, 1, headerR, 2);
  ws.mergeCells(headerR, 3, headerR, 5);
  ws.mergeCells(headerR, 6, headerR, 7);
  ws.mergeCells(headerR, 8, headerR, 8);
  ws.getRow(headerR).height = 28;

  legend.forEach((l, idx) => {
    const r = 19 + idx;
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, 5);
    ws.mergeCells(r, 6, r, 7);
    const fill = idx % 2 === 0 ? COLOR.altRow : 'FFFFFFFF';
    [
      { range: ws.getCell(r, 1), text: l.sheet, bold: true },
      { range: ws.getCell(r, 3), text: l.what,  bold: false },
      { range: ws.getCell(r, 6), text: l.required, bold: false },
      { range: ws.getCell(r, 8), text: l.mode, bold: false },
    ].forEach((it) => {
      it.range.value = it.text;
      it.range.font = { name: FONT, size: 11, bold: it.bold, color: { argb: 'FF111827' } };
      it.range.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      it.range.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      it.range.border = {
        top:    { style: 'thin', color: { argb: COLOR.border } },
        bottom: { style: 'thin', color: { argb: COLOR.border } },
      };
    });
    ws.getRow(r).height = 24;
  });

  // Color legend
  const clrR = 19 + legend.length + 2;
  ws.getCell(`A${clrR}`).value = '🎨  สัญลักษณ์ที่ใช้';
  ws.getCell(`A${clrR}`).font = { name: FONT, size: 13, bold: true, color: { argb: COLOR.cover1 } };

  const symbols = [
    { sym: '*',         meaning: 'ช่องบังคับ ห้ามเว้นว่าง',  color: COLOR.mark },
    { sym: '⌄',         meaning: 'มี dropdown — คลิกเพื่อเลือก',  color: COLOR.primaryAlt },
    { sym: 'แถวสีฟ้าอ่อน', meaning: 'ตัวอย่างข้อมูล (ลบออกได้ก่อน Import)', color: COLOR.altRow },
  ];
  symbols.forEach((s, i) => {
    const r = clrR + 1 + i;
    ws.getCell(`A${r}`).value = s.sym;
    ws.getCell(`A${r}`).font = { name: FONT, size: 14, bold: true, color: { argb: s.color } };
    ws.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(`B${r}:H${r}`);
    ws.getCell(`B${r}`).value = s.meaning;
    ws.getCell(`B${r}`).font = { name: FONT, size: 11 };
    ws.getCell(`B${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 22;
  });

  // Footer
  const footR = clrR + 1 + symbols.length + 2;
  ws.mergeCells(`A${footR}:H${footR}`);
  const f = ws.getCell(`A${footR}`);
  f.value = `เอกสารนี้สร้างโดยระบบ SmartInventory · NSL Food Service · ${new Date().toISOString().split('T')[0]}`;
  f.font = { name: FONT, size: 10, italic: true, color: { argb: COLOR.desc } };
  f.alignment = { horizontal: 'center', vertical: 'middle' };

  // Set column widths for cover
  [22, 14, 14, 14, 14, 12, 12, 18].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function buildBeautifulTemplate(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SmartInventory';
  wb.lastModifiedBy = 'SmartInventory';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = 'SmartInventory Master Data Template';
  wb.company = 'NSL Food Service';

  // ── 1. Welcome ─────────────────────────────────────────────────────────────
  buildCoverSheet(wb);

  // ── 2. Warehouses ──────────────────────────────────────────────────────────
  const warehousesCols: ColumnSpec[] = [
    { key: 'code',     header: 'Warehouse Code', width: 14, required: true,  desc: 'รหัสคลัง',                  alignment: { horizontal: 'left' } },
    { key: 'name',     header: 'Warehouse Name', width: 32, required: true,  desc: 'ชื่อคลังสินค้า',             alignment: { horizontal: 'left' } },
    { key: 'type',     header: 'Type',           width: 18, desc: 'ประเภทคลัง',
      validation: { type: 'list', values: ['Raw Materials', 'Finished Goods', 'Production', 'Packaging', 'Quality Control', 'Claim Hold', 'Waste', 'General'] } },
    { key: 'active',   header: 'Active',         width: 10, desc: 'A = Active, In = Inactive',
      validation: { type: 'list', values: ['A', 'In'] }, alignment: { horizontal: 'center' } },
    { key: 'sort',     header: 'Sort Order',     width: 12, desc: 'ลำดับการแสดงผล (1, 2, 3…)', numFmt: '0', alignment: { horizontal: 'center' } },
  ];
  const warehousesSamples: any[][] = [
    ['FS-RM01', 'คลัง RM - ใน1',                'Raw Materials',  'A', 1],
    ['FS-RM02', 'คลัง RM - ใน2',                'Raw Materials',  'A', 2],
    ['FS-FG01', 'คลัง FG - ใน1',                'Finished Goods', 'A', 3],
    ['FS-PD01', 'คลังผลิต - ใน1',                'Production',     'A', 4],
    ['FS-PK01', 'คลัง PK & Factory Supply - ใน1','Packaging',      'A', 5],
  ];
  buildDataSheet(
    wb.addWorksheet('Warehouses'),
    { emoji: '🏢', name: 'Warehouses (คลังสินค้า)', sub: 'รหัสและชื่อของคลังสินค้าทั้งหมด — เพิ่มได้ตามจริง' },
    warehousesCols,
    warehousesSamples,
  );

  // ── 3. Item Groups ─────────────────────────────────────────────────────────
  const groupCols: ColumnSpec[] = [
    { key: 'code',  header: 'Group Code', width: 12, required: true, desc: 'ตัวเลขรหัสกลุ่ม', numFmt: '0', alignment: { horizontal: 'center' } },
    { key: 'name',  header: 'Group Name', width: 28, required: true, desc: 'ชื่อกลุ่มสินค้า' },
    { key: 'desc',  header: 'Description', width: 32, desc: 'คำอธิบายเพิ่มเติม (ไม่บังคับ)' },
    { key: 'shelf', header: 'Shelf Life Days', width: 18, desc: 'อายุขัย default (วัน) — ใช้คำนวณ Expire Date',
      numFmt: '#,##0', alignment: { horizontal: 'right' } },
  ];
  const groupSamples: any[][] = [
    [123, 'FFG-Finish Goods',  'สินค้าสำเร็จรูป',     365],
    [125, 'FRM-Raw Materials', 'วัตถุดิบ',            548],
    [126, 'FBY-By Product',    'ผลพลอยได้',           730],
    [127, 'FPKG-Packaging',    'บรรจุภัณฑ์',          365],
  ];
  buildDataSheet(
    wb.addWorksheet('Item Groups'),
    { emoji: '📦', name: 'Item Groups (กลุ่มสินค้า)', sub: 'แบ่งหมวดสินค้า + กำหนด Shelf Life สำหรับ VV Matrix' },
    groupCols,
    groupSamples,
  );

  // ── 4. Items ───────────────────────────────────────────────────────────────
  const itemCols: ColumnSpec[] = [
    { key: 'code',     header: 'Item Code',      width: 16, required: true, desc: 'รหัสสินค้า', alignment: { horizontal: 'left' } },
    { key: 'name',     header: 'Item Name',      width: 36, required: true, desc: 'ชื่อสินค้า' },
    { key: 'group',    header: 'Group Code',     width: 12, required: true, desc: 'รหัสกลุ่ม (อ้างอิง Item Groups)',
      validation: { type: 'list', values: ['123', '125', '126', '127'], label: 'เลือกจาก Group Code ที่มีใน Item Groups' },
      numFmt: '0', alignment: { horizontal: 'center' } },
    { key: 'uom',      header: 'UOM',            width: 10, desc: 'หน่วยนับ',
      validation: { type: 'list', values: ['KG', 'PCS', 'BAG', 'BOX', 'L', 'ML', 'PACK'] },
      alignment: { horizontal: 'center' } },
    { key: 'std',      header: 'Std Cost',       width: 14, desc: 'ต้นทุนมาตรฐาน',  numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    { key: 'mavg',     header: 'Moving Avg',     width: 14, desc: 'ต้นทุนเฉลี่ย',     numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    { key: 'status',   header: 'Status',         width: 10, desc: 'A = Active, In = Inactive',
      validation: { type: 'list', values: ['A', 'In'] }, alignment: { horizontal: 'center' } },
    { key: 'expire',   header: 'Expire Date',    width: 14, desc: 'YYYY-MM-DD (ปล่อยว่างได้ ระบบจะคำนวณจาก Shelf Life)',
      numFmt: 'yyyy-mm-dd', alignment: { horizontal: 'center' } },
  ];
  const itemSamples: any[][] = [
    ['RM-10001', 'แป้งสาลีอเนกประสงค์',     125, 'KG',   15.50, 16.00, 'A', new Date('2026-12-31')],
    ['RM-10002', 'น้ำตาลทรายขาว',           125, 'KG',   22.00, 23.50, 'A', new Date('2027-06-30')],
    ['RM-10003', 'นมข้นจืด',                125, 'KG',   38.00, 39.20, 'A', new Date('2026-09-15')],
    ['FG-50001', 'ขนมปังโฮลวีท แพ็ค 6 ชิ้น',123, 'PACK', 45.00, 46.50, 'A', new Date('2026-06-10')],
    ['PK-70001', 'กล่องบรรจุ FG ขนาด M',    127, 'PCS',  4.20,  4.30,  'A', null],
  ];
  buildDataSheet(
    wb.addWorksheet('Items'),
    { emoji: '🏷', name: 'Items (สินค้า)', sub: 'รายการสินค้าทุกรายการ — Group Code ต้องตรงกับ Item Groups' },
    itemCols,
    itemSamples,
  );

  // ── 5. Thresholds ──────────────────────────────────────────────────────────
  const thresholdCols: ColumnSpec[] = [
    { key: 'item',    header: 'Item Code',      width: 16, required: true, desc: 'อ้างอิง Items', alignment: { horizontal: 'left' } },
    { key: 'whs',     header: 'Warehouse Code', width: 14, required: true, desc: 'อ้างอิง Warehouses',
      validation: { type: 'list', values: ['FS-RM01', 'FS-RM02', 'FS-RM03', 'FS-RM04', 'FS-FG01', 'FS-FG02', 'FS-FG03', 'FS-PD01', 'FS-PD02', 'FS-PK01', 'FS-PK02'] },
      alignment: { horizontal: 'center' } },
    { key: 'min',     header: 'Min Level',     width: 14, desc: 'ระดับต่ำสุด (Safety Stock)', numFmt: '#,##0', alignment: { horizontal: 'right' } },
    { key: 'rop',     header: 'Reorder Point', width: 16, desc: 'จุดสั่งซื้อซ้ำ',              numFmt: '#,##0', alignment: { horizontal: 'right' } },
    { key: 'max',     header: 'Max Level',     width: 14, desc: 'ระดับสูงสุด (เกินคือ Overstock)', numFmt: '#,##0', alignment: { horizontal: 'right' } },
  ];
  const thresholdSamples: any[][] = [
    ['RM-10001', 'FS-RM01',  100, 500, 2000],
    ['RM-10002', 'FS-RM01',   50, 200, 1000],
    ['RM-10003', 'FS-RM02',   80, 300, 1500],
    ['FG-50001', 'FS-FG01',   30, 120, 600],
  ];
  buildDataSheet(
    wb.addWorksheet('Thresholds'),
    { emoji: '🚦', name: 'Thresholds (จุดสั่งซื้อ)', sub: 'ตั้งจุดเตือนแยกตามสินค้าและคลัง — ระบบใช้ใน Low Stock Alerts' },
    thresholdCols,
    thresholdSamples,
  );

  // ── 6. Transactions ────────────────────────────────────────────────────────
  const txCols: ColumnSpec[] = [
    { key: 'date',     header: 'Date',           width: 14, required: true, desc: 'YYYY-MM-DD', numFmt: 'yyyy-mm-dd', alignment: { horizontal: 'center' } },
    { key: 'tnum',     header: 'Transaction No', width: 16, required: true, desc: 'เลขเอกสาร', numFmt: '0', alignment: { horizontal: 'center' } },
    { key: 'line',     header: 'Line Num',       width: 10, desc: 'บรรทัด',                 numFmt: '0', alignment: { horizontal: 'center' } },
    { key: 'ttype',    header: 'Tx Type',        width: 10, desc: 'รหัสประเภท (ดู legend)',
      validation: { type: 'list', values: ['0', '15', '16', '18', '20', '21', '59', '60', '67', '69', '162'] },
      numFmt: '0', alignment: { horizontal: 'center' } },
    { key: 'whs',      header: 'Warehouse',      width: 12, required: true, desc: 'รหัสคลัง',
      validation: { type: 'list', values: ['FS-RM01', 'FS-RM02', 'FS-RM03', 'FS-RM04', 'FS-FG01', 'FS-FG02', 'FS-FG03', 'FS-PD01', 'FS-PD02', 'FS-PK01', 'FS-PK02', 'FS-QC01', 'FS-QC02', 'FS-CL01', 'FS-CO01', 'FS-WS01', 'BT-RM02'] },
      alignment: { horizontal: 'center' } },
    { key: 'item',     header: 'Item Code',      width: 14, required: true, desc: 'อ้างอิง Items' },
    { key: 'in',       header: 'In Qty',         width: 12, desc: 'จำนวนรับเข้า',  numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    { key: 'out',      header: 'Out Qty',        width: 12, desc: 'จำนวนจ่ายออก',  numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    { key: 'amount',   header: 'Total Amount',   width: 14, desc: 'มูลค่ารวม',      numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    { key: 'dir',      header: 'Direction',      width: 12, desc: 'In / Out / Transfers',
      validation: { type: 'list', values: ['In', 'Out', 'Transfers'] }, alignment: { horizontal: 'center' } },
  ];
  const txSamples: any[][] = [
    [new Date('2026-04-01'), 2000101, 0, 20, 'FS-RM01', 'RM-10001', 500,  0,    7750.00, 'In'],
    [new Date('2026-04-02'), 2000102, 0, 60, 'FS-RM01', 'RM-10001',   0, 50,     775.00, 'Out'],
    [new Date('2026-04-03'), 2000103, 0, 67, 'FS-RM01', 'RM-10001',   0, 100,   1550.00, 'Transfers'],
    [new Date('2026-04-03'), 2000103, 1, 67, 'FS-PD01', 'RM-10001', 100,  0,    1550.00, 'Transfers'],
  ];
  buildDataSheet(
    wb.addWorksheet('Transactions'),
    { emoji: '🔁', name: 'Transactions (การเคลื่อนไหว)', sub: 'ทุกรายการรับ/จ่าย/โอน — ใช้บ่อยที่สุด, นำเข้าทุกครั้งที่ปิดงวด' },
    txCols,
    txSamples,
    { dataValidationRows: 1000 },
  );

  // ── 7. Transaction Type Legend (read-only reference) ───────────────────────
  const ws = wb.addWorksheet('🔑 Tx Type Legend', { views: [{ showGridLines: false }] });
  ws.mergeCells('A1:D1');
  const ll = ws.getCell('A1');
  ll.value = '🔑  Transaction Type Legend';
  ll.font = { name: FONT, size: 18, bold: true, color: { argb: COLOR.headerFg } };
  ll.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cover1 } };
  ll.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 38;

  ws.mergeCells('A2:D2');
  const ls = ws.getCell('A2');
  ls.value = 'รหัสที่ใช้ในคอลัมน์ Tx Type ของ Sheet Transactions';
  ls.font = { name: FONT, size: 11, italic: true, color: { argb: COLOR.desc } };
  ls.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.altRow } };
  ls.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 20;

  const legendCols: ColumnSpec[] = [
    { key: 'code', header: 'Code',      width: 10, alignment: { horizontal: 'center' } },
    { key: 'name', header: 'Name',      width: 28 },
    { key: 'dir',  header: 'Direction', width: 14, alignment: { horizontal: 'center' } },
    { key: 'desc', header: 'หมายเหตุ',   width: 36 },
  ];
  applyHeader(ws, 4, legendCols);

  const txTypes: any[][] = [
    [0,   'Opening Balance',     'Opening',   'ยอดยกมา'],
    [15,  'Delivery',             'Out',       'ส่งของออก'],
    [16,  'Return',               'In',        'ลูกค้าคืนของ'],
    [18,  'A/P Invoice',          'In',        'รับเข้าจาก AP'],
    [20,  'Goods Receipt PO',     'In',        'รับของตามใบสั่งซื้อ'],
    [21,  'Goods Return',         'Out',       'คืนของให้ supplier'],
    [59,  'Goods Receipt',        'In',        'รับเข้าทั่วไป'],
    [60,  'Goods Issue',          'Out',       'จ่ายออกทั่วไป'],
    [67,  'Inventory Transfers',  'Transfers', 'โอนคลัง'],
    [69,  'Landed Cost',          'Cost',      'ปรับต้นทุนนำเข้า'],
    [162, 'Inventory Revaluation','Cost',      'ปรับมูลค่าสต็อก'],
  ];
  txTypes.forEach((r, i) => applyDataRow(ws, 5 + i, legendCols, r, i % 2 === 1));
  setColumnWidths(ws, legendCols);
  ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];

  // ── Set order so Welcome opens first ───────────────────────────────────────
  // (already in order)

  // ── Trigger download ───────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SmartInventory_MasterSetup_Template.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
