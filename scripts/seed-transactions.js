/**
 * NSL-IIP Seed Script — Dynamic Transaction Generator
 * =====================================================
 * Queries the REAL database for existing items, warehouses, item_groups,
 * and transaction_types, then generates 15 months of sample transactions.
 *
 * REQUIRES: SUPABASE_SERVICE_ROLE_KEY (to bypass RLS for seeding)
 * Get it from: Supabase Dashboard → Settings → API → service_role key
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-transactions.js
 *   (or add key to .env.local then run: node scripts/seed-transactions.js)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'

// ─── Load env files ───────────────────────────────────────────────────────────
function loadEnvFile(path) {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && val && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0') }

/** Format date as YYYY-MM-DD */
function dateStr(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Add months to a base date, return { year, month } */
function addMonths(baseYear, baseMonth, offset) {
  const total = (baseYear - 1) * 12 + (baseMonth - 1) + offset
  return { year: Math.floor(total / 12) + 1, month: (total % 12) + 1 }
}

/** Ask user for a value from stdin */
async function askInput(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(prompt, answer => { rl.close(); resolve(answer.trim()) })
  })
}

/** Prompt with color */
const c = {
  reset:  '\x1b[0m',
  bright: '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
}
const log = {
  info:    msg => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
  ok:      msg => console.log(`${c.green}✓${c.reset} ${msg}`),
  warn:    msg => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  error:   msg => console.error(`${c.red}✗${c.reset} ${msg}`),
  section: msg => console.log(`\n${c.bright}${c.cyan}── ${msg}${c.reset}`),
  dim:     msg => console.log(`${c.dim}  ${msg}${c.reset}`),
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bright}${c.cyan}╔══════════════════════════════════════╗`)
  console.log(`║  NSL-IIP  Dynamic Seed Script        ║`)
  console.log(`╚══════════════════════════════════════╝${c.reset}\n`)

  // ── Validate env ────────────────────────────────────────────────────────────
  if (!SUPABASE_URL) {
    log.error('VITE_SUPABASE_URL not found in .env — cannot continue.')
    process.exit(1)
  }

  let serviceKey = SERVICE_KEY
  if (!serviceKey) {
    log.warn('SUPABASE_SERVICE_ROLE_KEY not set.')
    console.log(`\nGet it from: ${c.cyan}Supabase Dashboard → Settings → API → service_role${c.reset}`)
    console.log(`Then add to ${c.bright}.env.local${c.reset}:`)
    console.log(`  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n`)
    serviceKey = await askInput('Paste your service_role key now (or Ctrl+C to abort): ')
    if (!serviceKey) { log.error('No key provided. Aborting.'); process.exit(1) }
  }

  // ── Connect with service role (bypasses RLS) ────────────────────────────────
  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // ── Test connection ─────────────────────────────────────────────────────────
  log.section('Connecting to database')
  const { error: pingErr } = await supabase.from('warehouses').select('code').limit(1)
  if (pingErr) {
    log.error(`Cannot connect: ${pingErr.message}`)
    if (pingErr.message.includes('Invalid API key')) {
      log.error('The service_role key is invalid. Please check and try again.')
    }
    process.exit(1)
  }
  log.ok(`Connected to ${SUPABASE_URL}`)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Pull reference data from the REAL database
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Pulling reference data from database')

  const [
    { data: warehouses,  error: wErr },
    { data: itemGroups,  error: gErr },
    { data: transTypes,  error: tErr },
    { data: existingItems, error: iErr },
  ] = await Promise.all([
    supabase.from('warehouses').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('item_groups').select('*').order('group_code'),
    supabase.from('transaction_types').select('*').order('trans_type'),
    supabase.from('items').select('*').eq('is_active', true).order('item_code').limit(50),
  ])

  for (const [label, err] of [['warehouses', wErr], ['item_groups', gErr], ['transaction_types', tErr], ['items', iErr]]) {
    if (err) { log.error(`Failed to query ${label}: ${err.message}`); process.exit(1) }
  }

  log.ok(`Warehouses found: ${warehouses.length}`)
  log.ok(`Item groups found: ${itemGroups.length}  [${itemGroups.map(g => g.group_code).join(', ')}]`)
  log.ok(`Transaction types found: ${transTypes.length}`)
  log.ok(`Existing items found: ${existingItems.length}`)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Build lookup maps from REAL database data
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Building warehouse → item-group mapping')

  // Group warehouses by whs_type
  const warehousesByType = {}
  for (const wh of warehouses) {
    if (!warehousesByType[wh.whs_type]) warehousesByType[wh.whs_type] = []
    warehousesByType[wh.whs_type].push(wh)
  }
  log.dim(`Warehouse types: ${Object.keys(warehousesByType).join(', ')}`)

  // Map item group → primary warehouse (first of matching type)
  const groupNames = Object.fromEntries(itemGroups.map(g => [g.group_code, g.group_name]))

  /** Pick the first warehouse whose type matches a keyword */
  function pickWarehouse(...typeKeywords) {
    for (const kw of typeKeywords) {
      for (const [type, whs] of Object.entries(warehousesByType)) {
        if (type.toLowerCase().includes(kw.toLowerCase())) return whs[0]
      }
    }
    return warehouses[0] // fallback: first warehouse
  }

  // Build group_code → warehouse mapping from REAL warehouse data
  const groupWarehouseMap = {}
  for (const group of itemGroups) {
    const name = group.group_name.toLowerCase()
    if (name.includes('fg') || name.includes('finish')) {
      groupWarehouseMap[group.group_code] = pickWarehouse('Finish', 'FG')
    } else if (name.includes('rm') || name.includes('raw')) {
      groupWarehouseMap[group.group_code] = pickWarehouse('Raw', 'RM')
    } else if (name.includes('pkg') || name.includes('pack')) {
      groupWarehouseMap[group.group_code] = pickWarehouse('Pack', 'PK')
    } else if (name.includes('by') || name.includes('waste')) {
      groupWarehouseMap[group.group_code] = pickWarehouse('Waste', 'WS', 'Finish')
    } else {
      groupWarehouseMap[group.group_code] = warehouses[0]
    }
    const wh = groupWarehouseMap[group.group_code]
    log.dim(`Group ${group.group_code} (${group.group_name}) → ${wh?.code} (${wh?.whs_type})`)
  }

  // Lookup transaction types from REAL database
  const ttMap = Object.fromEntries(transTypes.map(t => [t.trans_type, t]))
  const ttByDir = {}
  for (const tt of transTypes) {
    if (!ttByDir[tt.direction]) ttByDir[tt.direction] = tt
  }

  const tt_opening = transTypes.find(t => t.direction === 'Opening')
  const tt_in_grpo  = transTypes.find(t => t.direction === 'In' && t.trans_name.toLowerCase().includes('goods receipt po'))
                   || transTypes.find(t => t.direction === 'In' && t.trans_name.toLowerCase().includes('goods receipt'))
                   || transTypes.find(t => t.direction === 'In')
  const tt_in_prod  = transTypes.find(t => t.direction === 'In' && t.trans_name.toLowerCase().includes('receipt') && !t.trans_name.toLowerCase().includes('po'))
                   || tt_in_grpo
  const tt_out_del  = transTypes.find(t => t.direction === 'Out' && t.trans_name.toLowerCase().includes('delivery'))
                   || transTypes.find(t => t.direction === 'Out' && t.trans_name.toLowerCase().includes('issue'))
                   || transTypes.find(t => t.direction === 'Out')
  const tt_out_gi   = transTypes.find(t => t.direction === 'Out' && t.trans_name.toLowerCase().includes('issue'))
                   || tt_out_del

  log.dim(`Opening trans_type: ${tt_opening?.trans_type} (${tt_opening?.trans_name})`)
  log.dim(`In (GR PO) trans_type: ${tt_in_grpo?.trans_type} (${tt_in_grpo?.trans_name})`)
  log.dim(`In (Production) trans_type: ${tt_in_prod?.trans_type} (${tt_in_prod?.trans_name})`)
  log.dim(`Out (Delivery) trans_type: ${tt_out_del?.trans_type} (${tt_out_del?.trans_name})`)
  log.dim(`Out (GI) trans_type: ${tt_out_gi?.trans_type} (${tt_out_gi?.trans_name})`)

  if (!tt_opening || !tt_in_grpo || !tt_out_del) {
    log.error('Could not find required transaction types in database. Ensure migration_v2.sql was applied.')
    process.exit(1)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Prepare items — use existing DB items or create sample ones
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Preparing items')

  let items = existingItems

  if (items.length === 0) {
    log.warn('No items found in database. Creating sample items...')
    // If DB has no items, insert samples derived from real item_groups
    const sampleItems = []
    for (const group of itemGroups) {
      const name = group.group_name.toLowerCase()
      if (name.includes('fg') || name.includes('finish')) {
        sampleItems.push(
          { item_code: 'FG-DEMO-001', itemname: 'สินค้าสำเร็จรูป A',  foreign_name: 'Finished Product A', uom: 'KG', std_cost: 45.00, moving_avg: 47.50, group_code: group.group_code, is_active: true },
          { item_code: 'FG-DEMO-002', itemname: 'สินค้าสำเร็จรูป B',  foreign_name: 'Finished Product B', uom: 'KG', std_cost: 38.00, moving_avg: 40.00, group_code: group.group_code, is_active: true },
          { item_code: 'FG-DEMO-003', itemname: 'สินค้าสำเร็จรูป C',  foreign_name: 'Finished Product C', uom: 'KG', std_cost: 55.00, moving_avg: 58.00, group_code: group.group_code, is_active: true }
        )
      } else if (name.includes('rm') || name.includes('raw')) {
        sampleItems.push(
          { item_code: 'RM-DEMO-001', itemname: 'วัตถุดิบ A', foreign_name: 'Raw Material A', uom: 'KG', std_cost: 12.00, moving_avg: 13.50, group_code: group.group_code, is_active: true },
          { item_code: 'RM-DEMO-002', itemname: 'วัตถุดิบ B', foreign_name: 'Raw Material B', uom: 'KG', std_cost:  8.00, moving_avg:  8.50, group_code: group.group_code, is_active: true },
          { item_code: 'RM-DEMO-003', itemname: 'วัตถุดิบ C', foreign_name: 'Raw Material C', uom: 'KG', std_cost: 22.00, moving_avg: 23.00, group_code: group.group_code, is_active: true },
          { item_code: 'RM-DEMO-004', itemname: 'วัตถุดิบ D (Slow)', foreign_name: 'Raw Material D Slow', uom: 'KG', std_cost: 65.00, moving_avg: 68.00, group_code: group.group_code, is_active: true }
        )
      } else if (name.includes('pkg') || name.includes('pack')) {
        sampleItems.push(
          { item_code: 'PKG-DEMO-001', itemname: 'บรรจุภัณฑ์ A', foreign_name: 'Packaging A', uom: 'EA', std_cost:  3.50, moving_avg:  3.80, group_code: group.group_code, is_active: true },
          { item_code: 'PKG-DEMO-002', itemname: 'บรรจุภัณฑ์ B', foreign_name: 'Packaging B', uom: 'EA', std_cost:  6.50, moving_avg:  7.00, group_code: group.group_code, is_active: true },
          { item_code: 'PKG-DEMO-003', itemname: 'บรรจุภัณฑ์ C (Critical)', foreign_name: 'Packaging C Critical', uom: 'EA', std_cost: 18.00, moving_avg: 19.00, group_code: group.group_code, is_active: true }
        )
      }
    }

    if (sampleItems.length > 0) {
      const { error } = await supabase.from('items').upsert(sampleItems, { onConflict: 'item_code' })
      if (error) { log.error(`Failed to insert sample items: ${error.message}`); process.exit(1) }
      log.ok(`Inserted ${sampleItems.length} sample items`)
      items = sampleItems
    }
  } else {
    log.ok(`Using ${items.length} existing items from database`)
    items.slice(0, 5).forEach(i => log.dim(`  ${i.item_code} — ${i.itemname} (group ${i.group_code})`))
    if (items.length > 5) log.dim(`  ... and ${items.length - 5} more`)
  }

  // Limit to first 20 items to keep seed manageable
  const targetItems = items.slice(0, 20)
  log.info(`Generating transactions for ${targetItems.length} items`)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: Generate transactions dynamically
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Generating transactions (Jan 2025 – Mar 2026)')

  const START_YEAR  = 2025
  const START_MONTH = 1
  const NUM_MONTHS  = 15 // Jan 2025 → Mar 2026

  const transactions = []
  let transNum = 90001 // seed range: 90001+ to avoid conflicts with SAP imports

  // Determine which items are "slow moving" (last 30% of each group = slow)
  const itemsByGroup = {}
  for (const item of targetItems) {
    if (!itemsByGroup[item.group_code]) itemsByGroup[item.group_code] = []
    itemsByGroup[item.group_code].push(item)
  }

  const slowMovingItemCodes = new Set()
  const criticalItemCodes   = new Set()
  for (const [, grpItems] of Object.entries(itemsByGroup)) {
    if (grpItems.length >= 3) {
      slowMovingItemCodes.add(grpItems[grpItems.length - 1].item_code) // last item = dead stock
      criticalItemCodes.add(grpItems[grpItems.length - 2]?.item_code)  // 2nd-to-last = critical
    } else if (grpItems.length === 2) {
      slowMovingItemCodes.add(grpItems[1].item_code)
    }
  }

  log.dim(`Slow-moving items: ${[...slowMovingItemCodes].join(', ') || 'none'}`)
  log.dim(`Critical-stock items: ${[...criticalItemCodes].join(', ') || 'none'}`)

  for (const item of targetItems) {
    const warehouse = groupWarehouseMap[item.group_code]
    if (!warehouse) {
      log.warn(`No warehouse mapped for group ${item.group_code} — skipping ${item.item_code}`)
      continue
    }

    const movingAvg    = parseFloat(item.moving_avg) || parseFloat(item.std_cost) || 10
    const isPackaging  = (item.uom || 'KG').toUpperCase() === 'EA'
    const isFG         = groupNames[item.group_code]?.toLowerCase().includes('fg')
                      || groupNames[item.group_code]?.toLowerCase().includes('finish')
    const isSlowMoving = slowMovingItemCodes.has(item.item_code)
    const isCritical   = criticalItemCodes.has(item.item_code)

    // Scale quantities by unit value (cheaper items → larger qty)
    const qtyScale = movingAvg < 5 ? 50000 : movingAvg < 15 ? 15000 : movingAvg < 50 ? 5000 : 1000

    const monthlyIn  = isPackaging ? qtyScale : Math.round(qtyScale / movingAvg * 10) * 10 || 1000
    const monthlyOut = Math.round(monthlyIn * (isSlowMoving ? 0.08 : isCritical ? 0.80 : 0.93))
    const openingQty = Math.round(monthlyIn * (isSlowMoving ? 0.5 : 3.0))

    // ── Opening Balance (2025-01-01) ──────────────────────────────────────────
    transactions.push({
      trans_num:    transNum++,
      doc_date:     '2025-01-01',
      trans_type:   tt_opening.trans_type,
      warehouse:    warehouse.code,
      group_code:   item.group_code,
      doc_line_num: -1,
      item_code:    item.item_code,
      in_qty:       openingQty,
      out_qty:      0,
      balance_qty:  0,
      amount:       openingQty * movingAvg,
      direction:    'Opening',
    })

    // ── Monthly Transactions ─────────────────────────────────────────────────
    // Slow-moving: stop after month 6 (Jun 2025) → dead stock by Mar 2026
    // Critical: receive less → stock depletes near threshold
    const activeMonths = isSlowMoving ? 6 : NUM_MONTHS

    for (let m = 0; m < activeMonths; m++) {
      const { year, month } = addMonths(START_YEAR, START_MONTH, m)
      const todayYear = 2026, todayMonth = 3, todayDay = 23

      // Skip future dates
      if (year > todayYear || (year === todayYear && month > todayMonth)) continue

      const inTransType  = isFG ? tt_in_prod.trans_type  : tt_in_grpo.trans_type
      const outTransType = isFG ? tt_out_del.trans_type   : tt_out_gi.trans_type
      const inDir   = 'In'
      const outDir  = 'Out'

      // Receipt on day 10
      const inDate  = dateStr(year, month, 10)
      // Issue/Delivery on day 22 (skip if future)
      const outDay  = 22
      const outDate = dateStr(year, month, outDay)
      const outIsFuture = (year === todayYear && month === todayMonth && outDay > todayDay)

      transactions.push({
        trans_num:    transNum++,
        doc_date:     inDate,
        trans_type:   inTransType,
        warehouse:    warehouse.code,
        group_code:   item.group_code,
        doc_line_num: 0,
        item_code:    item.item_code,
        in_qty:       monthlyIn,
        out_qty:      0,
        balance_qty:  0,
        amount:       monthlyIn * movingAvg,
        direction:    inDir,
      })

      if (!outIsFuture) {
        transactions.push({
          trans_num:    transNum++,
          doc_date:     outDate,
          trans_type:   outTransType,
          warehouse:    warehouse.code,
          group_code:   item.group_code,
          doc_line_num: 0,
          item_code:    item.item_code,
          in_qty:       0,
          out_qty:      monthlyOut,
          balance_qty:  0,
          amount:       monthlyOut * movingAvg,
          direction:    outDir,
        })
      }
    }
  }

  log.ok(`Generated ${transactions.length} transactions for ${targetItems.length} items`)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 5: Insert transactions in batches
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Inserting transactions into database')

  const BATCH_SIZE = 500
  let inserted = 0
  let skipped  = 0

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('inventory_transactions')
      .upsert(batch, { onConflict: 'trans_num,item_code,doc_line_num', ignoreDuplicates: true })

    if (error) {
      log.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`)
      process.exit(1)
    }
    inserted += batch.length
    process.stdout.write(`\r  Progress: ${inserted}/${transactions.length} rows inserted...`)
  }
  console.log('') // newline after progress
  log.ok(`Inserted ${inserted} transactions (${skipped} skipped as duplicates)`)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 6: Stock Thresholds — derived from monthly consumption pattern
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Setting stock thresholds')

  const thresholds = []
  for (const item of targetItems) {
    const warehouse = groupWarehouseMap[item.group_code]
    if (!warehouse) continue

    const movingAvg    = parseFloat(item.moving_avg) || parseFloat(item.std_cost) || 10
    const isPackaging  = (item.uom || 'KG').toUpperCase() === 'EA'
    const isFG         = groupNames[item.group_code]?.toLowerCase().includes('fg') || groupNames[item.group_code]?.toLowerCase().includes('finish')
    const isSlowMoving = slowMovingItemCodes.has(item.item_code)
    const isCritical   = criticalItemCodes.has(item.item_code)

    const monthlyIn  = isPackaging ? (movingAvg < 5 ? 50000 : 30000) : Math.round((movingAvg < 15 ? 15000 : movingAvg < 50 ? 5000 : 1000) / movingAvg * 10) * 10 || 1000
    const monthlyOut = Math.round(monthlyIn * (isSlowMoving ? 0.08 : isCritical ? 0.80 : 0.93))

    const dailyOut = Math.round(monthlyOut / 30)
    const minLevel      = dailyOut * 7   // 7 days cover
    const reorderPoint  = dailyOut * 14  // 14 days cover
    const maxLevel      = dailyOut * 60  // 2 months cover

    // For slow-moving: set thresholds high to trigger overstock alert
    // For critical: set thresholds to trigger critical/warning
    const thMin    = isSlowMoving ? minLevel * 0.5  : isCritical ? minLevel * 1.5  : minLevel
    const thReord  = isSlowMoving ? reorderPoint * 0.5 : isCritical ? reorderPoint * 1.2 : reorderPoint
    const thMax    = isSlowMoving ? maxLevel * 0.3  : maxLevel  // slow = overstock soon

    thresholds.push({
      item_code:     item.item_code,
      warehouse:     warehouse.code,
      min_level:     Math.max(1, Math.round(thMin)),
      reorder_point: Math.max(2, Math.round(thReord)),
      max_level:     Math.max(3, Math.round(thMax)),
    })
  }

  if (thresholds.length > 0) {
    const { error } = await supabase
      .from('stock_thresholds')
      .upsert(thresholds, { onConflict: 'item_code,warehouse' })
    if (error) { log.warn(`Thresholds upsert warning: ${error.message}`) }
    else log.ok(`Upserted ${thresholds.length} stock thresholds`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 7: Suppliers (query first, insert if none exist)
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Setting up suppliers & purchase orders')

  const { data: existingSuppliers } = await supabase.from('suppliers').select('supplier_code').limit(1)

  if (!existingSuppliers || existingSuppliers.length === 0) {
    const suppliers = [
      { supplier_code: 'SUP-TH-001', supplier_name: 'Thai Marine Foods Co., Ltd.',     country: 'Thailand', default_lead_days: 7,  contact_name: 'คุณสมชาย ทะเลไทย', contact_email: 'somchai@thaim.co.th',  is_active: true },
      { supplier_code: 'SUP-TH-002', supplier_name: 'SiamSpice Products Co., Ltd.',    country: 'Thailand', default_lead_days: 14, contact_name: 'คุณวิภา พริกสยาม',  contact_email: 'wipa@siamspice.co.th', is_active: true },
      { supplier_code: 'SUP-CN-001', supplier_name: 'Jiangsu Packaging International', country: 'China',    default_lead_days: 45, contact_name: 'Mr. Wang Lei',        contact_email: 'wanglei@jspkg.com',   is_active: true },
    ]
    const { error } = await supabase.from('suppliers').upsert(suppliers, { onConflict: 'supplier_code' })
    if (error) log.warn(`Suppliers: ${error.message}`)
    else log.ok('Inserted 3 sample suppliers')
  } else {
    log.ok('Suppliers already exist — skipping')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 8: Purchase Orders (in-transit to test v_goods_in_transit)
  // Pick real items for PO lines
  // ─────────────────────────────────────────────────────────────────────────────
  const { data: existingPOs } = await supabase.from('purchase_orders').select('po_number').limit(1)

  if (!existingPOs || existingPOs.length === 0) {
    // Find suppliers that exist
    const { data: suppliers } = await supabase.from('suppliers').select('supplier_code').limit(3)
    if (suppliers && suppliers.length > 0) {
      const sup1 = suppliers[0].supplier_code
      const sup2 = (suppliers[1] || suppliers[0]).supplier_code
      const sup3 = (suppliers[2] || suppliers[0]).supplier_code

      const pos = [
        { po_number: 'PO-DEMO-001', supplier_code: sup3, order_date: '2026-01-20', expected_arrival: '2026-03-30', status: 'customs',    shipping_method: 'Sea',  tracking_number: 'MSC-DEMO789', notes: 'Packaging restock Q1/2026' },
        { po_number: 'PO-DEMO-002', supplier_code: sup1, order_date: '2026-03-01', expected_arrival: '2026-03-28', status: 'confirmed',  shipping_method: 'Land', tracking_number: null,           notes: 'Urgent RM restock' },
        { po_number: 'PO-DEMO-003', supplier_code: sup2, order_date: '2026-03-05', expected_arrival: '2026-04-10', status: 'in_transit', shipping_method: 'Land', tracking_number: 'TRK-DEMO991',  notes: 'Q2/2026 materials' },
      ]
      const { error: poErr } = await supabase.from('purchase_orders').upsert(pos, { onConflict: 'po_number' })
      if (poErr) { log.warn(`POs: ${poErr.message}`) }
      else {
        log.ok('Inserted 3 sample purchase orders')

        // Add PO lines using REAL items from DB
        const poLines = []
        for (const [idx, po] of pos.entries()) {
          const grpItems = targetItems.filter(i => {
            const gn = groupNames[i.group_code]?.toLowerCase() || ''
            if (idx === 0) return gn.includes('pkg') || gn.includes('pack')
            if (idx === 1) return gn.includes('rm') || gn.includes('raw')
            return gn.includes('rm') || gn.includes('raw')
          })
          const lineItems = grpItems.slice(0, 2)
          for (const item of lineItems) {
            const wh = groupWarehouseMap[item.group_code]
            if (!wh) continue
            const price = parseFloat(item.std_cost) || parseFloat(item.moving_avg) || 10
            const isEA  = (item.uom || 'KG').toUpperCase() === 'EA'
            poLines.push({
              po_number:    po.po_number,
              item_code:    item.item_code,
              warehouse:    wh.code,
              ordered_qty:  isEA ? 100000 : 20000,
              received_qty: 0,
              unit_price:   price,
              status:       'pending',
            })
          }
        }

        if (poLines.length > 0) {
          const { error: lineErr } = await supabase
            .from('purchase_order_lines')
            .upsert(poLines, { onConflict: 'po_number,item_code,warehouse' })
          if (lineErr) log.warn(`PO lines: ${lineErr.message}`)
          else log.ok(`Inserted ${poLines.length} PO lines`)
        }
      }
    }
  } else {
    log.ok('Purchase orders already exist — skipping')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 9: Import log
  // ─────────────────────────────────────────────────────────────────────────────
  await supabase.from('import_logs').insert({
    file_name:           'seed-transactions.js (dynamic seed)',
    items_count:         targetItems.length,
    transactions_count:  transactions.length,
    status:              'success',
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // DONE
  // ─────────────────────────────────────────────────────────────────────────────
  log.section('Verification — Stock Summary')

  const { data: stockSummary } = await supabase
    .from('v_stock_onhand')
    .select('item_code, itemname, warehouse, current_stock, uom, stock_value')
    .order('group_code')
    .order('item_code')
    .limit(25)

  if (stockSummary && stockSummary.length > 0) {
    console.log(`\n  ${'Item Code'.padEnd(18)} ${'Name'.padEnd(30)} ${'WH'.padEnd(10)} ${'Stock'.padStart(12)} ${'UOM'.padStart(6)}`)
    console.log(`  ${'─'.repeat(80)}`)
    for (const row of stockSummary) {
      const stock = Number(row.current_stock).toLocaleString('th-TH', { maximumFractionDigits: 0 })
      console.log(`  ${String(row.item_code).padEnd(18)} ${String(row.itemname).slice(0, 30).padEnd(30)} ${String(row.warehouse).padEnd(10)} ${stock.padStart(12)} ${String(row.uom).padStart(6)}`)
    }
  }

  const { data: alerts } = await supabase
    .from('v_stock_alerts')
    .select('item_code, status')
    .order('status')

  if (alerts) {
    log.section('Alert Summary')
    const counts = { critical: 0, warning: 0, overstock: 0, normal: 0 }
    for (const a of alerts) counts[a.status] = (counts[a.status] || 0) + 1
    console.log(`  ${c.red}Critical: ${counts.critical}${c.reset}  ${c.yellow}Warning: ${counts.warning}${c.reset}  Overstock: ${counts.overstock}  Normal: ${counts.normal}`)
  }

  console.log(`\n${c.bright}${c.green}✅ Seed complete!${c.reset}`)
  console.log(`   ${transactions.length} transactions inserted for ${targetItems.length} items`)
  console.log(`   Open the app and check: Stock, Reports, Alerts, Goods in Transit\n`)
}

main().catch(err => {
  console.error(`\n${c.red}Fatal error:${c.reset}`, err.message)
  process.exit(1)
})
