/* Generate a detailed Word doc explaining how VV Matrix scoring works,
   walked through with the actual NSL row #40 (Soft Shell Crab size L). */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber,
} = require('docx');

// ── Constants ────────────────────────────────────────────────────────────────
const FONT          = 'TH Sarabun New';
const COLOR_PRIMARY = '1F3864';
const COLOR_ACCENT  = '2E75B6';
const COLOR_MUTED   = '595959';
const COLOR_GRID    = 'BFBFBF';
const COLOR_HEAD_BG = 'D9E2F3';
const COLOR_ALT_BG  = 'F2F2F2';
const COLOR_GOOD    = '16A34A';
const COLOR_WARN    = 'D97706';
const COLOR_BAD     = 'DC2626';
const COLOR_CALLOUT_INFO   = 'EAF1FB';
const COLOR_CALLOUT_FORMULA = 'F0EDFA';
const COLOR_CALLOUT_GOOD   = 'E8F8EF';
const COLOR_CALLOUT_WARN   = 'FFF3DE';

const PAGE_W = 12240;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Helpers ──────────────────────────────────────────────────────────────────
const run = (text, opts = {}) => new TextRun({ font: FONT, ...opts, text });

const para = (text, runOpts = {}, paraOpts = {}) => new Paragraph({
  spacing: { after: 100, line: 320 },
  ...paraOpts,
  children: [run(text, runOpts)],
});

const paraMixed = (parts, paraOpts = {}) => new Paragraph({
  spacing: { after: 100, line: 320 },
  ...paraOpts,
  children: parts.map((part) =>
    typeof part === 'string' ? run(part) : new TextRun({ font: FONT, ...part })
  ),
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 280, after: 200 },
  children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: COLOR_PRIMARY })],
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 140 },
  children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: COLOR_PRIMARY })],
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: COLOR_ACCENT })],
});

const cellBorders = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  left:   { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
  right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR_GRID },
};
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

const cell = (text, opts = {}) => {
  const isHead = opts.head === true;
  const lines  = Array.isArray(text) ? text : [text];
  return new TableCell({
    borders: cellBorders,
    margins: cellMargins,
    width: { size: opts.width, type: WidthType.DXA },
    shading: isHead
      ? { fill: COLOR_HEAD_BG, type: ShadingType.CLEAR }
      : opts.alt
      ? { fill: COLOR_ALT_BG,  type: ShadingType.CLEAR }
      : opts.fill
      ? { fill: opts.fill,     type: ShadingType.CLEAR }
      : undefined,
    children: lines.map((line) =>
      new Paragraph({
        spacing: { after: 40 },
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({
          text: line,
          font: FONT,
          bold: isHead || opts.bold,
          color: isHead ? COLOR_PRIMARY : (opts.color ?? '000000'),
          size: opts.size ?? 22,
        })],
      })
    ),
  });
};

const buildTable = (columns, rows) => {
  const totalW = CONTENT_W;
  const colWidths = columns.map((c) => Math.round(totalW * c.weight));
  const drift = totalW - colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += drift;

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((c, i) =>
      cell(c.label, { head: true, width: colWidths[i], align: c.align ?? AlignmentType.LEFT })
    ),
  });
  const bodyRows = rows.map((row, idx) => new TableRow({
    children: row.map((val, i) => {
      const colDef = columns[i];
      const opts = {
        width: colWidths[i],
        alt: idx % 2 === 1,
        align: colDef.align ?? AlignmentType.LEFT,
      };
      // val can be a string or { text, fill, color, bold }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return cell(val.text ?? '', { ...opts, ...val });
      }
      return cell(val, opts);
    }),
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
};

const callout = (title, body, fill = COLOR_CALLOUT_INFO, accent = COLOR_ACCENT) => {
  const lines = Array.isArray(body) ? body : [body];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4,  color: accent },
          left:   { style: BorderStyle.SINGLE, size: 24, color: accent },
          right:  { style: BorderStyle.SINGLE, size: 4,  color: COLOR_GRID },
          bottom: { style: BorderStyle.SINGLE, size: 4,  color: COLOR_GRID },
        },
        margins: { top: 160, bottom: 160, left: 220, right: 220 },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR },
        children: [
          ...(title
            ? [new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: title, font: FONT, bold: true, size: 26, color: COLOR_PRIMARY })] })]
            : []),
          ...lines.map((line) =>
            typeof line === 'string'
              ? new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, font: FONT, size: 22 })] })
              : line
          ),
        ],
      })],
    })],
  });
};

const formulaBox = (lines) => {
  const arr = Array.isArray(lines) ? lines : [lines];
  return callout(null, arr.map((l) =>
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: l, font: 'Consolas', size: 22, bold: true, color: COLOR_PRIMARY })],
    })
  ), COLOR_CALLOUT_FORMULA, '6366F1');
};

const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [run('')] });

// ── Content ──────────────────────────────────────────────────────────────────

const cover = [
  new Paragraph({ spacing: { before: 1800 }, children: [run('')] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '🎯', font: FONT, size: 96 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'VV Matrix Scoring', font: FONT, size: 60, bold: true, color: COLOR_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: 'อธิบายวิธีคิดคะแนนและการจัด Class A/B/C', font: FONT, size: 32, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: 'พร้อมตัวอย่างจริงจากระบบของ NSL Food Service', font: FONT, size: 26, italics: true, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: 'NSL Food Service · SmartInventory', font: FONT, size: 28, bold: true, color: COLOR_ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `เอกสารวันที่ ${new Date().toISOString().split('T')[0]}`, font: FONT, size: 22, color: COLOR_MUTED })],
  }),
  new Paragraph({ children: [run('')], pageBreakBefore: true }),
];

// 1. Intro & motivation
const sec1Intro = [
  h1('1. VV Matrix คืออะไร'),
  para('VV Matrix (Value × Validity Matrix) เป็นเครื่องมือจัดอันดับและคัดกรองสินค้าในคลัง โดยรวมข้อมูล "มูลค่า" และ "ความสด (วันก่อนหมดอายุ)" เข้าด้วยกัน เพื่อชี้ว่าสินค้าตัวใดควรเร่งระบายก่อนที่จะเสียหายจริง'),
  callout('🎯 จุดประสงค์', [
    '• เห็นภาพรวมความเสี่ยงเรื่องอายุสินค้าเทียบกับมูลค่าที่จมอยู่ในคลัง',
    '• แบ่งสินค้าออกเป็น 3 กลุ่ม (Class A/B/C) เพื่อใช้ตัดสินใจขายลด/โปรโมต/ระบาย',
    '• ลดความเสียหายจากของหมดอายุ พร้อมใช้เงินทุนที่ค้างคลังให้คุ้ม',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
  spacer(),
  para('ระบบใช้ "คะแนน 2 ตัว" (Value Score และ Validity Score) ผสมเข้าด้วยกันด้วย 2 สูตร — Simple model และ Exponential model — แล้วแบ่ง Class A/B/C จากผลลัพธ์ของแต่ละสูตร'),
];

// 2. Example case
const exampleHead = h1('2. ตัวอย่าง: รายการที่ 40');
const exampleIntro = para('ใช้ข้อมูลจริงจากหน้า Reports → VV Matrix ของ NSL Food Service เป็นตัวอย่าง');
const exampleData = buildTable(
  [
    { label: 'Field', weight: 0.40 },
    { label: 'ค่า',   weight: 0.60 },
  ],
  [
    ['Item Code',    'F10300011'],
    ['Item Name',    'Soft Shell Crab size L'],
    ['Group',        'FRM (Raw Materials)'],
    ['Stock Value',  '฿55,800'],
    ['Days Remaining','331 วัน'],
    ['Value Score',  { text: '3', bold: true, color: COLOR_ACCENT }],
    ['Validity Score',{ text: '5', bold: true, color: COLOR_GOOD }],
    ['Simple Score', { text: '4.2 → Class A', bold: true, color: COLOR_GOOD }],
    ['Exp Score',    { text: '3.00 → Class B', bold: true, color: COLOR_WARN }],
  ],
);

const sec2 = [
  exampleHead,
  exampleIntro,
  exampleData,
  spacer(),
  callout('🔍 คำถามที่จะอธิบายต่อไป', [
    '• ทำไม Value Score ถึงเท่ากับ 3?',
    '• ทำไม Validity Score ถึงเท่ากับ 5?',
    '• ทำไม Simple Score ถึงได้ 4.2 และจัดเข้า Class A?',
    '• ทำไม Exp Score ถึงได้ 3.00 และจัดเข้า Class B (ทั้งที่ Validity เต็ม 5)?',
  ], COLOR_CALLOUT_INFO, COLOR_ACCENT),
];

// 3. Config used by NSL
const sec3Config = [
  h1('3. ค่า Config ของ NSL Food Service'),
  para('ค่าทั้งหมดด้านล่างตั้งไว้ใน Settings → VV Matrix Scoring Configuration ระบบจะใช้ค่าเหล่านี้คำนวณกับสินค้าทุกรายการ'),
  h3('3.1 Validity Thresholds (เกณฑ์วันก่อนหมดอายุ)'),
  buildTable(
    [
      { label: 'Score', weight: 0.18, align: AlignmentType.CENTER },
      { label: 'เงื่อนไขจำนวนวันคงเหลือ', weight: 0.45 },
      { label: 'ความหมาย', weight: 0.37 },
    ],
    [
      [{ text: '5', bold: true, color: COLOR_GOOD,  align: AlignmentType.CENTER }, '> 180 วัน',     'สด มาก ปลอดภัย'],
      [{ text: '4', bold: true, color: '65A30D',    align: AlignmentType.CENTER }, '90 – 180 วัน',  'สด'],
      [{ text: '3', bold: true, color: COLOR_WARN,  align: AlignmentType.CENTER }, '60 – 90 วัน',   'ปกติ'],
      [{ text: '2', bold: true, color: 'EA580C',    align: AlignmentType.CENTER }, '30 – 60 วัน',   'ใกล้หมดอายุ'],
      [{ text: '1', bold: true, color: COLOR_BAD,   align: AlignmentType.CENTER }, '≤ 30 วัน หรือหมดอายุแล้ว', 'วิกฤต'],
    ],
  ),
  spacer(),
  h3('3.2 Value Score (Percentile Bands)'),
  para('ระบบจัดอันดับสินค้าทุกรายการตามมูลค่าสต็อก (qty × moving_avg) จากมากไปน้อย แล้วแบ่งเป็น 5 ช่วง'),
  buildTable(
    [
      { label: 'Score', weight: 0.18, align: AlignmentType.CENTER },
      { label: 'ช่วง percentile (top → bottom)', weight: 0.45 },
      { label: 'ความหมาย', weight: 0.37 },
    ],
    [
      [{ text: '5', bold: true, color: COLOR_GOOD,  align: AlignmentType.CENTER }, '0% – 20%',   'top 20% มูลค่าสูงสุด'],
      [{ text: '4', bold: true, color: '65A30D',    align: AlignmentType.CENTER }, '20% – 40%',  'กลุ่มมูลค่าสูง'],
      [{ text: '3', bold: true, color: COLOR_WARN,  align: AlignmentType.CENTER }, '40% – 60%',  'กลุ่มมูลค่ากลาง'],
      [{ text: '2', bold: true, color: 'EA580C',    align: AlignmentType.CENTER }, '60% – 80%',  'กลุ่มมูลค่าต่ำ'],
      [{ text: '1', bold: true, color: COLOR_BAD,   align: AlignmentType.CENTER }, '80% – 100%', 'bottom 20% มูลค่าต่ำสุด'],
    ],
  ),
  spacer(),
  h3('3.3 น้ำหนักและค่าคงที่ที่ NSL ใช้'),
  buildTable(
    [
      { label: 'พารามิเตอร์', weight: 0.45 },
      { label: 'ค่า',          weight: 0.20, align: AlignmentType.CENTER },
      { label: 'ความหมาย',    weight: 0.35 },
    ],
    [
      ['Alpha (α)',                            { text: '3', bold: true, color: '6366F1', align: AlignmentType.CENTER }, 'Aggressive — ลงโทษ validity ต่ำหนัก'],
      ['Weight ของ Value (Simple model)',      { text: '0.4', bold: true, align: AlignmentType.CENTER }, 'น้ำหนักของ Value Score'],
      ['Weight ของ Validity (Simple model)',   { text: '0.6', bold: true, align: AlignmentType.CENTER }, 'น้ำหนักของ Validity Score (มากกว่า Value)'],
      ['Class A threshold (Simple)',           { text: '≥ 4.0', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }, 'Simple Score ตั้งแต่ 4.0 ขึ้นไป = A'],
      ['Class B threshold (Simple)',           { text: '≥ 2.5', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }, '2.5–3.9 = B, ต่ำกว่า = C'],
      ['Class A threshold (Exp)',              { text: '≥ 3.5', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }, 'Exp Score ตั้งแต่ 3.5 ขึ้นไป = A'],
      ['Class B threshold (Exp)',              { text: '≥ 1.5', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }, '1.5–3.4 = B, ต่ำกว่า = C'],
    ],
  ),
];

// 4. Step 1 — Value Score
const sec4Value = [
  h1('4. STEP 1 — คำนวณ Value Score'),
  h3('🔵 ผลลัพธ์: Value Score = 3'),
  para('Value Score ใช้ "อันดับเปรียบเทียบ" (percentile) ระหว่างสินค้าทุกรายการในระบบ ไม่ใช่ค่ามูลค่าเด็ดขาด'),
  formulaBox([
    'Step a) เรียงสินค้าทุกรายการตาม stock_value จากมากไปน้อย',
    'Step b) คำนวณ percentile ของแต่ละรายการ',
    'Step c) จัด Score 5..1 ตามช่วง percentile ที่กำหนด',
  ]),
  spacer(),
  h3('การคำนวณของรายการนี้'),
  paraMixed([
    { text: 'Soft Shell Crab L', bold: true },
    ' มี stock_value = ',
    { text: '฿55,800', bold: true, color: COLOR_ACCENT },
    ' ในระบบมีสินค้าทั้งหมดประมาณ 3,800 รายการ',
  ]),
  para('เรียงทุกรายการจากมูลค่าสูงสุด แล้วหาว่าตัวนี้อยู่ลำดับที่เท่าไร — คาดว่าจะอยู่ประมาณลำดับที่ 1,500 ถึง 2,300 ซึ่งคิดเป็น percentile ที่ ~40%–60%'),
  callout('📍 สรุปการได้ Value Score = 3', [
    'ตำแหน่งของ ฿55,800 อยู่ในช่วง 40% – 60% ของอันดับ → ตามตาราง 3.2 จึงได้ Score 3',
    'หากของรายการนี้มีมูลค่าเพิ่มขึ้นจนทะลุ top 40% (ลำดับประมาณ 1,500 ขึ้นไปจากมูลค่าสูงสุด) Score จะกลายเป็น 4',
  ], COLOR_CALLOUT_INFO, COLOR_ACCENT),
];

// 5. Step 2 — Validity Score
const sec5Validity = [
  h1('5. STEP 2 — คำนวณ Validity Score'),
  h3('🟢 ผลลัพธ์: Validity Score = 5'),
  para('Validity Score ใช้ "ค่าคงที่" — ไม่ขึ้นกับสินค้าตัวอื่น เทียบกับเกณฑ์วันที่ตั้งไว้'),
  formulaBox([
    'days_remaining = expire_date − วันที่ปัจจุบัน',
    '',
    'if days_remaining > 180 → Score 5',
    'if days_remaining > 90  → Score 4',
    'if days_remaining > 60  → Score 3',
    'if days_remaining > 30  → Score 2',
    'else                    → Score 1',
  ]),
  spacer(),
  h3('การคำนวณของรายการนี้'),
  paraMixed([
    'รายการนี้เหลือเวลาก่อนหมดอายุ ',
    { text: '331 วัน', bold: true, color: COLOR_GOOD },
    ' ซึ่ง > 180 วัน',
  ]),
  callout('📍 สรุปการได้ Validity Score = 5', [
    '331 > 180 → Score 5 (เกณฑ์สูงสุด)',
    'หมายความว่ารายการนี้ "สดมาก" — มีเวลาเหลืออีกกว่า 11 เดือนก่อนหมดอายุ',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
];

// 6. Step 3 — Simple Score
const sec6Simple = [
  h1('6. STEP 3 — คำนวณ Simple Score'),
  h3('🟦 ผลลัพธ์: Simple Score = 4.2 → Class A'),
  para('Simple model ใช้ "การถัวเฉลี่ยถ่วงน้ำหนัก" — จุดเด่นคือ "บวก" สองคะแนนเข้ากัน ทำให้ Validity สูงดัน Score รวมขึ้นได้'),
  formulaBox([
    'Simple Score = (ValueScore × W_value) + (ValidityScore × W_validity)',
  ]),
  spacer(),
  h3('แทนค่าของรายการนี้'),
  formulaBox([
    'Simple Score = (3 × 0.4) + (5 × 0.6)',
    '             = 1.2        + 3.0',
    '             = 4.2',
  ]),
  spacer(),
  para('เช็คกับ threshold: Class A ≥ 4.0, Class B ≥ 2.5'),
  paraMixed([
    '4.2 ≥ 4.0 → ',
    { text: 'Class A', bold: true, color: COLOR_GOOD },
    ' ✅',
  ]),
  callout('📍 ทำไมถึงได้ Class A ใน Simple Model', [
    'แม้ Value Score จะแค่ 3 (กลางๆ) แต่ Validity Score ครบ 5 (สด) และ NSL ตั้งน้ำหนัก validity ไว้สูงกว่า value (0.6 vs 0.4)',
    'การ "บวก" ทำให้ Validity ที่สูงดัน Score รวมข้ามเส้น 4.0 ได้',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
];

// 7. Step 4 — Exp Score (the key insight)
const sec7Exp = [
  h1('7. STEP 4 — คำนวณ Exponential Score (สูตรที่ระบบใช้แนะนำจริง)'),
  h3('🔴 ผลลัพธ์: Exp Score = 3.00 → Class B'),
  para('Exp model ออกแบบมาเฉพาะสำหรับธุรกิจอาหารและของสด — มีลักษณะ "ลงโทษหนัก" เมื่อ validity ต่ำ และ "ไม่ boost" เมื่อ validity สูง'),
  formulaBox([
    'Exp Score = ValueScore × (ValidityScore / 5)^α',
  ]),
  spacer(),
  h3('แทนค่าของรายการนี้'),
  formulaBox([
    'normalized_validity = 5 / 5 = 1',
    'multiplier          = 1^3   = 1',
    'Exp Score           = 3 × 1 = 3.00',
  ]),
  spacer(),
  para('เช็คกับ threshold: Class A ≥ 3.5, Class B ≥ 1.5'),
  paraMixed([
    '3.00 อยู่ระหว่าง 1.5 – 3.4 → ',
    { text: 'Class B', bold: true, color: COLOR_WARN },
    ' ⚠️',
  ]),
  spacer(),
  h3('🧠 จุดสำคัญที่ต้องเข้าใจ'),
  callout('Multiplier ของ Exp model "ดีสุดได้แค่ × 1.0"', [
    'เพราะ ValidityScore สูงสุดคือ 5 → (5/5)^α = 1^α = 1 เสมอ',
    'แปลว่า Exp Score "ไม่มีทาง" เกิน Value Score ดั้งเดิม',
    'จึงเป็น "ceiling" ตามธรรมชาติของ Value Score',
  ], COLOR_CALLOUT_WARN, COLOR_WARN),
  spacer(),
  para('นั่นแปลว่าถ้า Value Score = 3 อย่างมาก Exp Score ก็จะได้ 3.00 เท่านั้น แม้ Validity จะเต็ม 5 ก็ตาม'),
  paraMixed([
    'และเนื่องจาก Class A ใน Exp model ต้อง ',
    { text: '≥ 3.5', bold: true, color: COLOR_BAD },
    ' รายการที่มี Value Score ≤ 3 จึง',
    { text: 'ไม่มีทาง', bold: true, color: COLOR_BAD },
    'จัดเข้า Class A ใน Exp model ได้',
  ]),
  spacer(),
  h3('ตาราง Multiplier ของ α = 3'),
  buildTable(
    [
      { label: 'Validity Score', weight: 0.25, align: AlignmentType.CENTER },
      { label: 'Multiplier (V/5)^3', weight: 0.30, align: AlignmentType.CENTER },
      { label: 'ผลกับ Value=3', weight: 0.20, align: AlignmentType.CENTER },
      { label: 'ความหมาย', weight: 0.25 },
    ],
    [
      [{ text: '5', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }, { text: '1.000', align: AlignmentType.CENTER }, { text: '3.00', bold: true, align: AlignmentType.CENTER }, 'คงค่า Value เดิม'],
      [{ text: '4', bold: true, color: '65A30D',   align: AlignmentType.CENTER }, { text: '0.512', align: AlignmentType.CENTER }, { text: '1.54', align: AlignmentType.CENTER }, 'ลดลงเกือบครึ่ง'],
      [{ text: '3', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }, { text: '0.216', align: AlignmentType.CENTER }, { text: '0.65', align: AlignmentType.CENTER }, 'ลดเหลือ 1/5'],
      [{ text: '2', bold: true, color: 'EA580C',   align: AlignmentType.CENTER }, { text: '0.064', align: AlignmentType.CENTER }, { text: '0.19', align: AlignmentType.CENTER }, 'แทบเป็น 0'],
      [{ text: '1', bold: true, color: COLOR_BAD,  align: AlignmentType.CENTER }, { text: '0.008', align: AlignmentType.CENTER }, { text: '0.02', align: AlignmentType.CENTER }, 'แทบไม่มีค่า'],
    ],
  ),
];

// 8. Comparison & meaning of "↑"
const sec8Compare = [
  h1('8. ทำไม Class ถึงต่างกัน — และความหมายของ "A↑"'),
  h3('สรุปข้างผลลัพธ์ของรายการนี้'),
  buildTable(
    [
      { label: 'สูตร',        weight: 0.20 },
      { label: 'Score',       weight: 0.20, align: AlignmentType.CENTER },
      { label: 'เกณฑ์ A',     weight: 0.20, align: AlignmentType.CENTER },
      { label: 'ผ่าน A?',     weight: 0.20, align: AlignmentType.CENTER },
      { label: 'Class ที่ได้', weight: 0.20, align: AlignmentType.CENTER },
    ],
    [
      ['Simple', { text: '4.2', bold: true,  align: AlignmentType.CENTER }, { text: '≥ 4.0', align: AlignmentType.CENTER }, { text: 'ผ่าน',  bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }, { text: 'A', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }],
      ['Exp',    { text: '3.00', bold: true, align: AlignmentType.CENTER }, { text: '≥ 3.5', align: AlignmentType.CENTER }, { text: 'ไม่ผ่าน', bold: true, color: COLOR_BAD,  align: AlignmentType.CENTER }, { text: 'B', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }],
    ],
  ),
  spacer(),
  callout('🎯 Root Cause', [
    'Exp model ติด "ceiling" ที่ Value Score เพราะ multiplier ดีสุดได้แค่ × 1.0',
    'รายการนี้ Value Score = 3 → Exp Score สูงสุดจะได้แค่ 3.00 เท่านั้น ไม่มีทางถึง 3.5',
    'จึงตกชั้นลงมาเป็น Class B แม้ Validity จะสมบูรณ์ 5 เต็ม',
  ], COLOR_CALLOUT_WARN, COLOR_WARN),
  spacer(),
  h3('ความหมายของไอคอน "A↑" บนหน้า Reports'),
  para('ในตาราง VV Matrix ระบบจะแสดง 2 badge เมื่อ class จาก 2 สูตรไม่ตรงกัน:'),
  buildTable(
    [
      { label: 'Badge', weight: 0.25, align: AlignmentType.CENTER },
      { label: 'มาจากสูตรไหน', weight: 0.30 },
      { label: 'ความหมาย', weight: 0.45 },
    ],
    [
      [{ text: 'B (สีส้ม ใหญ่)', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }, 'Exp Class', 'คือ class ที่ระบบใช้แนะนำจริง — ดูตัวนี้เป็นหลัก'],
      [{ text: 'A↑ (เล็ก จาง)', bold: true, color: COLOR_MUTED, align: AlignmentType.CENTER }, 'Simple Class', 'แสดงเฉพาะตอนต่างจาก Exp — ลูกศร ↑ บอกว่า Simple จัดให้สูงกว่า'],
    ],
  ),
  spacer(),
  callout('ทำไมระบบถึงเลือก "Exp" เป็นหลักสำหรับ NSL', [
    'NSL Food Service ทำธุรกิจอาหารที่ความสด (validity) เป็นหัวใจหลัก',
    'Exp model มีพฤติกรรม "ลงโทษ validity ต่ำหนัก" ซึ่งเหมาะกับการ flag ของที่ใกล้หมดอายุ',
    'Simple model มีบทบาทเป็นข้อมูลเสริมเทียบ — ใช้สังเกตการ "ตกชั้น" ของของที่ value ไม่สูงพอ',
  ], COLOR_CALLOUT_INFO, COLOR_ACCENT),
];

// 9. What-if scenarios
const sec9Whatif = [
  h1('9. What-If — ปรับอะไรได้บ้างถ้าอยากให้รายการนี้เป็น Class A'),
  para('เป้าหมาย: ทำให้ Soft Shell Crab L ได้ Class A ใน Exp model ด้วย — ต้องให้ Exp Score ≥ 3.5'),
  spacer(),
  h3('ทางเลือก 1 — รอจนของที่มี value สูงกว่าน้อยลง'),
  para('ถ้าจำนวนรายการที่ value มากกว่ารายการนี้ลดลง (เช่น ระบายของ value สูงออกได้) Soft Shell Crab L จะขยับขึ้นมาอยู่ใน percentile ที่ดีขึ้น'),
  paraMixed([
    'ถ้าขึ้นไปอยู่ ',
    { text: 'top 40% (Score 4)', bold: true, color: COLOR_ACCENT },
    ' → Exp Score = 4 × 1 = 4.00 ≥ 3.5 → ',
    { text: 'Class A', bold: true, color: COLOR_GOOD },
  ]),
  spacer(),
  h3('ทางเลือก 2 — ลดเกณฑ์ Class A ของ Exp model'),
  paraMixed([
    'ที่ ',
    { text: 'Settings → VV Matrix → Exp Class A', bold: true },
    ' ลดจาก 3.5 → 3.0 จะทำให้รายการที่ Exp Score = 3 ขึ้นมาเป็น A ทันที',
  ]),
  callout('⚠️ ข้อควรระวัง', [
    'การลด threshold จะกระทบสินค้าทุกรายการ — รายการที่เคยเป็น B อาจเปลี่ยนเป็น A หมด',
    'เป็นการเปลี่ยน "นิยาม" ของ Class A ในระบบทั้งหมด ไม่ใช่แค่กับรายการนี้',
  ], COLOR_CALLOUT_WARN, COLOR_WARN),
  spacer(),
  h3('ทางเลือก 3 — ลดค่า α ลง'),
  paraMixed([
    'ลด α จาก 3 → 2 หรือ 1 จะลดความรุนแรงในการลงโทษ validity ต่ำ ',
    { text: 'แต่ก็จะลดจุดเด่นของ Exp model ในการคัดกรองของใกล้หมดอายุด้วย', italics: true },
  ]),
  para('ที่ α = 1 (Linear) Exp model จะกลายเป็นเหมือน Simple model มากขึ้น — รายการนี้จะได้ Exp Score = 3 × (5/5)^1 = 3 เท่าเดิม ไม่ช่วย'),
  spacer(),
  h3('ทางเลือก 4 — ยอมรับสภาพ'),
  para('Class B ใน Exp model ไม่ได้แปลว่า "แย่" — แค่หมายความว่า "ของกลางๆ ที่ยังสดดี ไม่ต้องเร่งดำเนินการเป็นพิเศษ" ซึ่งสะท้อนความจริงทางธุรกิจได้ดี'),
  callout('💡 คำแนะนำของผม', [
    'คงค่า config ปัจจุบันไว้ (α=3, Exp A=3.5) เพราะเหมาะกับธุรกิจอาหารของ NSL',
    'ใช้ Exp Class เป็นหลักในการตัดสินใจ',
    'สังเกต Simple Class (badge A↑) เพื่อเข้าใจว่ารายการไหนอาจ "underrated" จาก value ที่ยังไม่สูงพอ',
    'ถ้าต้องการให้รายการที่ "value กลาง + validity ดี" ได้ A จริงๆ ให้ปรับ logic ในอนาคตเพื่อใช้ "weighted geometric" หรือ "additive bonus" แทน',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
];

// 10. Summary
const sec10Summary = [
  h1('10. สรุปแบบเร็ว'),
  buildTable(
    [
      { label: 'ขั้นตอน', weight: 0.30 },
      { label: 'การคำนวณ', weight: 0.40 },
      { label: 'ผลลัพธ์', weight: 0.30, align: AlignmentType.CENTER },
    ],
    [
      ['1. Value Score',    'อันดับ percentile ของ stock_value (40-60% = Score 3)',                { text: '3', bold: true, color: COLOR_ACCENT, align: AlignmentType.CENTER }],
      ['2. Validity Score', '331 วัน > 180 → Score 5',                                              { text: '5', bold: true, color: COLOR_GOOD,   align: AlignmentType.CENTER }],
      ['3. Simple Score',   '(3 × 0.4) + (5 × 0.6) = 4.2',                                          { text: '4.2 → A', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }],
      ['4. Exp Score',      '3 × (5/5)^3 = 3.00',                                                   { text: '3.00 → B', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }],
      ['5. ความหมาย "A↑"', 'Simple บอก A · Exp บอก B → แสดงทั้งคู่เพื่อให้ผู้ใช้เห็นความต่าง',     { text: '—', align: AlignmentType.CENTER }],
    ],
  ),
  spacer(),
  callout('📌 ใจความสำคัญที่จดจำง่ายๆ', [
    '• Value Score = อันดับมูลค่าเทียบกับสินค้าอื่น (ไม่ใช่ค่าตายตัว)',
    '• Validity Score = ค่าตามจำนวนวันก่อนหมดอายุ (ค่าตายตัว)',
    '• Simple Score = บวก สองคะแนนถ่วงน้ำหนัก → Validity ดันคะแนนขึ้นได้',
    '• Exp Score = คูณ ด้วย multiplier ที่ "ดีสุด × 1" → มี ceiling ที่ Value Score',
    '• ระบบใช้ Exp เป็นหลัก เพราะเหมาะกับอาหาร — ลงโทษของใกล้หมดอายุหนัก',
  ], COLOR_CALLOUT_INFO, COLOR_ACCENT),
];

// ── 11. NEW: 3 Analysis Modes ────────────────────────────────────────────────
const sec11ThreeModes = [
  h1('11. 3 Analysis Modes — เลือกตามคำถาม'),
  para('ฟีเจอร์ใหม่ของ VV Matrix รองรับการคิดคะแนน 3 mode ต่างกัน เพราะ "Validity และ Value ของแต่ละ lot ต่างกันโดยธรรมชาติ" — ผู้ใช้เลือก mode ตามคำถามที่ต้องการตอบ'),
  spacer(),

  callout('💡 แนวคิดหลัก',
    ['1 SKU อาจมีหลาย lot ที่หมดอายุไม่พร้อมกัน และมีต้นทุนต่างกัน',
     '→ การคิดคะแนน "ระดับ lot" คือความจริงที่แม่นยำที่สุด',
     '→ แต่ในระดับบริหาร การคิดเป็น SKU ก็ยังจำเป็น — โดยต้องเลือกกฎ aggregate ที่ชัดเจน'],
    COLOR_CALLOUT_INFO, COLOR_ACCENT),
  spacer(),

  h2('11.1 Mode 1 — By Lot (Default)'),
  para('แต่ละ lot คำนวณคะแนนของตัวเอง — เป็นความจริงที่แม่นยำที่สุด'),
  formulaBox([
    'Value Score   = percentile rank ของ lot_amount  (1-5)',
    'Validity Score = ตาม days_remaining ของ lot นั้น  (1-5)',
    'Exp Score     = Value × (Validity/5)^α',
    '',
    '⇒ 1 lot = 1 หน่วยให้คะแนน',
    '⇒ 1 SKU อาจมีหลาย lot กระจายอยู่ใน Class A, B, C พร้อมกัน',
  ]),
  callout('✅ เหมาะใช้กับ', [
    '• FEFO Pick List — รู้ว่าหยิบ lot ไหนก่อน',
    '• การ Write-off lot ที่หมดอายุ',
    '• GMP / HACCP audit',
    '• การแจ้งเตือนความเสี่ยงระดับ batch',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
  spacer(),

  h2('11.2 Mode 2 — Item Worst-Case (Conservative)'),
  para('รวมเป็น SKU โดยใช้ "lot ที่ใกล้หมดอายุที่สุด" เป็นตัวกำหนด validity'),
  formulaBox([
    'Validity Score = min(lot validity scores)  ← worst-case',
    'Value Score   = percentile rank ของ Σ(stock_value)',
    'Exp Score     = Value × (Validity/5)^α',
    '',
    'ปรัชญา: "ถ้ามี lot ใดเสี่ยง → SKU นี้เสี่ยง"',
  ]),
  callout('✅ เหมาะใช้กับ', [
    '• Risk Alert ระดับ SKU',
    '• การหยุดสั่งซื้อ SKU ที่เริ่มมีของหมดอายุ',
    '• Food safety review',
    '• Quarterly review เชิงป้องกันความเสี่ยง',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
  callout('⚠️ ข้อควรระวัง', [
    'อาจตัด SKU เป็น Class C ทั้งที่มี lot ใหม่อยู่เยอะ',
    'เช่น: lot ใหม่ ฿100,000 + lot เก่า ฿100 → SKU ถูกตัดเป็น C เพราะ lot เก่า',
    '→ ใช้คู่กับ By Lot mode เพื่อดู action รายตัว',
  ], COLOR_CALLOUT_WARN, COLOR_WARN),
  spacer(),

  h2('11.3 Mode 3 — Item Weighted (Realistic)'),
  para('รวมเป็น SKU โดยถ่วงน้ำหนัก validity ของแต่ละ lot ด้วยมูลค่า'),
  formulaBox([
    'Avg Days = Σ(lot_days × lot_value) / Σ(lot_value)',
    'Validity Score = scoring(Avg Days)  ← weighted average',
    'Value Score   = percentile rank ของ Σ(stock_value)',
    'Exp Score     = Value × (Validity/5)^α',
    '',
    'ปรัชญา: "ความสดของเงินที่จมใน SKU นี้โดยเฉลี่ย"',
  ]),
  callout('✅ เหมาะใช้กับ', [
    '• การตั้งราคา / ส่วนลด',
    '• Pricing strategy',
    '• การเจรจา Supplier (สั่งลด/เพิ่ม)',
    '• การวางงบประมาณ',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
  callout('⚠️ ข้อควรระวัง', [
    'lot ใกล้หมดที่มูลค่าน้อยจะถูกบดบัง',
    'เช่น: lot ใหม่ ฿100,000 + lot หมดอายุ ฿100 → SKU ดูสด (เกือบ Class A) ทั้งที่มี lot หมดอายุปนอยู่',
    '→ ใช้คู่กับ Worst-Case mode',
  ], COLOR_CALLOUT_WARN, COLOR_WARN),
  spacer(),

  h2('11.4 ตัวอย่างเปรียบเทียบ — SKU เดียว 3 Mode'),
  para('สมมติ SKU "F7000100206 Smoked Salmon" มี 3 lot:'),
  buildTable(
    [
      { label: 'Lot', weight: 0.20 },
      { label: 'มูลค่า', weight: 0.20 },
      { label: 'วันหมดอายุ', weight: 0.20 },
      { label: 'Days Left', weight: 0.20 },
      { label: 'Validity', weight: 0.20, align: AlignmentType.CENTER },
    ],
    [
      ['Lot A', '฿100,000', 'มี.ค. 2027', '+335 วัน', { text: '5', color: COLOR_GOOD, bold: true, align: AlignmentType.CENTER }],
      ['Lot B', '฿20,000',  'มิ.ย. 2026',  '+45 วัน',  { text: '3', color: COLOR_WARN, bold: true, align: AlignmentType.CENTER }],
      ['Lot C', '฿5,000',   'พ.ค. 2026',   '−10 วัน',  { text: '1', color: COLOR_BAD,  bold: true, align: AlignmentType.CENTER }],
    ],
  ),
  spacer(),
  para('SKU มี Total Value = ฿125,000 → Value Score (rank) สมมติ = 4'),
  spacer(),

  para('ผลลัพธ์ของแต่ละ Mode (α=3):', { bold: true }),
  buildTable(
    [
      { label: 'Mode', weight: 0.32 },
      { label: 'Validity ที่ใช้', weight: 0.25 },
      { label: 'Exp Score', weight: 0.23 },
      { label: 'Class', weight: 0.20, align: AlignmentType.CENTER },
    ],
    [
      ['🧾 By Lot — Lot A',        '5',              '4 × (5/5)³ = 4.00',  { text: 'A', bold: true, color: COLOR_GOOD, align: AlignmentType.CENTER }],
      ['🧾 By Lot — Lot B',        '3',              '4 × (3/5)³ = 0.86',  { text: 'C', bold: true, color: COLOR_BAD,  align: AlignmentType.CENTER }],
      ['🧾 By Lot — Lot C',        '1',              '4 × (1/5)³ = 0.03',  { text: 'C', bold: true, color: COLOR_BAD,  align: AlignmentType.CENTER }],
      ['⚠️ Item Worst-Case',       '1 (min)',         '4 × (1/5)³ = 0.03',  { text: 'C', bold: true, color: COLOR_BAD,  align: AlignmentType.CENTER }],
      ['⚖️ Item Weighted',         '~4.76 (avg-by-$)', '4 × (4.76/5)³ = 3.45', { text: 'B', bold: true, color: COLOR_WARN, align: AlignmentType.CENTER }],
    ],
  ),
  spacer(),

  callout('🎯 บทเรียนจากตัวอย่างนี้', [
    '• By Lot ชี้ตรงๆ ว่า Lot C ต้อง write-off, Lot B ใกล้หมด, Lot A ยังขายดี',
    '• Item Worst-Case ระบุ SKU เป็น C → ใช้เป็น Alert "ระวัง SKU นี้"',
    '• Item Weighted ระบุ SKU เป็น B → สะท้อนภาพรวมว่ายังมีของดีอยู่เยอะ',
    '• ทั้ง 3 mode "ส่งเสริมกัน" — ไม่ใช่แทนกัน',
  ], COLOR_CALLOUT_INFO, COLOR_ACCENT),
  spacer(),

  h2('11.5 เกณฑ์การเลือก Mode'),
  buildTable(
    [
      { label: 'สถานการณ์ / คำถาม', weight: 0.55 },
      { label: 'Mode ที่แนะนำ', weight: 0.45, align: AlignmentType.CENTER },
    ],
    [
      ['"วันนี้ต้องหยิบ lot ไหน?"',                            '🧾 By Lot'],
      ['"มี lot ไหนที่ต้อง Write-off?"',                         '🧾 By Lot'],
      ['"มี SKU ไหนกำลังเสี่ยง?" (alert ระดับ SKU)',             '⚠️ Item Worst-Case'],
      ['"ควรหยุดสั่งซื้อ SKU ไหน?"',                            '⚠️ Item Worst-Case'],
      ['"จะตั้งราคา/ส่วนลดให้ SKU ไหน?"',                       '⚖️ Item Weighted'],
      ['"ภาพรวม SKU นี้ในเชิงงบประมาณเป็นอย่างไร?"',           '⚖️ Item Weighted'],
      ['"กลุ่มสินค้าแต่ละกลุ่มเป็นอย่างไร?"',                    '🧾 By Lot (ที่ Group Analysis)'],
    ],
  ),
  spacer(),

  callout('📌 สรุปข้อสำคัญ', [
    '• Lot mode คือ "ความจริง" — Item modes คือ "การสรุป"',
    '• Item modes ทั้งสองรวม lot ขึ้นมา → ใช้ lot จริงเป็นพื้นฐานเหมือนกัน',
    '• ระบบบันทึก expire จาก Lot Inventory โดยตรง (ไม่ใช่ items.expire_date)',
    '• สลับ mode ได้ทันที — ทุกตัวเลข/ตาราง/กราฟอัพเดทตาม mode',
  ], COLOR_CALLOUT_GOOD, COLOR_GOOD),
];

// ── Document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'SmartInventory · NSL Food Service',
  title: 'VV Matrix Calculation Explained',
  styles: {
    default: {
      document: { run: { font: FONT, size: 24 } },
      heading1: { run: { font: FONT, size: 36, bold: true, color: COLOR_PRIMARY } },
      heading2: { run: { font: FONT, size: 30, bold: true, color: COLOR_PRIMARY } },
      heading3: { run: { font: FONT, size: 26, bold: true, color: COLOR_ACCENT } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { orientation: PageOrientation.PORTRAIT },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'VV Matrix · NSL Food Service', font: FONT, size: 18, color: COLOR_MUTED })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'หน้า ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ text: ' / ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR_MUTED }),
          ],
        })],
      }),
    },
    children: [
      ...cover,
      ...sec1Intro,
      ...sec2,
      ...sec3Config,
      ...sec4Value,
      ...sec5Validity,
      ...sec6Simple,
      ...sec7Exp,
      ...sec8Compare,
      ...sec9Whatif,
      ...sec10Summary,
      ...sec11ThreeModes,
    ],
  }],
});

// ── Pack & write ─────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, '..', 'docs', 'VV_Matrix_Calculation_Explained.docx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(`✓ Wrote ${out}`);
  console.log(`  Size: ${buf.length.toLocaleString()} bytes`);
});
