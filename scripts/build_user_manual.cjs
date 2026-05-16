/* Generate SmartInventory user manual (.docx) for NSL Food Service.
   Excludes the procurement (Suppliers / POs / Goods in Transit) module. */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  TabStopType, TabStopPosition,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak,
} = require('docx');

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'TH Sarabun New';   // Thai-friendly default
const FONT_FALLBACK = 'Arial';
const COLOR_PRIMARY = '1F3864';  // dark navy
const COLOR_ACCENT  = '2E75B6';  // blue
const COLOR_MUTED   = '595959';
const COLOR_GRID    = 'BFBFBF';
const COLOR_HEAD_BG = 'D9E2F3';  // light blue header
const COLOR_ALT_BG  = 'F2F2F2';

const PAGE_W = 12240;
const PAGE_H = 15840;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Helpers ──────────────────────────────────────────────────────────────────
const run = (text, opts = {}) => new TextRun({ font: FONT, ...opts, text });
const p   = (text, opts = {}) => new Paragraph({
  spacing: { after: 120 },
  ...opts,
  children: [run(text, opts.runOpts ?? {})],
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: true,
  spacing: { before: 240, after: 240 },
  children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: COLOR_PRIMARY })],
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 160 },
  children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: COLOR_PRIMARY })],
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 120 },
  children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: COLOR_ACCENT })],
});

const para = (text, runOpts = {}) => new Paragraph({
  spacing: { after: 100, line: 320 },
  children: [run(text, runOpts)],
});

// Mixed inline runs
const paraMixed = (parts, opts = {}) => new Paragraph({
  spacing: { after: 100, line: 320 },
  ...opts,
  children: parts.map((part) => {
    if (typeof part === 'string') return run(part);
    return new TextRun({ font: FONT, ...part });
  }),
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 60 },
  children: [run(text)],
});
const num = (text, level = 0) => new Paragraph({
  numbering: { reference: 'numbers', level },
  spacing: { after: 60 },
  children: [run(text)],
});

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
};
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

const cell = (text, opts = {}) => {
  const isHead = opts.head === true;
  return new TableCell({
    borders: cellBorders,
    margins: cellMargins,
    width: { size: opts.width, type: WidthType.DXA },
    shading: isHead ? { fill: COLOR_HEAD_BG, type: ShadingType.CLEAR }
            : opts.alt ? { fill: COLOR_ALT_BG,  type: ShadingType.CLEAR }
            : undefined,
    children: (Array.isArray(text) ? text : [text]).map((line) =>
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({
          text: line,
          font: FONT,
          bold: isHead,
          color: isHead ? COLOR_PRIMARY : '000000',
          size: 22,
        })],
      }),
    ),
  });
};

const buildTable = (columns, rows) => {
  const totalW = CONTENT_W;
  const colWidths = columns.map((c) => Math.round(totalW * c.weight));
  // Adjust last column for rounding drift
  const drift = totalW - colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += drift;

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((c, i) => cell(c.label, { head: true, width: colWidths[i] })),
  });
  const bodyRows = rows.map((row, idx) => new TableRow({
    children: row.map((val, i) => cell(val, { width: colWidths[i], alt: idx % 2 === 1 })),
  }));

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
};

// Callout box (single-row table with shaded fill)
const callout = (title, body, color = '#FFF8DC') => {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR_ACCENT },
          left:   { style: BorderStyle.SINGLE, size: 24, color: COLOR_ACCENT },
          right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
        },
        margins: { top: 160, bottom: 160, left: 220, right: 220 },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: color.replace('#', ''), type: ShadingType.CLEAR },
        children: [
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: title, font: FONT, bold: true, size: 24, color: COLOR_PRIMARY })] }),
          ...(Array.isArray(body) ? body : [body]).map((line) =>
            new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, font: FONT, size: 22 })] })
          ),
        ],
      })],
    })],
  });
};

const spacer = () => new Paragraph({ spacing: { after: 100 }, children: [run('')] });

// ── Content sections ─────────────────────────────────────────────────────────

const coverSection = () => [
  // Logo placeholder area (large blank space + title)
  new Paragraph({ spacing: { before: 2400 }, children: [run('')] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: 'คู่มือการใช้งาน', font: FONT, size: 56, bold: true, color: COLOR_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'SmartInventory', font: FONT, size: 72, bold: true, color: COLOR_ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'ระบบบริหารจัดการคลังสินค้าอัจฉริยะ', font: FONT, size: 32, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1800 },
    children: [new TextRun({ text: 'NSL Food Service', font: FONT, size: 36, bold: true, color: COLOR_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `เวอร์ชันเอกสาร: 2.0  ·  ปรับปรุงล่าสุด: ${new Date().toISOString().split('T')[0]}  ·  เพิ่ม Lot Inventory + FEFO + FS Category`, font: FONT, size: 22, color: COLOR_MUTED })],
  }),
];

const tocSection = () => [
  h1('สารบัญ'),
  ...[
    ['1', 'ภาพรวมระบบ'],
    ['2', 'การเข้าสู่ระบบ'],
    ['3', 'หน้า Dashboard'],
    ['4', 'Stock On-Hand (สต็อกคงเหลือ)'],
    ['5', 'Movement History (ประวัติการเคลื่อนไหว) + Waterfall'],
    ['6', 'Low Stock Alerts + Expiring Lots'],
    ['7', 'Cost & Valuation (ต้นทุนและมูลค่า)'],
    ['8', 'Lot Inventory (สต็อกตาม Lot) + Aging Matrix'],
    ['9', 'Management Reports — VV Matrix · Group Analysis · Trends · Slow Moving · Turnover · FEFO'],
    ['10', 'Data Import (นำเข้าข้อมูล)'],
    ['11', 'Settings (ตั้งค่า)'],
    ['12', 'User Management (จัดการผู้ใช้)'],
    ['13', 'แนวคิด VV Matrix แบบละเอียด (3 Modes)'],
    ['14', 'ภาคผนวก'],
  ].map(([num, title]) => new Paragraph({
    spacing: { after: 80 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
    children: [
      new TextRun({ text: `${num}.  `, font: FONT, size: 24, bold: true, color: COLOR_ACCENT }),
      new TextRun({ text: title, font: FONT, size: 24 }),
    ],
  })),
];

const overviewSection = () => [
  h1('1. ภาพรวมระบบ'),
  para('SmartInventory คือแพลตฟอร์มบริหารจัดการคลังสินค้าแบบ Web Application ที่ออกแบบมาสำหรับองค์กรอาหาร เน้น:'),
  bullet('การติดตามจำนวนและมูลค่าสต็อกแบบ Real-time'),
  bullet('ระบบแจ้งเตือนเมื่อสต็อกใกล้หมดหรือถึงจุดสั่งซื้อ'),
  bullet('การวิเคราะห์การหมุนเวียนสต็อกและสินค้าค้างนาน'),
  bullet('การจัดอันดับ Class A/B/C ด้วย VV Matrix (Value × Validity)'),
  bullet('การนำเข้าข้อมูลจาก Excel ด้วย Master Data Template เดียว'),
  spacer(),

  h2('1.1 บทบาทผู้ใช้ (Roles)'),
  buildTable([
    { label: 'Role', weight: 0.20 },
    { label: 'สิทธิ์โดยทั่วไป', weight: 0.55 },
    { label: 'ตัวอย่างผู้ใช้', weight: 0.25 },
  ], [
    ['Super Admin', 'จัดการระบบทั้งหมด: เปิด/ปิด Feature ของแต่ละบริษัท, สร้าง/ลบผู้ใช้ทุก Role, ดู Companies', 'ผู้ดูแลระบบกลาง'],
    ['Admin',       'สิทธิ์ทั้งหมดภายในบริษัท: นำเข้าข้อมูล, จัดการผู้ใช้ในบริษัท, ปรับ Settings', 'ผู้จัดการ IT บริษัท'],
    ['Executive',   'ดูข้อมูลทั้งหมดเพื่อการบริหาร แต่ไม่แก้ไข', 'ผู้บริหารระดับสูง'],
    ['Supervisor',  'ดูข้อมูล + นำเข้าข้อมูล + ปรับ Threshold ของแผนกตน', 'หัวหน้างานคลัง'],
    ['Staff',       'ดู Dashboard, Stock, Alerts เท่านั้น', 'พนักงานคลัง'],
  ]),
  spacer(),

  h2('1.2 โครงสร้างเมนูหลัก'),
  bullet('Dashboard — ภาพรวมตัวเลขสำคัญ'),
  bullet('Stock On-Hand — สต็อกคงเหลือ'),
  bullet('Movement History — ประวัติการเคลื่อนไหว'),
  bullet('Low Stock Alerts — แจ้งเตือนสต็อกต่ำ'),
  bullet('Cost & Valuation — ต้นทุนและมูลค่า'),
  bullet('Management Reports — รายงานเชิงบริหาร (Slow Moving, Turnover, Reorder, VV Matrix)'),
  bullet('Data Import — นำเข้าข้อมูลจาก Excel'),
  bullet('Settings — ตั้งค่าระบบ'),
  bullet('คู่มือ VV Matrix — เอกสารอ้างอิง'),
  bullet('User Management — จัดการผู้ใช้และสิทธิ์ (Admin / Super Admin เท่านั้น)'),
  spacer(),

  callout('🎯 สำหรับ NSL Food Service',
    ['ระบบของท่านเปิดใช้งานเฉพาะโมดูลคลังสินค้า (ไม่มีโมดูลจัดซื้อ)',
     'จึงไม่มีเมนู Suppliers / Purchase Orders / Goods in Transit ปรากฏใน Sidebar'],
    'EAF1FB'),
];

const loginSection = () => [
  h1('2. การเข้าสู่ระบบ'),
  para('เปิดเบราว์เซอร์ (แนะนำ Chrome / Edge เวอร์ชันล่าสุด) ไปที่ URL ของระบบที่ผู้ดูแลแจ้งให้ทราบ'),
  num('กรอก Email และรหัสผ่าน'),
  num('(ไม่บังคับ) ติ๊ก "จดจำอุปกรณ์นี้" เพื่อให้ session อยู่ข้ามการปิด-เปิด browser — Default ถูกตั้งเป็นไม่ติ๊กไว้เพื่อความปลอดภัยของเครื่องที่ใช้ร่วมกัน'),
  num('กดปุ่ม "เข้าสู่ระบบ"'),
  num('ระบบจะนำท่านไปยังหน้า Dashboard โดยอัตโนมัติ'),
  spacer(),

  callout('🔑 ลืมรหัสผ่าน',
    ['แจ้ง Admin หรือ Super Admin ในบริษัทของท่านให้กดปุ่ม Reset Password ในหน้า User Management',
     'ระบบจะสุ่มรหัสผ่านใหม่ให้ผู้ดูแลส่งต่อให้ท่าน',
     'เมื่อท่าน login ด้วยรหัสที่ admin ตั้งให้ ระบบจะบังคับให้ท่านเปลี่ยนรหัสผ่านใหม่ทันที (ดูข้อ 2.1)'],
    'FFF8DC'),
  spacer(),

  h2('2.1 การบังคับเปลี่ยนรหัสผ่านในการ login ครั้งแรก (ใหม่)'),
  para('เพื่อความปลอดภัย ระบบจะบังคับให้ผู้ใช้ตั้งรหัสผ่านของตัวเองเสมอใน 2 กรณีนี้:'),
  bullet('Admin เพิ่งสร้างบัญชีให้ — รหัสผ่านที่แจ้งให้เป็นเพียงรหัสชั่วคราว'),
  bullet('Admin เพิ่ง Reset รหัสผ่านให้ — รหัสปัจจุบันถูกตั้งโดยผู้ดูแลระบบ'),
  para('เมื่อท่าน login ในกรณีดังกล่าว ระบบจะแสดงหน้าจอ "ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน" และไม่อนุญาตให้ใช้เมนูใด ๆ จนกว่าจะตั้งรหัสผ่านใหม่:'),
  num('กรอกรหัสผ่านใหม่ + ยืนยันรหัสผ่าน'),
  num('ระบบตรวจสอบอัตโนมัติว่ารหัสผ่านต้องมี: ≥ 8 ตัวอักษร · มีตัวอักษร (a-z / A-Z) · มีตัวเลข (0-9) · ทั้งสองช่องตรงกัน'),
  num('กด "ตั้งรหัสผ่านใหม่และเข้าสู่ระบบ" — เข้าใช้งานได้ทันที (โดยปกติเสร็จภายใน 1 วินาที)'),
  para('หากไม่ต้องการดำเนินการ สามารถกด "ออกจากระบบ" ที่ด้านล่างของหน้าจอเพื่อกลับไปหน้า login ได้', { italics: true, color: COLOR_MUTED }),
  spacer(),

  h2('2.2 เปลี่ยนรหัสผ่านของตนเอง (โดยสมัครใจ)'),
  num('กดที่ไอคอนรูปกุญแจ (🔑) มุมขวาบนของหน้าจอ'),
  num('กรอกรหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)'),
  num('กด "Reset รหัสผ่าน"'),
  para('ระบบจะใช้รหัสใหม่ในการเข้าสู่ระบบครั้งต่อไป', { italics: true, color: COLOR_MUTED }),
];

const dashboardSection = () => [
  h1('3. หน้า Dashboard'),
  para('Dashboard แสดงตัวเลขภาพรวมเพื่อให้เห็นสถานะคลังภายในไม่กี่วินาที'),

  h2('3.1 KPI หลัก 4 ตัว'),
  buildTable([
    { label: 'ตัวเลข',           weight: 0.25 },
    { label: 'ความหมาย',          weight: 0.50 },
    { label: 'การคำนวณ',         weight: 0.25 },
  ], [
    ['มูลค่าคงคลังรวม',  'มูลค่ารวมของสินค้าทั้งหมดในทุกคลัง',           'Σ (จำนวนคงเหลือ × Moving Avg)'],
    ['สินค้า Active',    'จำนวนสินค้าที่มีการเคลื่อนไหวภายใน N วัน',     'ตั้งค่า N ที่ Settings'],
    ['Critical Alerts',  'จำนวนสินค้าที่ต่ำกว่า Min Level',              'จาก v_stock_alerts'],
    ['Last Sync',         'วันเวลาที่ Import ข้อมูลล่าสุด',              'จาก system_config'],
  ]),
  spacer(),

  h2('3.2 ส่วนกราฟและรายการ'),
  bullet('Monthly Movement Trend — แสดงยอดรับเข้า/จ่ายออกย้อนหลัง 12 เดือน'),
  bullet('Top Stock by Value — สินค้า 10 อันดับที่มีมูลค่าสูงสุด'),
  bullet('Critical Items — รายการสินค้าที่ต้องจัดการด่วน'),
  spacer(),

  h2('3.3 Insight Block ใน Tooltip ของแต่ละ KPI (ใหม่)'),
  para('ทุก KPI card ในแถบ Executive Health KPI Strip (6 ใบ) มีไอคอน (ⓘ) — เมื่อ hover จะเห็น tooltip ที่นอกจากสูตรคำนวณแล้ว ยังมี Insight Block แปลตัวเลขเป็นภาษาที่ผู้บริหารอ่านง่าย พร้อมเปรียบเทียบกับเกณฑ์มาตรฐาน เช่น:'),
  bullet('Days Inventory > 365 วัน → คำนวณเป็นปีและเทียบกับมาตรฐานอาหาร (30-90 วัน)'),
  bullet('Inventory Turnover < 1× → "ในรอบ 12 เดือนสินค้าหมุนเวียนไม่ถึง 1 รอบ"'),
  bullet('Dead Stock % > 50% → "มูลค่าเงินที่จมคิดเป็น X% ของคลังทั้งหมด"'),
  bullet('Working Capital — คำนวณ carrying cost ประมาณการ (15%/ปี)'),
  bullet('Expiring ≤ 30 — แยกระหว่าง "หมดอายุแล้ว" (GMP/HACCP risk) กับ "ใกล้หมดอายุ"'),
  para('สีของ Insight Block เปลี่ยนตามความรุนแรง: เขียว = ดี, ส้ม = ต้องเฝ้าระวัง, แดง = วิกฤต', { italics: true, color: COLOR_MUTED }),
  spacer(),

  callout('💡 Tooltip ฉลาดกว่าเดิม',
    ['• ทุก tooltip ในระบบจะ flip ทิศทางอัตโนมัติเมื่อใกล้ขอบจอ — เนื้อหาจะไม่ถูกตัด',
     '• ถ้าเนื้อหาสูงเกินจอ จะมี scroll ในกล่อง tooltip เอง',
     '• ใช้ได้กับทั้ง Dashboard / Reports / Valuation'],
    'F0F7FF'),
];

const stockOnHandSection = () => [
  h1('4. Stock On-Hand (สต็อกคงเหลือ)'),
  para('แสดงสต็อกของสินค้าทุกชิ้นในทุกคลัง พร้อมตัวกรองและการค้นหา'),

  h2('4.1 ฟังก์ชันที่ใช้บ่อย'),
  bullet('🔍 ค้นหาด้วย Item Code หรือชื่อสินค้า'),
  bullet('📂 กรองตามคลังสินค้า / กลุ่มสินค้า / สถานะ Active'),
  bullet('📊 เรียงตามมูลค่า, จำนวน, หรือชื่อ'),
  bullet('📤 ส่งออกเป็น Excel (ปุ่ม Export ด้านบน)'),
  spacer(),

  h2('4.2 ความหมายของแต่ละคอลัมน์'),
  buildTable([
    { label: 'คอลัมน์',         weight: 0.22 },
    { label: 'ความหมาย',         weight: 0.78 },
  ], [
    ['Item Code',     'รหัสสินค้า'],
    ['Item Name',     'ชื่อสินค้า'],
    ['Warehouse',     'รหัสและชื่อคลัง'],
    ['Group',         'กลุ่มสินค้า เช่น FFG (Finished Goods), FRM (Raw Materials)'],
    ['Current Stock', 'จำนวนคงเหลือปัจจุบัน (Σ in_qty − Σ out_qty)'],
    ['UOM',           'หน่วยนับ เช่น KG, PCS'],
    ['Moving Avg',    'ต้นทุนเฉลี่ยล่าสุด'],
    ['Stock Value',   'จำนวนคงเหลือ × Moving Avg'],
    ['Expire Date',   'วันหมดอายุ (มาจากการ Import หรือคำนวณจาก Shelf Life)'],
  ]),
];

const movementSection = () => [
  h1('5. Movement History (ประวัติการเคลื่อนไหว) + Waterfall'),
  para('บันทึกทุกธุรกรรมรับเข้า/จ่ายออก/โอน ระหว่างคลัง — มี 2 แท็บ'),
  bullet('Transactions — ตารางรายการ + กราฟแนวโน้มรายเดือน'),
  bullet('Waterfall — ดูภาพรวมการไหลของมูลค่าสินค้าเป็นเดือนหรือไตรมาส (ใหม่)'),
  spacer(),

  h2('5.1 แท็บ Transactions — ตัวกรอง'),
  bullet('ช่วงวันที่ (จาก-ถึง)'),
  bullet('คลังสินค้า'),
  bullet('กลุ่มสินค้า'),
  bullet('ประเภท Transaction (รับ / จ่าย / โอน)'),
  bullet('คำค้นหา (รหัสหรือชื่อสินค้า)'),
  spacer(),

  h2('5.2 ประเภท Transaction (Trans Type) ที่พบบ่อย'),
  buildTable([
    { label: 'Code', weight: 0.10 },
    { label: 'Name', weight: 0.45 },
    { label: 'Direction', weight: 0.20 },
    { label: 'หมายเหตุ', weight: 0.25 },
  ], [
    ['0',   'Opening Balance',    'Opening',    'ยอดยกมา'],
    ['15',  'Delivery',            'Out',        'ส่งของออก'],
    ['16',  'Return',              'In',         'ลูกค้าคืนของ'],
    ['18',  'A/P Invoice',         'In',         'รับเข้าจาก AP'],
    ['20',  'Goods Receipt PO',    'In',         'รับของตามใบสั่งซื้อ'],
    ['21',  'Goods Return',        'Out',        'คืนของให้ supplier'],
    ['59',  'Goods Receipt',       'In',         'รับเข้าทั่วไป'],
    ['60',  'Goods Issue',         'Out',        'จ่ายออกทั่วไป'],
    ['67',  'Inventory Transfers', 'Transfers',  'โอนคลัง'],
    ['69',  'Landed Cost',         'Cost',       'ปรับต้นทุนนำเข้า'],
    ['162', 'Inventory Revaluation','Cost',      'ปรับมูลค่าสต็อก'],
  ]),
  spacer(),

  h2('5.3 แท็บ Waterfall (ใหม่) — Cash Flow ของสต็อก'),
  para('Waterfall chart แสดงการไหลของมูลค่าสินค้าเข้า/ออกในแต่ละช่วงเวลา — เหมือนงบ Cash Flow แต่เป็นมูลค่าสต็อก'),
  spacer(),

  h3('ตัวควบคุม'),
  bullet('ช่วงวันที่ — เลือกเดือนเริ่ม-สิ้นสุด (month picker)'),
  bullet('Granularity — รายเดือน / รายไตรมาส'),
  bullet('Mode — "แยก In/Out" (2 แท่ง/ช่วง) หรือ "รวม Net" (1 แท่ง/ช่วง)'),
  bullet('Metric — มูลค่า ฿ / จำนวน Qty'),
  spacer(),

  h3('สิ่งที่เห็นในกราฟ'),
  bullet('แท่งเขียวลอย = In (มูลค่ารับเข้า) — ดันยอดสะสมขึ้น'),
  bullet('แท่งแดงลอย = Out (มูลค่าจ่ายออก) — ลดยอดสะสม'),
  bullet('แท่งน้ำเงินใหญ่ทางขวา = ยอดสุทธิรวม (Net)'),
  bullet('เส้นประน้ำเงิน (step) = Running Total ตามเวลา'),
  spacer(),

  h3('Use Cases ของผู้บริหาร'),
  buildTable([
    { label: 'คำถาม', weight: 0.50 },
    { label: 'วิธีตั้งค่ากราฟ', weight: 0.50 },
  ], [
    ['เปรียบเทียบ Q1 ปีนี้ กับ Q4 ปีที่แล้ว',     'ช่วง 6 เดือน · รายไตรมาส'],
    ['เดือนไหนใช้สินค้ามากที่สุด?',                'รายเดือน · แยก In/Out · ดูแท่งแดง'],
    ['กำไรขาดทุนสต็อกปีนี้?',                       'รายเดือน 12 เดือน · รวม Net'],
    ['การไหลของเงิน 24 เดือนเป็นอย่างไร?',         'รายเดือน · ดูเส้นยอดสะสม'],
  ]),
  spacer(),

  callout('💡 ภาพรวมที่ Waterfall ตอบได้ดี',
    ['• "เดือนที่ Net ติดลบเยอะ" → ใช้สต็อกมากกว่ารับเข้า → ของหดในคลัง',
     '• "Running Total ลดลงเรื่อยๆ" → คลังกำลังว่าง → ต้องเร่งสั่ง',
     '• "Q-ไหน Out สูงผิดปกติ" → ฤดูกาล / โปรโมชั่น → วางแผนล่วงหน้าได้'],
    'EAF1FB'),
];

const alertsSection = () => [
  h1('6. Low Stock Alerts (แจ้งเตือนสต็อกต่ำ) + Expiring Lots'),
  para('หน้านี้แบ่งเป็น 2 แท็บ — "Low Stock" สำหรับสินค้าที่สต็อกต่ำกว่าเกณฑ์ และ "Expiring Lots" สำหรับ lot ที่กำลังจะหมดอายุ'),

  h2('6.1 แท็บ Low Stock — ระดับสถานะ'),
  buildTable([
    { label: 'สถานะ',     weight: 0.18 },
    { label: 'เงื่อนไข',  weight: 0.40 },
    { label: 'ข้อแนะนำ',  weight: 0.42 },
  ], [
    ['Critical', 'จำนวนคงเหลือ < Min Level',                  'สั่งซื้อด่วน'],
    ['Warning',  'Min Level ≤ คงเหลือ < Reorder Point',       'เตรียมสั่งซื้อ'],
    ['Normal',   'อยู่ระหว่าง Reorder Point ถึง Max Level',    'ปกติ'],
    ['Overstock','คงเหลือ > Max Level',                       'พิจารณาเร่งระบาย'],
  ]),
  spacer(),

  h2('6.2 Days Remaining (วันที่จะหมดสต็อก)'),
  para('คำนวณจาก: คงเหลือปัจจุบัน ÷ ค่าเฉลี่ยจ่ายออกต่อวันใน 90 วันล่าสุด'),
  callout('💡 ข้อแนะนำ',
    'ถ้า Days Remaining ต่ำกว่า Lead Time ของกระบวนการสั่งซื้อ → ควรสั่งทันที',
    'EAF1FB'),
  spacer(),

  h2('6.3 แท็บ Expiring Lots — สินค้าใกล้หมดอายุ (ระดับ Lot)'),
  para('แสดงเฉพาะ lot ที่จำนวนวันก่อนหมดอายุ ≤ เกณฑ์ที่เลือก (7 / 30 / 60 / 90 / 180 วัน) — เรียงโดยให้ urgent ที่สุดอยู่บนสุด'),
  bullet('5 KPI ด้านบน: หมดอายุแล้ว · ≤ 30 วัน · 31–60 · 61–90 · มูลค่าที่เสี่ยง ≤ 30 วัน'),
  bullet('Quick-filter ปุ่ม 7 / 30 / 60 / 90 / 180 วัน — เปลี่ยน threshold ได้คลิกเดียว'),
  bullet('Export Excel ของรายการ lot ที่ใกล้หมดอายุ เพื่อใช้วางแผนโปรโมชั่น'),
  spacer(),
  callout('🧾 ต้อง Import sheet "Lot Inventory" ก่อนถึงจะเห็นแท็บนี้',
    'อ่านบทที่ 8 "Lot Inventory" และบทที่ 10 "Data Import" สำหรับวิธีนำเข้าข้อมูล',
    'EAF1FB'),
];

const valuationSection = () => [
  h1('7. Cost & Valuation (ต้นทุนและมูลค่า)'),
  para('หน้านี้แบ่งเป็น 2 แท็บ:'),
  bullet('Overview — มูลค่าสต็อก (Moving Avg / Std Cost) + breakdown รายคลัง/รายกลุ่ม'),
  bullet('Cost Analytics — อัตราส่วนทางการเงินที่สำคัญสำหรับผู้บริหาร'),
  spacer(),

  h2('7.1 แท็บ Overview'),
  para('มุมมองภาพรวมมูลค่าสต็อก'),
  buildTable([
    { label: 'KPI Card', weight: 0.32 },
    { label: 'สูตร', weight: 0.40 },
    { label: 'ตัวอย่าง', weight: 0.28 },
  ], [
    ['Inventory Value (MA)',   'Σ (qty × moving_avg)',         '฿3,496M'],
    ['Inventory Value (Std)',  'Σ (qty × std_cost)',           '฿3,528M'],
    ['Variance (MA vs STD)',   'MA − Std',                     '−฿32M'],
  ]),
  bullet('Value by Item Group — กราฟแท่งแนวนอน (MA vs Std)'),
  bullet('Transaction Value Trend — Area chart 12 เดือน'),
  bullet('Value by Warehouse — ตารางมูลค่าแต่ละคลัง'),
  bullet('Top Price Variance — รายการที่ MA ห่างจาก Std มากที่สุด'),
  bullet('Export Excel — รายตัวสินค้าพร้อม Variance %'),
  spacer(),

  h2('7.2 แท็บ Cost Analytics (ใหม่) — อัตราส่วนทางการเงิน'),
  para('รวมอัตราส่วนที่ผู้บริหารและ CFO ใช้ตัดสินใจระดับกลยุทธ์'),
  spacer(),

  h3('7.2.1 6 KPI หลัก'),
  buildTable([
    { label: 'KPI', weight: 0.27 },
    { label: 'สูตร', weight: 0.38 },
    { label: 'เกณฑ์อ่าน (Food Service)', weight: 0.35 },
  ], [
    ['Inventory Turnover',  'COGS (12mo) / Inventory Value',     '🟢 ≥ 4×/ปี · 🟠 1-4× · 🔴 <1×'],
    ['Days Inventory (DIO)','365 / Turnover',                    '🟢 ≤90d · 🟠 90-180 · 🔴 >180'],
    ['Working Capital',     'Σ inventory value (MA)',            'มูลค่ารวมตอนนี้'],
    ['Carrying Cost (Est)', 'Inventory × Rate%/ปี',              'ดูหัวข้อ 7.3'],
    ['Dead Stock %',        'Dead value / Total inventory',      '🟢 ≤5% · 🟠 5-15% · 🔴 >15%'],
    ['Cost Variance %',     '|MA − Std| / Std × 100',            '🟢 ≤5% · 🟠 5-15% · 🔴 >15%'],
  ]),
  spacer(),

  h3('7.2.2 กราฟทั้ง 4 ตัว'),
  bullet('💰 Cost Composition Donut — สัดส่วนมูลค่าสต็อกของแต่ละกลุ่ม → เห็นว่าเงินจมอยู่กลุ่มไหน'),
  bullet('🔄 Inventory Turnover by Group — แท่งแสดงอัตราหมุนต่อปี (color-coded)'),
  bullet('⚡ Active vs Slow vs Dead by Group — Stacked bar แสดงสุขภาพสต็อกแต่ละกลุ่ม'),
  bullet('📈 Monthly In/Out + Net Cost Flow — แท่งรายเดือน + เส้นสุทธิ'),
  spacer(),

  h3('7.2.3 ตาราง Top 15 — เงินจมมากที่สุด'),
  para('จัดอันดับ "Hold Score" = Inventory Value × (1 / Turnover) → ของแพง × หมุนช้า ขึ้นบนสุด'),
  bullet('แสดง 8 คอลัมน์: # · Item Code · Name · Group · Inv Value · Turnover · DIO · Annual Carry'),
  bullet('คอลัมน์ "Annual Carry" = มูลค่า × Carrying Rate ที่เลือก'),
  bullet('Color-coded Turnover: 🟢 ≥4× · 🟠 1-4× · 🔴 <1×'),
  spacer(),

  h2('7.3 Carrying Cost Rate — คืออะไรและคำนวณอย่างไร'),
  para('เป็นแก่นกลางของ Cost Analytics — ผู้ใช้ต้องเข้าใจ'),
  spacer(),

  callout('💰 Carrying Cost Rate (อัตราต้นทุนการเก็บของ)',
    ['= ต้นทุน "ที่บริษัทเสียไปฟรีๆ" ทุกปี เพียงเพราะมีของอยู่ในคลัง',
     'แสดงเป็น % ของมูลค่าสต็อก/ปี',
     '',
     'ตัวอย่าง: คลังมีของ ฿100M + Rate 22% = เสีย ฿22M/ปี โดยไม่ได้ขายของ'],
    'EAF1FB'),
  spacer(),

  h3('7.3.1 Carrying Cost ประกอบด้วยอะไร (6 ต้นทุนซ่อน)'),
  buildTable([
    { label: 'ประเภทต้นทุน', weight: 0.25 },
    { label: '% โดยประมาณ', weight: 0.15 },
    { label: 'รายละเอียด', weight: 0.60 },
  ], [
    ['💵 Cost of Capital',    '6–12%', 'ดอกเบี้ย / Opportunity Cost — เงินที่จมในของ ถ้าไม่จม เอาไปลงทุนอื่นได้'],
    ['🏭 Storage',            '2–5%',  'ค่าเช่าคลัง · ค่าไฟ · ค่าตู้แช่ · ค่าน้ำ · ค่าทำความสะอาด'],
    ['🛡️ Insurance',          '1–3%',  'ประกันคลัง · ประกันของหาย/ไฟไหม้'],
    ['💸 Taxes',              '1–2%',  'ภาษีโรงเรือน · ภาษีทรัพย์สิน'],
    ['⚙️ Handling',           '2–5%',  'ค่าจ้างพนักงานคลัง · ค่าไฟ forklift · ค่าซ่อมบำรุง'],
    ['🗑️ Risk (อาหารสำคัญ!)', '5–15%', 'ของเสีย · หมดอายุ · ตกรุ่น · ขโมย · write-off'],
    ['รวม',                   '15–40%','= Carrying Cost Rate'],
  ]),
  spacer(),

  h3('7.3.2 ควรใช้ Rate ไหน'),
  para('ระบบให้เลือก 2 option:'),
  buildTable([
    { label: 'Rate', weight: 0.20 },
    { label: 'เหมาะกับ', weight: 0.40 },
    { label: 'เหตุผล', weight: 0.40 },
  ], [
    ['15% (Low)',            'แห้ง · ของไม่เสีย · บรรจุภัณฑ์ · เครื่องเทศ', 'ไม่ต้องตู้แช่ + ความเสี่ยง write-off ต่ำ'],
    ['22% (Industry Avg) ⭐', 'Food Service ทั่วไป · ของกระป๋อง · แช่เย็น',  'ค่าตู้แช่ + ความเสี่ยงปานกลาง'],
  ]),
  spacer(),

  h3('7.3.3 ตัวอย่างการใช้ตัดสินใจ'),
  para('Carrying Cost ช่วยตอบคำถามผู้บริหารหลายอย่าง:'),
  bullet('การสั่งซื้อ: Supplier เสนอ discount 10% ถ้าซื้อ 2× — คุ้มหรือไม่? → ถ้า DIO เพิ่ม 6 เดือน → +11% Carrying → ไม่คุ้ม'),
  bullet('การ Write-off: Dead Stock ฿1M เก็บอีก 1 ปี = +฿220K Carry Cost → Write-off ตอนนี้ถูกกว่า'),
  bullet('การลด Stock: ลดสต็อก 20% = ลด Carrying Cost 20%/ปี'),
  bullet('การหา "เงินจม": ดู Top 15 Holding Cost → priority list การระบาย'),
  spacer(),

  callout('🎯 สรุป',
    ['Carrying Cost = ต้นทุนที่บริษัทเสียไป "ฟรีๆ" ต่อปี เพื่อแลกกับ "การมีของในคลัง"',
     'ยิ่งของอยู่นาน ยิ่งเสียมาก — KPI หลักของการบริหารสต็อกสมัยใหม่'],
    'E8F8EF'),
];

// ── Section 8 (NEW) — Lot Inventory ─────────────────────────────────────────
const lotInventorySection = () => [
  h1('8. Lot Inventory (สต็อกตาม Lot)'),
  para('ฟีเจอร์นี้แยกสต็อกของสินค้าเดียวกันออกเป็นรายการ lot (batch) — เพราะแต่ละ lot มี "วันหมดอายุ" และ "ต้นทุน" ของตัวเอง การวิเคราะห์ระดับ lot จึงแม่นยำกว่าการมองรวมเป็นสินค้าตัวเดียว'),
  spacer(),

  h2('8.1 ทำไมต้องมี Lot Tracking'),
  para('สมมติสินค้า "Smoked Salmon Sliced 100g" มี 27 lot คงเหลือในคลังเดียวกัน — แต่ละ lot อาจหมดอายุต่างกันตั้งแต่ ต.ค. 2025 ถึง ก.พ. 2027'),
  bullet('ถ้าดูแบบ "สินค้ารวม" จะเห็นเป็น 1 บรรทัด ใช้ expire_date เดียว → ซ่อนความเสี่ยงของ lot ที่ใกล้หมดอายุ'),
  bullet('ถ้าดูแบบ "Lot" จะเห็น 27 บรรทัด → รู้ทันทีว่าควรหยิบ lot ไหนก่อน (FEFO) และวางแผนโปรโมชั่นได้ถูกต้อง'),
  spacer(),

  h2('8.2 หน้า Lot Inventory (เมนู /lots)'),
  para('หน้าใหม่ที่เพิ่มในเมนู Sidebar — ใช้ icon "Layers"'),
  bullet('6 Aging cards ด้านบน: หมดอายุแล้ว · ≤ 30 · 31–60 · 61–90 · 91–180 · > 180 วัน'),
  bullet('คลิก card → กรองตารางตามช่วงนั้นทันที'),
  bullet('ตาราง FEFO เรียงตามวันหมดอายุน้อยไปมาก'),
  bullet('ฟิลเตอร์: คลัง / กลุ่มสินค้า / ค้นหารหัสหรือ batch'),
  bullet('Export Excel ตามที่กรองอยู่'),
  spacer(),

  h2('8.3 Aging Matrix (ใน Reports → FEFO Pick List)'),
  para('ตารางสรุประดับ aging-bucket แสดง Items, Lots, Total Value, Share ของแต่ละช่วงวันหมดอายุ'),
  bullet('Matrix นิ่งเสมอ — แสดงภาพรวมทั้งหมดของคลัง ไม่หดตามฟิลเตอร์'),
  bullet('คลิกแถวเพื่อกรอง "เฉพาะช่วงนั้น" (exact bucket — ไม่ใช่ ≤X วัน)'),
  bullet('แถวที่กำลังกรองอยู่จะมีเส้นขอบซ้ายและป้าย "กรองอยู่"'),
  bullet('คลิกแถวเดิมซ้ำ หรือกดปุ่ม "ล้างฟิลเตอร์ช่วง" เพื่อยกเลิก'),
  spacer(),

  callout('🎯 วิธีใช้ Aging Matrix อ่านสุขภาพคลัง',
    ['ถ้า "หมดอายุแล้ว" share สูง → ของจมในคลังต้องเร่ง Write-off',
     'ถ้า "≤ 30 วัน" share สูง → ต้องเร่งโปรโมชั่น/ลดราคา',
     'การกระจายแบบ "พีระมิด" (ใกล้หมด<กลาง<ไกล) = สุขภาพดี',
     'แบบ "นาฬิกาทราย" (หมดอายุ+ของใหม่เยอะ ตรงกลางขาด) = วิกฤต'],
    'FFF3CD'),
  spacer(),

  h2('8.4 โครงสร้างข้อมูล Lot'),
  buildTable([
    { label: 'ฟิลด์',       weight: 0.25 },
    { label: 'ความหมาย',    weight: 0.45 },
    { label: 'ตัวอย่าง',     weight: 0.30 },
  ], [
    ['Item Code',         'อ้างอิงรายการสินค้า',                       'F7000400100'],
    ['Warehouse',         'คลังที่เก็บ',                                'FS-FG01'],
    ['BatchNum Lot',      'รหัส lot จาก SAP (มัก = timestamp รับเข้า)', '2025.08.15 16:39:59'],
    ['Quantity',          'จำนวนคงเหลือใน lot นั้น',                    '76,900'],
    ['Total Amount',      'มูลค่ารวมของ lot',                           '132,268'],
    ['Unit Cost',         'คำนวณอัตโนมัติ = Amount / Qty',              'อัตโนมัติ'],
    ['InDate',            'วันที่รับเข้าคลัง',                          '2025-08-15'],
    ['PrdDate',           'วันที่ผลิต',                                 '2025-08-09'],
    ['ExpDate',           'วันที่หมดอายุของ lot นี้',                   '2026-08-09'],
    ['ToDate',            'วัน snapshot (as-of date)',                  '2026-03-31'],
  ]),
  spacer(),

  h2('8.5 Snapshot vs Transactional'),
  para('ข้อมูล Lot เป็นแบบ "Snapshot" — เก็บภาพรวมของสต็อก ณ วันที่กำหนด (ToDate) ไม่ใช่ tracking การเคลื่อนไหวรายธุรกรรม'),
  bullet('การ Import lot ครั้งใหม่ที่ ToDate เดียวกัน → ระบบจะ "ทับ" snapshot เดิม'),
  bullet('การ Import lot ที่ ToDate ต่างกัน → ระบบเก็บ snapshot หลายชุดเป็นประวัติ'),
  spacer(),

  callout('🎯 จุดสำคัญ',
    ['Lot Inventory ใช้คู่กับ Transactions — Transactions = การเคลื่อนไหว, Lot = ภาพรวม ณ วันที่กำหนด',
     'ทุกครั้งที่ Import lot ใหม่ ระบบจะ refresh กราฟ Aging, VV Matrix แบบ By Lot, และ FEFO Pick List โดยอัตโนมัติ'],
    'EAF1FB'),
];

const reportsSection = () => [
  h1('9. Management Reports'),
  para('รวมรายงานเชิงวิเคราะห์ที่ใช้ตัดสินใจระดับบริหาร เปิดได้จากเมนู Reports — มี 6 แท็บ'),
  buildTable([
    { label: 'แท็บ', weight: 0.20 },
    { label: 'จุดประสงค์', weight: 0.55 },
    { label: 'ใช้บ่อย', weight: 0.25 },
  ], [
    ['VV Matrix',         'จัดอันดับ A/B/C ของสินค้า ด้วย Value × Validity (3 modes)', 'รายสัปดาห์'],
    ['Group Analysis',    'วิเคราะห์ตามกลุ่มสินค้า — A/B/C ระดับ lot × ยอด Move',     'รายเดือน'],
    ['Trends & Compare',  'เปรียบเทียบ MoM / QoQ / YoY + Anomaly detection',           'รายเดือน'],
    ['Slow Moving',       'หา Dead Stock / Slow Moving',                                'รายเดือน'],
    ['Inventory Turnover','อัตราหมุนเวียน (Turnover Ratio) ต่อปี',                       'รายไตรมาส'],
    ['FEFO Pick List',    'ลำดับการหยิบ lot ตามวันหมดอายุ + Aging Matrix',              'รายวัน'],
  ]),
  spacer(),

  // ── 9.1 VV Matrix ──────────────────────────────────────────────────────────
  h2('9.1 VV Matrix — Value × Validity'),
  para('เครื่องมือคัดกรองสินค้าที่มีความเสี่ยง พิจารณา 2 มิติพร้อมกัน:'),
  bullet('Value Score (1–5) — อันดับมูลค่าสต็อก (top X% = score 5)'),
  bullet('Validity Score (1–5) — ตามจำนวนวันก่อนหมดอายุ'),
  paraMixed([
    'สูตร: ',
    { text: 'Final Score = ValueScore × (ValidityScore / 5)^α', bold: true, color: COLOR_PRIMARY },
  ]),
  para('ค่า α ปรับได้ที่ Settings (1=Linear, 2=Moderate, 3=Aggressive — แนะนำ α=3 สำหรับอาหาร)', { italics: true }),
  spacer(),

  h3('3 Analysis Modes (ใหม่)'),
  para('VV Matrix มี 3 mode ให้เลือก แต่ละ mode ตอบคำถามต่างกัน — ผู้ใช้เลือกตามคำถามที่ต้องการตอบ'),
  buildTable([
    { label: 'Mode', weight: 0.22 },
    { label: 'วิธีคิด',  weight: 0.40 },
    { label: 'เหมาะใช้กับ', weight: 0.38 },
  ], [
    ['🧾 By Lot',
     '1 lot = 1 หน่วยให้คะแนน (1 SKU กระจาย A/B/C ได้พร้อมกัน)',
     'FEFO Pick · Write-off · GMP/HACCP audit'],
    ['⚠️ Item — Worst-Case',
     'Validity = lot ที่ใกล้หมดที่สุด · Value = ผลรวม',
     'Risk Alert · หยุดสั่ง SKU เสี่ยง · Food safety'],
    ['⚖️ Item — Weighted',
     'Validity = ถ่วงน้ำหนักด้วยมูลค่า lot',
     'Pricing · เจรจา Supplier · Budget'],
  ]),
  spacer(),

  callout('💡 Lot-Based เป็นพื้นฐานของทุก mode',
    ['• ระบบใช้ inventory_lots.expire_date จาก lot จริง — ไม่ใช่ placeholder จาก items',
     '• Item modes รวม lot ขึ้นมา แต่ "ความจริง" คือ Lot mode',
     '• แนะนำ: ใช้ Lot mode เป็นหลัก สลับไป Item modes เมื่อต้องการสรุประดับ SKU'],
    'E8F8EF'),
  spacer(),

  h3('ฟิลเตอร์ในหน้า VV Matrix'),
  bullet('Class: A / B / C'),
  bullet('Group: 4 กลุ่มหลัก'),
  bullet('FS Category: 25 หมวด NSL'),
  bullet('Warehouse (Lot mode เท่านั้น)'),
  bullet('Risk Flag: Critical / High Expiry'),
  bullet('Days Left ≤ N — quick chips (7/30/60/90/180)'),
  bullet('Min Stock Value'),
  bullet('Search'),
  spacer(),

  h3('การอ่าน Scatter Chart'),
  para('แต่ละจุดในกราฟอาจเป็น "หลายรายการที่มีคะแนนเดียวกัน" — ระบบ:'),
  bullet('ขนาดจุด = จำนวนสินค้าที่อยู่ตำแหน่งนั้น (sqrt scale)'),
  bullet('เลขในจุด = จำนวนรายการ (เมื่อ > 1)'),
  bullet('Tooltip → แสดง 5 ตัวอย่าง + count รวม'),
  bullet('สี: A=เขียว B=ส้ม C=แดง'),
  bullet('คลิกที่จุด (ใหม่) → กรองตารางด้านล่างให้แสดงเฉพาะรายการในช่อง (Value, Validity) ที่คลิก · คลิกซ้ำ = ยกเลิก'),
  spacer(),

  h3('การแสดงตาราง + Pagination (ใหม่)'),
  para('เพื่อความเร็วในการใช้งาน ตารางรายการ VV Matrix จะ "ไม่แสดงทั้งหมดทันที" เมื่อเข้าหน้าครั้งแรก:'),
  bullet('หน้าเริ่มต้น → แสดง Empty State พร้อม shortcut 3 ปุ่ม: Class C / Critical / Days Left ≤ 30'),
  bullet('User ต้องกด filter อย่างน้อย 1 อย่าง (Class / Group / Risk / Days / Search / คลิกจุดในกราฟ) → ตารางจะแสดง'),
  bullet('แสดง 15 รายการต่อหน้า · มี Pagination ด้านล่างพร้อมจำนวนรวม "X-Y จาก N รายการ"'),
  bullet('เมื่อเปลี่ยน filter ระบบจะ reset กลับมาหน้า 1 อัตโนมัติ'),
  spacer(),

  callout('🎯 เคล็ดลับ — เลือกช่องที่น่ากังวลที่สุดก่อน',
    ['• คลิกที่ช่อง (Value=5, Validity=1) → ของแพง ที่หมดอายุ → CRITICAL urgent sale',
     '• คลิกที่ช่อง (Value=4-5, Validity=2-3) → ของแพง ที่เริ่มเสี่ยง → ติดตามใกล้ชิด',
     '• คลิกที่ช่อง (Value=1-2, Validity=5) → ของถูก ที่ยังสด → ของปกติ ไม่ต้องเร่ง'],
    'FFF3CD'),
  spacer(),

  // ── 9.2 Group Analysis ─────────────────────────────────────────────────────
  h2('9.2 Group Analysis (ใหม่)'),
  para('วิเคราะห์ตามกลุ่มสินค้า — ตอบคำถามผู้บริหารระดับกลุ่ม โดยใช้ VV ระดับ lot'),
  spacer(),

  h3('คำถามที่ตอบได้'),
  buildTable([
    { label: 'คำถาม', weight: 0.55 },
    { label: 'ดูที่ไหน', weight: 0.45 },
  ], [
    ['กลุ่มไหน Move เยอะที่สุด?',           'KPI "กลุ่มที่ Move มากสุด" + ตารางเรียงตาม Out'],
    ['กลุ่มไหนมีของแพง (Class A) เยอะ?',     'กราฟ VV Class Distribution'],
    ['กลุ่มไหนมีของใกล้หมด (Class C) เยอะ?', 'กรอง "มี Class C" + ดูคอลัมน์ C lots'],
    ['กลุ่มไหนหมุนช้า — ของค้าง?',           'คอลัมน์ Turnover สีแดง (<1x/ปี)'],
    ['กลุ่มไหนคือตัวขับเคลื่อนยอด?',         'Move Share %'],
  ]),
  spacer(),

  h3('คอลัมน์ในตาราง Group Performance'),
  bullet('SKUs — จำนวนรหัสสินค้าไม่ซ้ำในกลุ่ม'),
  bullet('Lots — จำนวนล็อตทั้งหมด (analytical unit)'),
  bullet('VV by Lot (A/B/C) — chip + แถบสัดส่วน'),
  bullet('Stock Value — ผลรวมมูลค่าคลัง'),
  bullet('In / Out — มูลค่ารับ-จ่ายในช่วง 6/12/24 เดือน'),
  bullet('Turnover — อัตราหมุนต่อปี (annualized)'),
  bullet('Move Share — % สัดส่วนการใช้สินค้าจากยอดรวม'),
  spacer(),

  callout('🎯 Use Case สำคัญ',
    ['กลุ่มที่ Stock Value สูง + Turnover ต่ำ + Class C เยอะ',
     '= ของค้างใกล้หมดอายุ → เร่งระบาย / ลดการสั่ง'],
    'FFF3CD'),
  spacer(),

  // ── 9.3 Trends & Compare ───────────────────────────────────────────────────
  h2('9.3 Trends & Compare (ใหม่)'),
  para('Deep-dive analysis สำหรับการเปรียบเทียบช่วงเวลา — MoM, QoQ, YoY'),
  spacer(),

  h3('Period Selector'),
  bullet('เลือกเดือน — เป็นเดือนหลักที่จะวิเคราะห์'),
  bullet('Toggle: MoM (เดือนก่อนหน้า) / QoQ (ไตรมาสก่อนหน้า) / YoY (ปีก่อนหน้า)'),
  spacer(),

  h3('สิ่งที่แสดง'),
  bullet('4 Delta Cards: Out / In / Net / Tx + อัตราการเปลี่ยน % พร้อมลูกศร'),
  bullet('Bar Chart 24 เดือนล่าสุด — In vs Out'),
  bullet('YoY Anchor Table — เดือนเดียวกัน 3 ปีย้อนหลัง'),
  bullet('Group Comparison Table — แต่ละกลุ่มขยับขึ้น/ลงเทียบ baseline'),
  bullet('Anomaly Callout — เดือนที่ Out เบี่ยงจากค่าเฉลี่ย 6 เดือนเกิน 50%'),
  spacer(),

  h3('ตัวอย่างการใช้งาน'),
  buildTable([
    { label: 'คำถาม', weight: 0.45 },
    { label: 'วิธีตั้งค่า', weight: 0.55 },
  ], [
    ['เดือนนี้โตเทียบเดือนก่อนหรือไม่?',          'เลือกเดือนปัจจุบัน + MoM'],
    ['ไตรมาสนี้เทียบไตรมาสก่อน?',                 'เลือกเดือนสุดท้ายของ Q + QoQ'],
    ['มี.ค.26 โตจาก มี.ค.25 เท่าไร?',              'เลือก มี.ค.26 + YoY'],
    ['เดือนไหนผิดปกติในรอบปี?',                    'ดู Anomaly Callout'],
  ]),
  spacer(),

  // ── 9.4 Slow Moving (Hybrid Mode) ──────────────────────────────────────────
  h2('9.4 Slow Moving Items — Hybrid Mode (ใหม่)'),
  para('รายการสินค้าที่ไม่มีการจ่ายออกมานานหรือมีอัตราหมุนเวียนต่ำ — รวมถึงสินค้าที่ "ดูเหมือนปกติ" แต่ซ่อน lot เก่าค้างไว้ (FEFO Violation)'),
  spacer(),

  h3('การจำแนกระดับ SKU (Movement Status)'),
  bullet('Dead Stock — ไม่มีการเคลื่อนไหวเลยใน 180 วัน'),
  bullet('Slow Moving — เคลื่อนไหวบ้างแต่นาน ๆ ครั้ง'),
  bullet('Normal — มีการเคลื่อนไหวสม่ำเสมอ'),
  spacer(),

  h3('FEFO Violation Detection (Hybrid)'),
  para('แม้ SKU จัดอยู่ในกลุ่ม "Normal" ก็อาจมี lot เก่าค้างที่ทีมไม่ได้หยิบออกก่อน — ระบบ join inventory_lots ล่าสุดเพื่อหาอายุของ lot ที่เก่าที่สุดในแต่ละ (item × warehouse):'),
  bullet('Oldest Lot ≥ 180 วัน + มี lot ใหม่กว่าในคลังเดียวกัน → ติด flag "⚠️ FEFO Violation"'),
  bullet('คอลัมน์ "Lot เก่าสุด" — แสดงจำนวนวันของ lot ที่เก่าที่สุด + (จำนวน lots)'),
  bullet('Filter "FEFO Violations only" — toggle แสดงเฉพาะรายการที่ละเมิด FEFO'),
  bullet('KPI Card "FEFO Violations" — สีม่วง · จำนวน + มูลค่ารวม'),
  spacer(),

  h3('Drill-Down ดูทุก Lot ของรายการ (ใหม่)'),
  para('คลิกที่แถวใดในตารางจะเปิด modal แสดง lot ทั้งหมดของ (สินค้า × คลัง) นั้น เรียงตาม FEFO:'),
  bullet('Summary 5 ตัว: Lots / Total Qty / Total Value / Oldest Lot (เก่าสุด) / At Risk'),
  bullet('Banner "FEFO Violation" สีม่วง เมื่อมี lot อายุ ≥ 180 วัน ทั้งที่มี lot ใหม่กว่า'),
  bullet('ตาราง 8 คอลัมน์: Batch · Qty · Unit Cost · Value · In Date · Expire Date · Days Left + แสดงสี / Status'),
  bullet('Lot ที่อายุ ≥ 180d ติดป้าย "⚠️ OLD" อัตโนมัติ'),
  bullet('กด Esc หรือคลิกพื้นที่นอก modal เพื่อปิด'),
  spacer(),

  callout('🟣 FEFO Violation — ภัยเงียบที่ DASHBOARD ไม่เห็น',
    ['ตัวอย่าง NSL: ตรวจพบ ~48 รายการที่เป็น "Normal" แต่ซ่อน lot เก่าค้าง',
     'การแก้ไข: ทีมคลังต้องหยิบ lot เก่าก่อน (First-Expired-First-Out)',
     'ผลกระทบ: ลดความเสี่ยงเขียน off + รักษามูลค่าสต็อก'],
    'F3E8FF'),
  spacer(),

  // ── 9.5 Inventory Turnover ─────────────────────────────────────────────────
  h2('9.5 Inventory Turnover'),
  para('อัตราการหมุนเวียนสต็อกต่อปี (Annual COGS / Average Inventory Value)'),
  bullet('Turnover Ratio สูง = สินค้าหมุนเร็ว ดี'),
  bullet('Days on Hand = 365 / Turnover Ratio'),
  bullet('Color-coded: เขียว ≥ 4x · ส้ม 1–4x · แดง < 1x (ของค้าง)'),
  bullet('Chart "Top 20 Items by Turnover Ratio" — hover ที่แท่งกราฟแสดงทั้งรหัสและชื่อสินค้า (ใหม่)'),
  bullet('ตารางด้านล่างเรียงเหมือนกับ chart เพื่อให้เลื่อนหาได้ง่าย'),
  spacer(),

  // ── 9.6 FEFO Pick List ─────────────────────────────────────────────────────
  h2('9.6 FEFO Pick List + Aging Matrix'),
  para('First-Expired First-Out — ลำดับการหยิบ lot ตามวันหมดอายุน้อย → มาก'),
  bullet('Aging Matrix ด้านบน: สรุปจำนวน lot/มูลค่า ตามช่วง aging'),
  bullet('คลิกแถว Matrix = กรอง "เฉพาะช่วงนั้น" (ดูบทที่ 8.3)'),
  bullet('ตารางด้านล่าง: แต่ละ (สินค้า × คลัง) → lot ทั้งหมดเรียง FEFO'),
  bullet('ฟิลเตอร์ครบ: Class · Lots count · Days ≤ · Min Value · มี Expired · เรียง'),
  bullet('Export Excel เพื่อแจกทีมคลังใช้หยิบของจริง'),
];

const importSection = () => [
  h1('10. Data Import (นำเข้าข้อมูลจาก Excel)'),
  para('ระบบรองรับการนำเข้าข้อมูลทั้งหมดผ่านไฟล์ Excel เพียงไฟล์เดียว ที่มี 6 Sheet หลัก (รวม Lot Inventory)'),

  h2('10.1 ขั้นตอน 4 Step'),
  num('Step 1 — กดปุ่ม "โหลด All-in-One Template" เพื่อดาวน์โหลด Excel ตัวอย่าง'),
  num('Step 2 — กรอกข้อมูลในแต่ละ Sheet (ดูคำอธิบายและ dropdown ในแต่ละ sheet)'),
  num('Step 3 — กลับมาที่หน้านี้ ลากไฟล์มาวางหรือกดอัปโหลด — ระบบจะ preview ให้ตรวจ'),
  num('Step 4 — เลือก Sheet ที่ต้องการนำเข้า (toggle) แล้วกดปุ่ม "เริ่ม Import"'),
  spacer(),

  h2('10.2 Sheet ที่ระบบรองรับ'),
  buildTable([
    { label: 'Sheet',           weight: 0.20 },
    { label: 'ข้อมูล',           weight: 0.45 },
    { label: 'จำเป็น?',          weight: 0.15 },
    { label: 'Mode',             weight: 0.20 },
  ], [
    ['Warehouses',             'รหัสและชื่อคลังสินค้า',                    'ครั้งแรก',  'Upsert'],
    ['Item Groups',            'รหัสและชื่อกลุ่ม + Shelf Life',            'ครั้งแรก',  'Upsert'],
    ['Items',                  'รายการสินค้าทั้งหมด + FS Category',        'ทุกครั้ง',   'Upsert'],
    ['Thresholds',             'Min/ROP/Max ของแต่ละสินค้า/คลัง',          'ตามต้องการ', 'Upsert'],
    ['Transactions',           'การเคลื่อนไหวรับ/จ่าย/โอน',                'ทุกครั้ง',   'Replace หรือ Append'],
    ['Lot Inventory (ใหม่)',   'สต็อกตาม lot — มี expire/cost ของ lot นั้น', 'ทุกครั้ง',   'Snapshot Replace'],
  ]),
  spacer(),

  callout('🆕 FS Category — คอลัมน์เพิ่มเติมใน Items',
    ['NSL Food Service มีการจัดหมวดสินค้าภายในที่ละเอียดกว่า Group Code (4 กลุ่ม)',
     'FS Category มี 25 หมวด เช่น Fish-Salmon, Beef, Pork, Processed Foods-Smoked Salmon, Crossiant, Ready to Cook',
     'ระบบใช้คอลัมน์นี้ในการกรอง/วิเคราะห์เพิ่มเติมในรายงานต่าง ๆ'],
    'E8F8EF'),
  spacer(),

  h2('10.3 รูปแบบไฟล์ Excel ที่รองรับ'),
  para('Parser ของระบบรองรับ 2 รูปแบบ:'),
  bullet('Styled template (Warehouses / Item Groups / Items / Thresholds / Transactions) — header อยู่แถวที่ 4 มี banner สีน้ำเงินด้านบนและ description row ใต้ header'),
  bullet('Raw layout (Lot Inventory) — header อยู่แถวที่ 1 ตรง ๆ ตามที่ SAP export ออกมา'),
  para('ระบบจะ auto-detect ว่า sheet ใดใช้ layout ไหน — ไม่ต้องตั้งค่าเอง', { italics: true }),
  spacer(),

  callout('⚠️ Replace vs Append สำหรับ Transactions',
    ['Replace All — ลบ Transactions เดิมทั้งหมดก่อน Import (เหมาะกับการล้างข้อมูลใหม่)',
     'Append Only — เพิ่มเฉพาะรายการใหม่ (ระบบป้องกันรายการซ้ำด้วย unique key)'],
    'FFF3CD'),
  spacer(),

  callout('🧾 Lot Inventory — Snapshot Replace',
    ['ระบบจะลบ lot ของ snapshot_date (ToDate) เดียวกันที่มีอยู่ก่อน แล้ว insert ใหม่',
     'ถ้า Import lot ที่ ToDate ใหม่ ระบบจะเก็บ snapshot เก่าและใหม่ไว้คู่กันเป็นประวัติ',
     'ไม่กระทบ Transactions, Items, หรือ data อื่น'],
    'EAF1FB'),
  spacer(),

  h2('10.4 Shelf Life อัตโนมัติ (ลำดับการคำนวณ Expire Date)'),
  num('ใช้ Expire Date จาก Lot Inventory โดยตรง (แม่นยำสุด)'),
  num('ถ้าไม่มี lot → ใช้ Expire Date จาก Items'),
  num('ถ้าว่าง → ใช้ Shelf Life ของกลุ่มสินค้า (Item Groups)'),
  num('ถ้ากลุ่มไม่ตั้ง → ใช้ค่า Global Fallback ที่ Settings (default 365 วัน)'),
  spacer(),

  callout('🚨 Danger Zone',
    ['ปุ่ม "Clear All Data" จะลบ Lot Inventory, Transactions, Items, Thresholds, Item Groups, และ Warehouses ทั้งหมด',
     'ใช้สำหรับเริ่มต้นโครงการใหม่เท่านั้น ห้ามใช้ระหว่างปฏิบัติงาน'],
    'F8D7DA'),
];

const settingsSection = () => [
  h1('11. Settings (ตั้งค่า)'),
  para('หน้าตั้งค่าระบบ ส่วนใหญ่ใช้ครั้งเดียวตอน setup เริ่มต้น'),

  h2('11.1 System Configuration'),
  bullet('Active Item Threshold (Days) — สินค้าที่ไม่เคลื่อนไหวเกินกี่วันถือว่า Inactive (default 90 วัน)'),
  spacer(),

  h2('11.2 VV Matrix — Scoring Configuration'),
  para('ปรับเกณฑ์การให้คะแนน Value Score, Validity Score และ Class แบ่ง A/B/C'),
  spacer(),

  h3('Validity Score Thresholds (วันก่อนหมดอายุ)'),
  buildTable([
    { label: 'Score',    weight: 0.15 },
    { label: 'เงื่อนไข', weight: 0.55 },
    { label: 'ค่า default', weight: 0.30 },
  ], [
    ['5', 'มากกว่า X วัน', '180 วัน'],
    ['4', 'มากกว่า X วัน', '90 วัน'],
    ['3', 'มากกว่า X วัน', '60 วัน'],
    ['2', 'มากกว่า X วัน', '30 วัน'],
    ['1', 'น้อยกว่าหรือเท่ากับ Score 2', 'auto'],
    ['—', 'ไม่มี Expire Date → ให้ Score', '3'],
  ]),
  spacer(),

  h3('Value Score Percentile Bands'),
  para('จัดลำดับสินค้าตามมูลค่าสต็อกจากสูงสุด แล้วกำหนดว่า top X% ได้ score เท่าใด'),
  buildTable([
    { label: 'Score',    weight: 0.15 },
    { label: 'ช่วง percentile', weight: 0.55 },
    { label: 'ค่า default', weight: 0.30 },
  ], [
    ['5', 'top 0% ถึง P5', '20%'],
    ['4', 'P5 ถึง P4',     '40%'],
    ['3', 'P4 ถึง P3',     '60%'],
    ['2', 'P3 ถึง P2',     '80%'],
    ['1', 'ที่เหลือ',       'auto'],
  ]),
  spacer(),

  h3('Exponential Factor (α)'),
  para('ค่าที่ควบคุมความรุนแรงในการลงโทษ Validity ต่ำ — ค่า α ยิ่งสูง ยิ่งลงโทษหนัก'),
  buildTable([
    { label: 'α',       weight: 0.15 },
    { label: 'พฤติกรรม', weight: 0.50 },
    { label: 'แนะนำใช้กับ', weight: 0.35 },
  ], [
    ['1', 'Linear — เหมือน weighted average', 'สินค้าทั่วไป'],
    ['2', 'Moderate — สมดุล (ค่า default)',    'ทั่วไป'],
    ['3', 'Aggressive — ลงโทษ validity ต่ำหนัก', 'อาหาร / ของสด'],
  ]),
  spacer(),

  h3('Exp Class Thresholds'),
  bullet('Class A — Exp Score ≥ 3.5 (default)'),
  bullet('Class B — Exp Score ≥ 1.5 (default)'),
  bullet('Class C — น้อยกว่านั้น'),
  spacer(),

  h3('Risk Flagging Rule'),
  bullet('CRITICAL — Value Score ≥ 4 AND Validity Score ≤ 2'),
  bullet('HIGH RISK — Validity Score ≤ 2 (ทุกระดับ value)'),
  spacer(),

  h2('11.3 Shelf Life ตามกลุ่มสินค้า'),
  para('กำหนด Shelf Life แยกแต่ละ Item Group เพื่อให้ระบบคำนวณ Expire Date อัตโนมัติเมื่อ Excel ไม่มีค่า'),
  bullet('FFG (Finished Goods) — แนะนำ 365 วัน'),
  bullet('FRM (Raw Materials) — แนะนำ 548 วัน (1.5 ปี)'),
  bullet('FBY (By Product) — แนะนำ 730 วัน (2 ปี)'),
  bullet('FPKG (Packaging) — แนะนำ 365 วัน'),
  spacer(),

  h2('11.4 Stock Threshold Settings'),
  para('กำหนด Min / Reorder Point / Max ต่อสินค้า/คลัง — ใช้กับ Low Stock Alerts'),
  bullet('Min Level — ต่ำกว่านี้ระบบเตือน Critical'),
  bullet('Reorder Point — จุดที่ควรเริ่มสั่งซื้อ'),
  bullet('Max Level — เกินนี้ถือว่า Overstock'),
];

const userMgmtSection = () => [
  h1('12. User Management (จัดการผู้ใช้)'),
  para('Admin จัดการผู้ใช้ภายในบริษัทตนเอง ส่วน Super Admin เห็นได้ทุกบริษัท'),

  h2('12.1 เพิ่มผู้ใช้ใหม่'),
  num('กดปุ่ม "เพิ่มผู้ใช้งาน" มุมขวาบน'),
  num('กรอกชื่อ-นามสกุล, Email, Role, บริษัท'),
  num('กดปุ่ม "สร้างผู้ใช้" — ระบบจะสร้างรหัสผ่านสุ่มให้'),
  num('คัดลอกรหัสผ่านส่งให้ผู้ใช้นำไป login ครั้งแรก'),
  para('ผู้ใช้ใหม่จะถูกบังคับให้เปลี่ยนรหัสผ่านในการ login ครั้งแรก — รหัสที่ admin ตั้งให้เป็นเพียงรหัสชั่วคราว (ดูข้อ 2.1)', { italics: true, color: COLOR_MUTED }),
  spacer(),

  h2('12.2 แก้ไข Role / สถานะ Active'),
  num('กดปุ่ม "Edit" หลัง row ของผู้ใช้'),
  num('เลือก Role ใหม่ + ตั้ง Active/Inactive'),
  num('กดปุ่มยืนยัน (✓)'),
  spacer(),

  h2('12.3 Reset รหัสผ่าน (รายเดียว)'),
  num('กดไอคอนรูปกุญแจ 🔑 หลัง row ของผู้ใช้'),
  num('ระบบสุ่มรหัสใหม่ให้ — สามารถ regenerate ได้'),
  num('กด "Reset รหัสผ่าน" → คัดลอกรหัสใหม่ส่งให้เจ้าตัว'),
  para('ผู้ใช้รายนั้นจะถูกบังคับให้เปลี่ยนรหัสผ่านในการ login ครั้งถัดไป — ไม่ต้องกังวลว่ารหัสที่ admin เห็นจะหลุดออกไป', { italics: true, color: COLOR_MUTED }),
  spacer(),

  h2('12.4 Bulk Reset Password (Reset แบบกลุ่ม — ใหม่)'),
  para('Admin สามารถ Reset รหัสผ่านของผู้ใช้หลายคนพร้อมกัน (เช่น กรณีต้อง onboard ทีมใหม่ หรือเหตุการณ์ระดับ security incident)'),
  num('ติ๊ก checkbox หน้าผู้ใช้ที่ต้องการ Reset (เลือกหลายรายการได้) — Super Admin จะไม่สามารถเลือกได้'),
  num('Toolbar สีน้ำเงินจะปรากฏด้านบนพร้อมจำนวนที่เลือก'),
  num('กดปุ่ม "Reset Password (N)" → modal แสดงรายการที่จะถูก Reset'),
  num('ระบบสุ่มรหัสผ่านร่วม 1 ชุดให้ทุกคน (regenerate / copy ได้)'),
  num('กดปุ่ม "Reset N ผู้ใช้" — ระบบดำเนินการขนาน รวดเร็ว'),
  num('คัดลอกรหัสผ่านชั่วคราวส่งให้แต่ละคนแบบ private'),
  para('ผู้ใช้ทุกคนที่ถูก Reset จะต้องเปลี่ยนรหัสผ่านในการ login ครั้งถัดไป (force-change flow ที่ข้อ 2.1)', { italics: true, color: COLOR_MUTED }),
  spacer(),

  callout('💡 สังเกตได้จาก UI — "รอเปลี่ยนรหัสผ่าน"',
    ['ในตาราง User Management จะเห็น chip สีส้ม "⚠ รอเปลี่ยนรหัสผ่าน" หน้าผู้ใช้ที่ admin เพิ่ง reset',
     'chip จะหายไปเองหลังผู้ใช้คนนั้น login + เปลี่ยนรหัสสำเร็จ',
     'ใช้ตรวจสอบว่า user คนไหนยังไม่ได้ login มาเปลี่ยนรหัส'],
    'F3E8FF'),
  spacer(),

  h2('12.5 ลบผู้ใช้ (Super Admin เท่านั้น)'),
  num('กดไอคอนรูปถังขยะ 🗑️ หลัง row ของผู้ใช้'),
  num('พิมพ์ Email ของผู้ใช้ให้ตรงเป๊ะเพื่อยืนยัน'),
  num('กด "ลบถาวร" — ระบบจะลบทั้ง auth และ profile'),
  spacer(),

  callout('🔒 ข้อจำกัดด้านความปลอดภัย',
    ['• Super Admin เท่านั้นที่ลบผู้ใช้ได้',
     '• ลบบัญชีตัวเองไม่ได้',
     '• Admin ลบหรือเปลี่ยนรหัส Super Admin ไม่ได้'],
    'EAF1FB'),
  spacer(),

  h2('12.6 สิทธิ์การเข้าถึง (Permissions)'),
  para('Admin สามารถปรับสิทธิ์ของแต่ละ Role (Executive / Supervisor / Staff) ในเมนู "สิทธิ์การเข้าถึง"'),
  bullet('เลือก Role ที่ต้องการตั้งค่า'),
  bullet('ติ๊กเปิด/ปิดแต่ละสิทธิ์ (เช่น เห็นเมนู Reports, แก้ไข Threshold ฯลฯ)'),
  bullet('กดบันทึก — มีผลทันทีกับผู้ใช้ใน Role นั้นทุกคน'),
];

const vvMatrixSection = () => [
  h1('13. แนวคิด VV Matrix แบบละเอียด'),
  para('VV Matrix (Value & Validity Matrix) เป็นเครื่องมือบริหารสต็อกที่ใช้ข้อมูลความเสี่ยงในอนาคต (Expiry) ประกอบกับมูลค่าสต็อก เพื่อคัดกรองสินค้าที่ต้องเร่งระบาย (Clearance) ก่อนเกิดความเสียหายจริง'),
  spacer(),

  h2('13.1 ทำไมต้อง VV Matrix?'),
  para('ABC Analysis แบบเดิมพิจารณาแค่มูลค่าสต็อก ทำให้สินค้ามูลค่าสูงที่ใกล้หมดอายุยังถูกจัดเป็น Class A — ไม่สะท้อนความเสี่ยงจริง'),
  para('VV Matrix แก้ปัญหานี้ด้วยการคูณ Value Score กับ Validity Multiplier ที่ลงโทษสินค้าใกล้หมดอายุอย่างเหมาะสม'),
  spacer(),

  h2('13.2 สูตรคำนวณ'),
  callout('Formula',
    ['Final Score = ValueScore × (ValidityScore / 5)^α',
     '',
     'ตัวอย่าง: สินค้ามูลค่าสูง (Value=5) แต่ใกล้หมดอายุมาก (Validity=1)',
     '  α=2 → Final Score = 5 × (1/5)² = 5 × 0.04 = 0.20',
     '  → ตกไปอยู่ Class C ทันที (ต้องเร่งระบาย)'],
    'EAF1FB'),
  spacer(),

  h2('13.3 Validity Multiplier ที่แต่ละ α'),
  buildTable([
    { label: 'Validity Score', weight: 0.20 },
    { label: 'α=1 (Linear)',   weight: 0.27 },
    { label: 'α=2 (Moderate)', weight: 0.27 },
    { label: 'α=3 (Aggressive)', weight: 0.26 },
  ], [
    ['5', '×1.00', '×1.00', '×1.00'],
    ['4', '×0.80', '×0.64', '×0.51'],
    ['3', '×0.60', '×0.36', '×0.22'],
    ['2', '×0.40', '×0.16', '×0.06'],
    ['1', '×0.20', '×0.04', '×0.01'],
  ]),
  spacer(),

  h2('13.4 การใช้งานเชิงปฏิบัติ'),
  bullet('ใช้กรอง Class C (Final Score < 1.5) → Action Plan: ลดราคา, จัดโปรโมชั่น, โอนคลัง'),
  bullet('ใช้ Risk Flag CRITICAL → ต้องตัดสินใจภายใน 1 สัปดาห์'),
  bullet('ปรับค่า α ตามประเภทสินค้า — ของสด/อาหารใช้ α=3, ของแห้งใช้ α=2'),
  bullet('Re-run รายงานทุกสัปดาห์เพื่อตามดูสินค้าที่ "ตก class" จาก B ไป C'),
  spacer(),

  h2('13.5 VV Matrix — 3 Analysis Modes (ใหม่)'),
  para('ระบบรองรับ 3 mode ในการคำนวณ VV Matrix — สลับได้ที่ปุ่ม Toggle ด้านบนของหน้า Reports → VV Matrix แต่ละ mode ตอบคำถามต่างกัน'),
  spacer(),

  callout('💡 หลักคิดสำคัญที่ต้องเข้าใจ',
    ['Validity และ Value ของแต่ละ lot ต่างกันโดยธรรมชาติ — 1 SKU อาจมี 3 lot ที่หมดอายุไม่พร้อมกัน และมีต้นทุนต่างกัน',
     'การคิด "เป็น Item" ต้องเลือกกฎ aggregate — มี 2 ทางเลือก (Worst-Case vs Weighted)',
     'การคิด "เป็น Lot" คือความจริงที่แม่นยำที่สุด — เพราะ Action จริงเกิดที่ระดับ lot เสมอ'],
    'EAF1FB'),
  spacer(),

  h3('13.5.1 By Lot (Default ใหม่)'),
  para('แต่ละ lot คำนวณคะแนนของตัวเอง — เป็นความจริงที่แม่นยำที่สุด'),
  bullet('1 lot = 1 หน่วยให้คะแนน'),
  bullet('1 SKU อาจกระจายอยู่ใน Class A/B/C ได้พร้อมกัน'),
  bullet('Validity Score คำนวณจาก expire_date ของแต่ละ lot โดยตรง'),
  bullet('Value Score = rank ของ amount (qty × unit_cost) ของแต่ละ lot'),
  paraMixed([
    { text: '✅ เหมาะกับ: ', bold: true },
    'FEFO Pick List · การ Write-off lot หมดอายุ · GMP/HACCP audit · การแจ้งเตือนระดับ batch',
  ]),
  spacer(),

  h3('13.5.2 Item — Worst-Case (Conservative)'),
  para('รวมเป็น SKU โดยใช้คะแนน Validity ของ lot ที่ใกล้หมดที่สุด'),
  paraMixed([
    'สูตร: ',
    { text: 'Validity Score = min(lot validity scores)  •  Value Score = rank(Σ stock value)', bold: true, color: COLOR_PRIMARY },
  ]),
  bullet('ปรัชญา: "ถ้ามี lot ใดเสี่ยง → SKU นี้เสี่ยง"'),
  bullet('Conservative — ตื่นตัวต่อความเสี่ยง ไม่พลาดของหมดอายุ'),
  bullet('อาจเตือนเกินจริง — SKU ที่มี lot ใหม่ ฿100K + lot เก่า ฿100 จะถูกตัดเป็น Class C'),
  paraMixed([
    { text: '✅ เหมาะกับ: ', bold: true },
    'Risk Alert · การหยุดสั่งซื้อ SKU เสี่ยง · Food safety · Quarterly review',
  ]),
  spacer(),

  h3('13.5.3 Item — Weighted (Realistic)'),
  para('รวมเป็น SKU โดยถ่วงน้ำหนัก validity ของแต่ละ lot ด้วยมูลค่า'),
  paraMixed([
    'สูตร: ',
    { text: 'Validity Score = Σ(lot_days × lot_value) / Σ(lot_value)  •  Value Score = rank(Σ stock value)', bold: true, color: COLOR_PRIMARY },
  ]),
  bullet('ปรัชญา: "ความสดของเงินที่จมใน SKU นี้โดยเฉลี่ย"'),
  bullet('Realistic — สะท้อนภาพรวมยุติธรรม'),
  bullet('lot ใกล้หมดที่มูลค่าน้อยจะถูกบดบัง — ใช้คู่ Worst-Case mode'),
  paraMixed([
    { text: '✅ เหมาะกับ: ', bold: true },
    'การตั้งราคา/ส่วนลด · Pricing strategy · การเจรจา Supplier · การวางงบประมาณ',
  ]),
  spacer(),

  h3('13.5.4 ตัวอย่างเปรียบเทียบ — SKU เดียวกัน 3 mode'),
  para('สมมติ SKU "F7000100206 Smoked Salmon" มี 3 lot:'),
  buildTable([
    { label: 'Lot', weight: 0.20 },
    { label: 'มูลค่า', weight: 0.20 },
    { label: 'วันหมด', weight: 0.20 },
    { label: 'Days Left', weight: 0.20 },
    { label: 'Validity', weight: 0.20 },
  ], [
    ['Lot A', '฿100,000', 'มี.ค. 27', '+335 วัน', '5'],
    ['Lot B', '฿20,000',  'มิ.ย. 26', '+45 วัน',  '3'],
    ['Lot C', '฿5,000',   'พ.ค. 26', '−10 วัน',  '1'],
  ]),
  spacer(),
  para('Value Score (rank) สมมติได้ 4 → ทุก mode ใช้ค่านี้เหมือนกัน'),
  buildTable([
    { label: 'Mode', weight: 0.30 },
    { label: 'Validity ที่ใช้', weight: 0.30 },
    { label: 'Exp Score (α=3)', weight: 0.20 },
    { label: 'Class', weight: 0.20 },
  ], [
    ['By Lot (Lot A)',      '5',     '4 × (5/5)³ = 4.00',  'A'],
    ['By Lot (Lot B)',      '3',     '4 × (3/5)³ = 0.86',  'C'],
    ['By Lot (Lot C)',      '1',     '4 × (1/5)³ = 0.03',  'C'],
    ['Item Worst-Case',     '1 (min)', '4 × (1/5)³ = 0.03', 'C'],
    ['Item Weighted',       '~4.76 (ถ่วงโดยมูลค่า)', '4 × (4.76/5)³ ≈ 3.45', 'B'],
  ]),
  spacer(),
  callout('🎯 บทเรียนจากตัวอย่างนี้',
    ['• By Lot: เห็น lot C เป็น C → ต้อง Action ทันที (write-off?)',
     '• Item Worst: SKU ตกเป็น C ทั้งตัว → ตื่นตัวต่อความเสี่ยง',
     '• Item Weighted: SKU ได้ B → สะท้อนว่ายังมีของดีอยู่เยอะ — เหมาะกับการตัดสินใจการตั้งราคา',
     '• ใช้ทั้ง 3 mode เป็นมุมมองที่ส่งเสริมกัน — ไม่ใช่แทนกัน'],
    'EAF1FB'),
];

const appendixSection = () => [
  h1('14. ภาคผนวก'),

  h2('14.1 รหัสคลังสินค้ามาตรฐาน'),
  buildTable([
    { label: 'Code',  weight: 0.15 },
    { label: 'ชื่อ',  weight: 0.55 },
    { label: 'ประเภท', weight: 0.30 },
  ], [
    ['FS-FG01', 'คลัง FG - ใน1', 'Finished Goods'],
    ['FS-FG02', 'คลัง FG - ใน2', 'Finished Goods'],
    ['FS-FG03', 'คลัง FG - นอก', 'Finished Goods'],
    ['FS-RM01', 'คลัง RM - ใน1', 'Raw Materials'],
    ['FS-RM02', 'คลัง RM - ใน2', 'Raw Materials'],
    ['FS-RM03', 'คลัง RM - นอก1', 'Raw Materials'],
    ['FS-RM04', 'คลัง RM - นอก2', 'Raw Materials'],
    ['FS-PD01', 'คลังผลิต - ใน1', 'Production'],
    ['FS-PD02', 'คลังผลิต - ใน2', 'Production'],
    ['FS-PK01', 'PK & Factory Supply - ใน1', 'Packaging'],
    ['FS-PK02', 'PK & Factory Supply - ใน2', 'Packaging'],
    ['FS-QC01', 'คลัง QC - ใน', 'Quality Control'],
    ['FS-QC02', 'คลัง QC - นอก', 'Quality Control'],
    ['FS-CL01', 'คลังรอเคลมในประเทศ', 'Claim Hold'],
    ['FS-CO01', 'คลังรอเคลมต่างประเทศ', 'Claim Hold'],
    ['FS-WS01', 'คลังของเสียรอทำลาย', 'Waste'],
    ['BT-RM02', 'บางบัวทอง คลัง RM-Frozen', 'Raw Materials'],
  ]),
  spacer(),

  h2('14.2 รหัสกลุ่มสินค้า'),
  buildTable([
    { label: 'Code', weight: 0.15 },
    { label: 'ชื่อกลุ่ม', weight: 0.50 },
    { label: 'ใช้กับ', weight: 0.35 },
  ], [
    ['123', 'FFG-Finish Goods',   'สินค้าสำเร็จรูป'],
    ['124', 'FPKG-Packaging',     'บรรจุภัณฑ์'],
    ['125', 'FRM-Raw Materials',  'วัตถุดิบ'],
    ['126', 'FBY-By Product',     'ผลพลอยได้จากการผลิต'],
    ['127', 'FPKG-Packaging',     'บรรจุภัณฑ์'],
  ]),
  spacer(),

  h2('14.3 FS Category (NSL Food Service)'),
  para('หมวดสินค้าภายในที่ NSL ใช้เพิ่มเติมจาก Group Code — ละเอียดกว่า 4 กลุ่มหลัก'),
  buildTable([
    { label: 'หมวด',                              weight: 0.55 },
    { label: 'ตัวอย่างสินค้า',                     weight: 0.45 },
  ], [
    ['Fish-Salmon',                              'Fresh Salmon WH/HeadOn, Norwegian Salmon Fillet'],
    ['Fish-NZ',                                  'NZ Hoki, NZ Salmon, NZ Hake'],
    ['Fish-Tuna',                                'Yellowfin Tuna Saku, Bluefin Otoro'],
    ['Fish-Pangasius Dory',                      'Vietnam Pangasius Fillet'],
    ['Fish-Other',                               'Cod, Snapper, Sea Bass'],
    ['Beef',                                     'Aus GF Trimming, Striploin'],
    ['Pork',                                     'Pork Belly, Pork Loin'],
    ['Lamb',                                     'NZ Lamb Rack'],
    ['Poultry-Turkey',                           'Whole Turkey, Turkey Breast'],
    ['Poultry-Other',                            'Chicken Breast, Duck Breast'],
    ['Seafood-Mussel',                           'NZ Green Half Shell Mussel'],
    ['Processed Foods-Crab Stick',               'Surimi Crab Stick'],
    ['Processed Foods-Ebiko',                    'Ebiko Orange/Red/Green'],
    ['Processed Foods-Ikura',                    'Salmon Roe'],
    ['Processed Foods-Smoked Salmon',            'Smoked Salmon Sliced'],
    ['Processed Foods-Other',                    'Sausage, Bacon'],
    ['Frozen Cake',                              'Frozen Cheesecake, Brownies'],
    ['Crossiant',                                'Butter Croissant, Pain au Chocolat'],
    ['Ready to Cook',                            'Sous-vide Steaks, Pre-marinated Meat'],
    ['French Fries',                             'Frozen Fries'],
    ['Daily Goods',                              'Cooking Oil, Sauces'],
    ['Production FG',                            'In-house produced FG'],
    ['By Product',                               'Trimmings, Bones'],
    ['Other-Ingredient',                         'Salt, Spices'],
    ['Other',                                    'Packaging, Misc'],
  ]),
  spacer(),

  h2('14.4 FAQ'),

  h3('Q: ทำไมตัวเลขสต็อกใน Dashboard ไม่ตรงกับระบบ ERP?'),
  para('A: SmartInventory คำนวณจาก Transactions ที่ Import เข้ามาเท่านั้น หากนำเข้าไม่ครบถ้วนหรือยังไม่ Import งวดล่าสุดตัวเลขจะคลาดเคลื่อน — ตรวจสอบที่ "Last Sync" บน Dashboard'),

  h3('Q: ทำไมบางสินค้าไม่ขึ้น Alerts ทั้งที่สต็อกต่ำ?'),
  para('A: ระบบจะเตือนเฉพาะสินค้าที่มี Threshold ตั้งไว้ — ตรวจที่ Settings → Stock Threshold Settings'),

  h3('Q: ระบบ load ช้า ควรทำอย่างไร?'),
  para('A: 1) ลอง Hard Refresh (Cmd/Ctrl+Shift+R)  2) ตรวจสัญญาณอินเทอร์เน็ต  3) ถ้ายังช้าให้แจ้ง Admin'),

  h3('Q: ลืมรหัสผ่าน?'),
  para('A: แจ้ง Admin หรือ Super Admin ให้กด Reset Password ในหน้า User Management — เมื่อ login ด้วยรหัสที่ admin ตั้งให้ ระบบจะบังคับให้เปลี่ยนเป็นรหัสของตัวเองทันทีก่อนใช้งาน'),

  h3('Q: ทำไมเข้าระบบแล้วเด้งหน้า "ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน"?'),
  para('A: เพราะรหัสผ่านปัจจุบันถูกตั้งโดย admin (กรณี admin เพิ่งสร้างบัญชีหรือ reset password ให้) — ระบบบังคับให้ user กำหนดรหัสผ่านของตัวเองเพื่อความปลอดภัย กรอกรหัสใหม่ผ่านเกณฑ์ทั้ง 4 ข้อ (≥8 ตัวอักษร · มีตัวอักษร · มีตัวเลข · ทั้งสองช่องตรงกัน) แล้วกดยืนยัน'),

  h3('Q: จะ Reset Password ของพนักงานทั้งทีมพร้อมกันได้ไหม?'),
  para('A: ได้ — ไปที่ User Management → ติ๊ก checkbox หลายคน → กดปุ่ม "Reset Password (N)" บน toolbar สีน้ำเงิน → ระบบสุ่มรหัสร่วมให้ 1 ชุด ทุกคนต้องเปลี่ยนรหัสของตัวเองตอน login ถัดไป (ดูข้อ 12.4)'),

  h3('Q: ต้อง Import ข้อมูลทุกวันหรือไม่?'),
  para('A: แนะนำทุกสิ้นวัน หรือทุกครั้งที่ปิดงวดเพื่อให้ตัวเลขเป็นปัจจุบัน'),

  h3('Q: VV Matrix ควรปรับ α เท่าใด?'),
  para('A: NSL เป็นสินค้าอาหาร แนะนำ α = 3 (Aggressive) — สินค้าใกล้หมดอายุจะตกชั้นเร็ว ทำให้ผู้ใช้เห็นความเสี่ยงทันที'),

  spacer(),
  spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [new TextRun({ text: '— สิ้นสุดเอกสาร —', font: FONT, italics: true, color: COLOR_MUTED, size: 22 })],
  }),
];

// ── Document assembly ────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'SmartInventory',
  title: 'คู่มือการใช้งาน SmartInventory — NSL Food Service',
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: FONT, color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: COLOR_ACCENT },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ] },
      { reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.PORTRAIT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'SmartInventory · NSL Food Service', font: FONT, size: 18, color: COLOR_MUTED })],
        }),
      ]}),
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'หน้า ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ text: ' จาก ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR_MUTED }),
          ],
        }),
      ]}),
    },
    children: [
      ...coverSection(),
      ...tocSection(),
      ...overviewSection(),
      ...loginSection(),
      ...dashboardSection(),
      ...stockOnHandSection(),
      ...movementSection(),
      ...alertsSection(),
      ...valuationSection(),
      ...lotInventorySection(),
      ...reportsSection(),
      ...importSection(),
      ...settingsSection(),
      ...userMgmtSection(),
      ...vvMatrixSection(),
      ...appendixSection(),
    ],
  }],
});

const outPath = path.resolve(__dirname, '..', 'docs', 'SmartInventory_User_Manual_NSL.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`✅ Wrote ${outPath} (${buf.length.toLocaleString()} bytes)`);
});
