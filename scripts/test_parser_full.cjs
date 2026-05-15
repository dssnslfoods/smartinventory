const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/golf/Downloads/SmartInventory_MasterSetup_Template_140526.xlsx', { cellDates: true });

function parseSheet(wb, sheetNames, headerSignals) {
  const name = wb.SheetNames.find(n =>
    sheetNames.some(sn => n.toLowerCase().includes(sn.toLowerCase()))
  );
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
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
  const headers = rawHeaders.map((h, idx) =>
    h == null ? `__col_${idx + 1}` : String(h).replace(/\s*\*\s*$/, '').trim()
  );

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
  console.log(`  headerIdx=${headerIdx}, looksLikeDescription=${looksLikeDescription}, dataStart=${dataStart}`);
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

const W  = parseSheet(wb, ['Warehouses'], ['Warehouse Code', 'Code']);
const IG = parseSheet(wb, ['Item Groups'], ['Group Code', 'Code']);
const I  = parseSheet(wb, ['Items'], ['Item Code', 'ItemCode']);
const T  = parseSheet(wb, ['Thresholds'], ['Item Code']);
const TX = parseSheet(wb, ['Transactions'], ['Transaction No', 'TransNum', 'Date']);
const L  = parseSheet(wb, ['Lot Inventory', 'Lots', 'lot_คงเหลือ', 'Lot'], ['BatchNum Lot', 'BatchNum', 'Batch']);

console.log('\n=== Counts ===');
console.log('Warehouses:    ', W.length);
console.log('Item Groups:   ', IG.length);
console.log('Items:         ', I.length);
console.log('Thresholds:    ', T.length);
console.log('Transactions:  ', TX.length);
console.log('Lots:          ', L.length);

console.log('\n=== Sample Items row ===');
console.log(JSON.stringify(I[0], null, 2));

console.log('\n=== Sample Lot row ===');
console.log(JSON.stringify(L[0], null, 2));
