// Mimic the parseSheet() logic locally
const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/golf/Downloads/SmartInventory_MasterSetup_Template_140526.xlsx', { cellDates: true });

console.log('Sheet names:', wb.SheetNames);

function parseSheet(wb, sheetNames, headerSignals) {
  const name = wb.SheetNames.find(n =>
    sheetNames.some(sn => n.toLowerCase().includes(sn.toLowerCase()))
  );
  console.log(`\n[${sheetNames[0]}] matched sheet:`, name);
  if (!name) return [];
  const sheet = wb.Sheets[name];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  console.log(`  total rows: ${rows.length}, first row:`, JSON.stringify(rows[0]).slice(0, 100));
  console.log(`  row 4:`, JSON.stringify(rows[3]).slice(0, 150));

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] ?? []).map(c => (c == null ? '' : String(c).replace(/\s*\*\s*$/, '').trim()));
    console.log(`  row${i+1} stripped:`, JSON.stringify(cells.slice(0, 5)));
    if (cells.some(c => headerSignals.some(sig => c === sig || c.toLowerCase() === sig.toLowerCase()))) {
      headerIdx = i;
      console.log(`  → MATCH at row${i+1}`);
      break;
    }
  }
  if (headerIdx === -1) {
    console.log(`  → NO MATCH for signals: ${headerSignals}`);
    return [];
  }
  return [{ ok: true, headerIdx }];
}

parseSheet(wb, ['Warehouses', 'คลังสินค้า'], ['Warehouse Code', 'Code']);
parseSheet(wb, ['Items', 'สินค้า', 'dbo_OITM'], ['Item Code', 'ItemCode']);
parseSheet(wb, ['Lot Inventory', 'Lots', 'lot_คงเหลือ', 'lot คงเหลือ', 'Lot'], ['BatchNum Lot', 'BatchNum', 'Batch', 'Lot']);
