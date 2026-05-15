const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/golf/Downloads/SmartInventory_MasterSetup_Template_140526.xlsx', { cellDates: true });

// COPY OF parseSheet from importService.ts:
function parseSheet(wb, sheetNames, headerSignals) {
  const name = wb.SheetNames.find(n => sheetNames.some(sn => n.toLowerCase().includes(sn.toLowerCase())));
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
  if (!rows.length) return [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] ?? []).map(c => (c == null ? '' : String(c).replace(/\s*\*\s*$/, '').trim()));
    if (cells.some(c => headerSignals.some(sig => c === sig || c.toLowerCase() === sig.toLowerCase()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rawHeaders = rows[headerIdx] ?? [];
  const headers = rawHeaders.map((h, idx) => h == null ? `__col_${idx + 1}` : String(h).replace(/\s*\*\s*$/, '').trim());

  const next = rows[headerIdx + 1] ?? [];
  const looksLikeDescription = (() => {
    if (!next || !next.length) return false;
    let textyCount = 0;
    let idLikeCount = 0;
    for (const c of next) {
      if (c == null || c === '') continue;
      const s = String(c).trim();
      if (/^[A-Z]{1,4}-?\w{0,12}$/.test(s) || /^\d+(\.\d+)?$/.test(s)) idLikeCount++;
      else if (s.length > 2) textyCount++;
    }
    return textyCount >= 2 && idLikeCount === 0;
  })();

  const dataStart = headerIdx + (looksLikeDescription ? 2 : 1);
  const out = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    if (row[0] == null || String(row[0]).trim() === '') continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj.__row = row;
    out.push(obj);
  }
  return out;
}

function getVal(row, keys) {
  for (const key of keys) {
    if (key in row) return row[key];
    for (const k of Object.keys(row)) {
      if (k.trim() === key) return row[k];
    }
  }
  return undefined;
}

function getPositional(row, idx1Based) {
  const arr = row.__row;
  if (!arr) return undefined;
  return arr[idx1Based - 1];
}

// Mirror real importService transforms:
const warehouses = parseSheet(wb, ['Warehouses', 'คลังสินค้า'], ['Warehouse Code', 'Code']).map(row => {
  const code = getVal(row, ['Warehouse Code', 'Code']);
  if (!code) return null;
  return { code: String(code).trim() };
}).filter(Boolean);

const items = parseSheet(wb, ['Items', 'สินค้า', 'dbo_OITM'], ['Item Code', 'ItemCode']).map(row => {
  const code = getVal(row, ['Item Code', 'ItemCode']);
  if (!code) return null;
  const fsCatNamed = getVal(row, ['FS Category', 'Category', 'fs_category']);
  const fsCatPositional = fsCatNamed == null ? getPositional(row, 9) : null;
  return { item_code: String(code).trim(), fs_category: fsCatNamed ?? fsCatPositional };
}).filter(Boolean);

const lots = parseSheet(wb, ['Lot Inventory', 'Lots', 'lot_คงเหลือ', 'lot คงเหลือ', 'Lot'], ['BatchNum Lot', 'BatchNum', 'Batch', 'Lot']).map(row => {
  const ic = getVal(row, ['Item Code', 'ItemCode']);
  const wh = getVal(row, ['Warehouse', 'Warehouse Code', 'WhsCode']);
  if (!ic || !wh) return null;
  return { item_code: String(ic).trim(), warehouse: String(wh).trim() };
}).filter(Boolean);

console.log('warehouses:', warehouses.length);
console.log('items:     ', items.length);
console.log('lots:      ', lots.length);
console.log('first item:', items[0]);
console.log('first lot: ', lots[0]);
