-- ============================================
-- NSL-IIP Database Migration v2
-- Normalization + Management Reporting Views
-- Run this in Supabase SQL Editor (after migration.sql)
-- ============================================

-- ── PHASE 1: Lookup / Reference Tables ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  code       TEXT PRIMARY KEY,
  whs_name   TEXT NOT NULL,
  whs_type   TEXT NOT NULL DEFAULT 'Other',
  is_active  BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 99
);

CREATE TABLE IF NOT EXISTS item_groups (
  group_code  INTEGER PRIMARY KEY,
  group_name  TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS transaction_types (
  trans_type  INTEGER PRIMARY KEY,
  trans_name  TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('In','Out','Transfers','Cost','Opening'))
);

-- ── PHASE 2: Seed Reference Data ──────────────────────────────────────────────

INSERT INTO warehouses (code, whs_name, whs_type, sort_order) VALUES
  ('FS-FG01', 'คลัง FG - ใน1',                'Finish Goods',   1),
  ('FS-FG02', 'คลัง FG - ใน2',                'Finish Goods',   2),
  ('FS-FG03', 'คลัง FG - นอก',                'Finish Goods',   3),
  ('FS-RM01', 'คลัง RM - ใน1',                'Raw Materials',  4),
  ('FS-RM02', 'คลัง RM - ใน2',                'Raw Materials',  5),
  ('FS-RM03', 'คลัง RM - นอก1',               'Raw Materials',  6),
  ('FS-RM04', 'คลัง RM - นอก2',               'Raw Materials',  7),
  ('FS-PD01', 'คลังผลิต - ใน1',               'Production',     8),
  ('FS-PD02', 'คลังผลิต - ใน2',               'Production',     9),
  ('FS-PK01', 'คลัง PK&Factory Supply - ใน1', 'Packaging',     10),
  ('FS-PK02', 'คลัง PK&Factory Supply - ใน2', 'Packaging',     11),
  ('FS-QC01', 'คลัง QC - ใน',                 'Quality Control',12),
  ('FS-QC02', 'คลัง QC - นอก',                'Quality Control',13),
  ('FS-CL01', 'คลังรอเคลมในประเทศ',            'Claim Hold',    14),
  ('FS-CO01', 'คลังรอเคลมต่างประเทศ',          'Claim Hold',    15),
  ('FS-WS01', 'คลังของเสียรอทำลาย - ใน1',     'Waste',         16),
  ('BT-RM02', 'บางบัวทอง คลัง RM-Frozen',     'Raw Materials', 17)
ON CONFLICT (code) DO UPDATE
  SET whs_name = EXCLUDED.whs_name,
      whs_type = EXCLUDED.whs_type,
      sort_order = EXCLUDED.sort_order;

INSERT INTO item_groups (group_code, group_name) VALUES
  (123, 'FFG-Finish Goods'),
  (125, 'FRM-Raw Materials'),
  (126, 'FBY-By Product'),
  (127, 'FPKG-Packaging')
ON CONFLICT (group_code) DO UPDATE
  SET group_name = EXCLUDED.group_name;

INSERT INTO transaction_types (trans_type, trans_name, direction) VALUES
  (0,   'Opening',               'Opening'),
  (15,  'Delivery',              'Out'),
  (16,  'Return',                'In'),
  (18,  'A/P Invoice',           'In'),
  (20,  'Goods Receipt PO',      'In'),
  (21,  'Goods Return',          'Out'),
  (59,  'Goods Receipt',         'In'),
  (60,  'Goods Issue',           'Out'),
  (67,  'Inventory Transfers',   'Transfers'),
  (69,  'Landed Cost',           'Cost'),
  (162, 'Inventory Revaluation', 'Cost')
ON CONFLICT (trans_type) DO UPDATE
  SET trans_name = EXCLUDED.trans_name,
      direction  = EXCLUDED.direction;

-- ── PHASE 3: RLS for Reference Tables ─────────────────────────────────────────

ALTER TABLE warehouses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read warehouses"       ON warehouses;
DROP POLICY IF EXISTS "Users can read item_groups"      ON item_groups;
DROP POLICY IF EXISTS "Users can read transaction_types" ON transaction_types;
DROP POLICY IF EXISTS "Users can manage warehouses"      ON warehouses;
DROP POLICY IF EXISTS "Users can manage item_groups"     ON item_groups;

CREATE POLICY "Users can read warehouses"        ON warehouses       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read item_groups"       ON item_groups      FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read transaction_types" ON transaction_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage warehouses"      ON warehouses       FOR ALL    TO authenticated USING (true);
CREATE POLICY "Users can manage item_groups"     ON item_groups      FOR ALL    TO authenticated USING (true);

-- ── PHASE 4: Back-fill Any Missing Lookup Rows from Live Data ─────────────────
-- Safety net: seed any warehouse/group/trans_type codes found in live data
-- that are not already covered by Phase 2 seed.
-- Uses only the code columns (not the dropped name columns) as fallback names.

INSERT INTO warehouses (code, whs_name, whs_type)
  SELECT DISTINCT t.warehouse,
         t.warehouse,   -- fallback: use code as name until properly named
         'Other'
  FROM   inventory_transactions t
  WHERE  NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.code = t.warehouse)
ON CONFLICT (code) DO NOTHING;

INSERT INTO item_groups (group_code, group_name)
  SELECT DISTINCT i.group_code,
         'Group ' || i.group_code
  FROM   items i
  WHERE  NOT EXISTS (SELECT 1 FROM item_groups g WHERE g.group_code = i.group_code)
ON CONFLICT (group_code) DO NOTHING;

INSERT INTO item_groups (group_code, group_name)
  SELECT DISTINCT t.group_code,
         'Group ' || t.group_code
  FROM   inventory_transactions t
  WHERE  NOT EXISTS (SELECT 1 FROM item_groups g WHERE g.group_code = t.group_code)
ON CONFLICT (group_code) DO NOTHING;

INSERT INTO transaction_types (trans_type, trans_name, direction)
  SELECT DISTINCT t.trans_type,
         'Type ' || t.trans_type,
         COALESCE(t.direction, 'In')
  FROM   inventory_transactions t
  WHERE  NOT EXISTS (SELECT 1 FROM transaction_types tt WHERE tt.trans_type = t.trans_type)
ON CONFLICT (trans_type) DO NOTHING;

-- ── PHASE 5: Add FK Constraints (idempotent via DO block) ─────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_group_code') THEN
    ALTER TABLE items
      ADD CONSTRAINT fk_items_group_code
      FOREIGN KEY (group_code) REFERENCES item_groups(group_code)
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transactions_warehouse') THEN
    ALTER TABLE inventory_transactions
      ADD CONSTRAINT fk_transactions_warehouse
      FOREIGN KEY (warehouse) REFERENCES warehouses(code)
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transactions_trans_type') THEN
    ALTER TABLE inventory_transactions
      ADD CONSTRAINT fk_transactions_trans_type
      FOREIGN KEY (trans_type) REFERENCES transaction_types(trans_type)
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transactions_group_code') THEN
    ALTER TABLE inventory_transactions
      ADD CONSTRAINT fk_transactions_group_code
      FOREIGN KEY (group_code) REFERENCES item_groups(group_code)
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_thresholds_warehouse') THEN
    ALTER TABLE stock_thresholds
      ADD CONSTRAINT fk_thresholds_warehouse
      FOREIGN KEY (warehouse) REFERENCES warehouses(code)
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ── PHASE 6: Drop Dependent Views First, Then Redundant Columns ──────────────
-- Views must be dropped before columns they depend on can be removed.

DROP VIEW IF EXISTS v_stock_alerts        CASCADE;
DROP VIEW IF EXISTS v_slow_moving         CASCADE;
DROP VIEW IF EXISTS v_inventory_turnover  CASCADE;
DROP VIEW IF EXISTS v_reorder_suggestions CASCADE;
DROP VIEW IF EXISTS v_abc_analysis        CASCADE;
DROP VIEW IF EXISTS v_transactions        CASCADE;
DROP VIEW IF EXISTS v_stock_onhand        CASCADE;
DROP VIEW IF EXISTS v_movement_monthly    CASCADE;

ALTER TABLE inventory_transactions
  DROP COLUMN IF EXISTS whs_name,
  DROP COLUMN IF EXISTS group_name,
  DROP COLUMN IF EXISTS trans_name;

ALTER TABLE items
  DROP COLUMN IF EXISTS group_name;

-- ── PHASE 7: Recreate Views ────────────────────────────────────────────────────

-- v_stock_onhand: current inventory position per item + warehouse
CREATE OR REPLACE VIEW v_stock_onhand AS
SELECT
  t.item_code,
  i.itemname,
  i.foreign_name,
  t.warehouse,
  w.whs_name,
  w.whs_type,
  i.group_code,
  g.group_name,
  COALESCE(SUM(t.in_qty - t.out_qty), 0)                      AS current_stock,
  i.uom,
  i.moving_avg,
  i.std_cost,
  COALESCE(SUM(t.in_qty - t.out_qty), 0) * i.moving_avg       AS stock_value,
  i.is_active
FROM inventory_transactions t
JOIN items          i ON i.item_code  = t.item_code
JOIN warehouses     w ON w.code       = t.warehouse
JOIN item_groups    g ON g.group_code = i.group_code
GROUP BY
  t.item_code, t.warehouse,
  i.itemname, i.foreign_name, i.uom, i.moving_avg, i.std_cost, i.is_active,
  i.group_code, g.group_name,
  w.whs_name, w.whs_type;

-- v_movement_monthly: monthly in/out summary for trend charts
-- Aggregates at month+warehouse+direction level (not item level) to keep row count low
-- (Supabase PostgREST has a default 1000-row limit; item-level grouping can exceed this)
CREATE OR REPLACE VIEW v_movement_monthly AS
SELECT
  DATE_TRUNC('month', t.doc_date)::DATE AS month,
  t.warehouse,
  t.direction,
  t.group_code,
  g.group_name,
  SUM(t.in_qty)   AS total_in,
  SUM(t.out_qty)  AS total_out,
  SUM(t.amount)   AS total_amount,
  COUNT(*)        AS transaction_count
FROM inventory_transactions t
LEFT JOIN item_groups g ON g.group_code = t.group_code
GROUP BY 1, 2, 3, 4, 5;

-- v_transactions: full transaction detail with joined names (replaces raw table query)
CREATE OR REPLACE VIEW v_transactions AS
SELECT
  t.id,
  t.trans_num,
  t.doc_date,
  t.trans_type,
  tt.trans_name,
  t.warehouse,
  w.whs_name,
  t.group_code,
  g.group_name,
  t.doc_line_num,
  t.item_code,
  i.itemname,
  i.foreign_name,
  t.in_qty,
  t.out_qty,
  t.balance_qty,
  t.amount,
  t.direction,
  t.created_at
FROM inventory_transactions t
JOIN items            i  ON i.item_code  = t.item_code
JOIN warehouses       w  ON w.code       = t.warehouse
JOIN item_groups      g  ON g.group_code = t.group_code
JOIN transaction_types tt ON tt.trans_type = t.trans_type;

-- ── PHASE 8: Management Reporting Views ───────────────────────────────────────

-- v_stock_alerts: server-side computed stock alerts with real days_remaining
CREATE OR REPLACE VIEW v_stock_alerts AS
WITH daily_avg AS (
  SELECT
    item_code,
    warehouse,
    -- Divide total 90-day outflow by actual elapsed days (not a fixed 90)
    COALESCE(
      SUM(out_qty) / NULLIF(
        GREATEST(CURRENT_DATE - MIN(doc_date), 1),
        0
      ),
      0
    ) AS daily_avg_out
  FROM inventory_transactions
  WHERE doc_date >= CURRENT_DATE - INTERVAL '90 days'
    AND direction = 'Out'
  GROUP BY item_code, warehouse
)
SELECT
  s.item_code,
  s.itemname,
  s.warehouse,
  s.whs_name,
  s.group_name,
  s.current_stock,
  s.uom,
  s.stock_value,
  st.min_level,
  st.reorder_point,
  st.max_level,
  COALESCE(da.daily_avg_out, 0)                                   AS daily_avg_out,
  CASE
    WHEN COALESCE(da.daily_avg_out, 0) > 0
    THEN ROUND(s.current_stock / da.daily_avg_out)::INTEGER
    ELSE NULL
  END                                                             AS days_remaining,
  CASE
    WHEN s.current_stock < st.min_level                             THEN 'critical'
    WHEN s.current_stock < st.reorder_point                         THEN 'warning'
    WHEN st.max_level IS NOT NULL AND s.current_stock > st.max_level THEN 'overstock'
    ELSE 'normal'
  END                                                             AS status
FROM v_stock_onhand s
JOIN stock_thresholds st ON st.item_code = s.item_code
                         AND st.warehouse = s.warehouse
LEFT JOIN daily_avg da    ON da.item_code = s.item_code
                         AND da.warehouse = s.warehouse
WHERE s.is_active = TRUE;

-- v_abc_analysis: ABC classification by cumulative annual outbound value
CREATE OR REPLACE VIEW v_abc_analysis AS
WITH item_value AS (
  SELECT
    t.item_code,
    i.itemname,
    g.group_name,
    i.uom,
    SUM(t.out_qty)            AS total_out_qty,
    SUM(ABS(t.amount))        AS total_out_value,
    COUNT(DISTINCT t.doc_date) AS active_days,
    MAX(t.doc_date)           AS last_movement_date
  FROM inventory_transactions t
  JOIN items       i ON i.item_code  = t.item_code
  JOIN item_groups g ON g.group_code = i.group_code
  WHERE t.direction = 'Out'
    AND i.is_active = TRUE
  GROUP BY t.item_code, i.itemname, g.group_name, i.uom
),
ranked AS (
  SELECT *,
    SUM(total_out_value) OVER ()                                                  AS grand_total,
    SUM(total_out_value) OVER (ORDER BY total_out_value DESC ROWS UNBOUNDED PRECEDING) AS cumulative_value,
    ROW_NUMBER() OVER (ORDER BY total_out_value DESC)                             AS rank
  FROM item_value
  WHERE total_out_value > 0
)
SELECT
  rank,
  item_code,
  itemname,
  group_name,
  uom,
  ROUND(total_out_qty,   2)                                                  AS total_out_qty,
  ROUND(total_out_value, 2)                                                  AS total_out_value,
  ROUND(total_out_value / NULLIF(grand_total, 0) * 100, 2)                  AS value_pct,
  ROUND(cumulative_value / NULLIF(grand_total, 0) * 100, 2)                 AS cumulative_pct,
  CASE
    WHEN cumulative_value / NULLIF(grand_total, 0) <= 0.80 THEN 'A'
    WHEN cumulative_value / NULLIF(grand_total, 0) <= 0.95 THEN 'B'
    ELSE 'C'
  END                                                                        AS abc_class,
  active_days,
  last_movement_date
FROM ranked;

-- v_slow_moving: items with positive stock but no outbound movement recently
CREATE OR REPLACE VIEW v_slow_moving AS
WITH last_out AS (
  SELECT
    item_code,
    warehouse,
    MAX(doc_date) AS last_out_date,
    SUM(out_qty)  AS total_out_qty
  FROM inventory_transactions
  WHERE direction = 'Out'
  GROUP BY item_code, warehouse
)
SELECT
  s.item_code,
  s.itemname,
  s.group_name,
  s.warehouse,
  s.whs_name,
  s.current_stock,
  s.uom,
  s.stock_value,
  lo.last_out_date,
  (CURRENT_DATE - lo.last_out_date)::INTEGER AS days_since_last_out,
  COALESCE(lo.total_out_qty, 0)              AS total_out_qty,
  CASE
    WHEN lo.last_out_date IS NULL                        THEN 'dead_stock'
    WHEN CURRENT_DATE - lo.last_out_date >= 180          THEN 'dead_stock'
    WHEN CURRENT_DATE - lo.last_out_date >= 90           THEN 'slow_moving'
    ELSE 'normal'
  END AS movement_status
FROM v_stock_onhand s
LEFT JOIN last_out lo ON lo.item_code = s.item_code
                     AND lo.warehouse  = s.warehouse
WHERE s.is_active = TRUE
  AND s.current_stock > 0
ORDER BY days_since_last_out DESC NULLS FIRST;

-- v_inventory_turnover: annual turnover ratio and days-on-hand by item
CREATE OR REPLACE VIEW v_inventory_turnover AS
WITH cogs AS (
  SELECT
    item_code,
    SUM(ABS(amount))  AS annual_cogs,
    SUM(out_qty)      AS annual_out_qty,
    COUNT(DISTINCT DATE_TRUNC('month', doc_date)) AS active_months
  FROM inventory_transactions
  WHERE direction = 'Out'
    AND doc_date >= CURRENT_DATE - INTERVAL '365 days'
  GROUP BY item_code
),
stock_total AS (
  SELECT
    item_code,
    SUM(current_stock) AS total_stock_qty,
    SUM(stock_value)   AS total_stock_value
  FROM v_stock_onhand
  GROUP BY item_code
)
SELECT
  c.item_code,
  i.itemname,
  g.group_name,
  i.uom,
  ROUND(c.annual_cogs,       2)  AS annual_cogs,
  ROUND(c.annual_out_qty,    2)  AS annual_out_qty,
  ROUND(st.total_stock_value,2)  AS current_stock_value,
  ROUND(st.total_stock_qty,  2)  AS current_stock_qty,
  CASE
    WHEN st.total_stock_value > 0
    THEN ROUND(c.annual_cogs / st.total_stock_value, 2)
    ELSE NULL
  END AS turnover_ratio,
  CASE
    WHEN st.total_stock_value > 0 AND c.annual_cogs > 0
    THEN ROUND(365 / (c.annual_cogs / st.total_stock_value), 0)::INTEGER
    ELSE NULL
  END AS days_on_hand,
  c.active_months
FROM cogs c
JOIN items       i  ON i.item_code  = c.item_code
JOIN item_groups g  ON g.group_code = i.group_code
JOIN stock_total st ON st.item_code = c.item_code
WHERE i.is_active = TRUE;

-- v_reorder_suggestions: items at or below reorder point with suggested order quantity
CREATE OR REPLACE VIEW v_reorder_suggestions AS
WITH daily_out AS (
  SELECT
    item_code,
    warehouse,
    COALESCE(SUM(out_qty) / NULLIF(90, 0), 0) AS daily_avg_90d
  FROM inventory_transactions
  WHERE direction = 'Out'
    AND doc_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY item_code, warehouse
)
SELECT
  s.item_code,
  s.itemname,
  s.group_name,
  s.warehouse,
  s.whs_name,
  s.current_stock,
  s.uom,
  st.min_level,
  st.reorder_point,
  st.max_level,
  ROUND(COALESCE(d.daily_avg_90d, 0), 4)       AS daily_avg_out,
  CASE
    WHEN COALESCE(d.daily_avg_90d, 0) > 0
    THEN ROUND(s.current_stock / d.daily_avg_90d)::INTEGER
    ELSE NULL
  END                                           AS days_remaining,
  -- Suggest ordering up to max_level (or 2× reorder point if no max set)
  GREATEST(
    COALESCE(st.max_level, st.reorder_point * 2) - s.current_stock,
    0
  )                                             AS suggested_order_qty,
  ROUND(s.stock_value, 2)                       AS stock_value,
  i.moving_avg,
  -- Estimated value of suggested order
  GREATEST(
    COALESCE(st.max_level, st.reorder_point * 2) - s.current_stock,
    0
  ) * i.moving_avg                              AS suggested_order_value
FROM v_stock_onhand s
JOIN items            i  ON i.item_code  = s.item_code
JOIN stock_thresholds st ON st.item_code = s.item_code AND st.warehouse = s.warehouse
LEFT JOIN daily_out   d  ON d.item_code  = s.item_code AND d.warehouse  = s.warehouse
WHERE s.is_active = TRUE
  AND s.current_stock <= st.reorder_point
ORDER BY
  (s.current_stock / NULLIF(st.min_level, 0)) ASC NULLS FIRST;

-- ── PHASE 9: RLS for New Views (Supabase grants) ──────────────────────────────
-- Views inherit their base table's RLS, but grant SELECT explicitly to be safe.
GRANT SELECT ON v_transactions        TO authenticated;
GRANT SELECT ON v_stock_alerts        TO authenticated;
GRANT SELECT ON v_abc_analysis        TO authenticated;
GRANT SELECT ON v_slow_moving         TO authenticated;
GRANT SELECT ON v_inventory_turnover  TO authenticated;
GRANT SELECT ON v_reorder_suggestions TO authenticated;

-- ── PHASE 10: Update Functions ────────────────────────────────────────────────

-- Fix get_daily_avg_out: use actual elapsed days in 90-day window
CREATE OR REPLACE FUNCTION get_daily_avg_out(p_item_code TEXT, p_warehouse TEXT)
RETURNS NUMERIC AS $$
  SELECT COALESCE(
    SUM(out_qty) / NULLIF(
      GREATEST(CURRENT_DATE - MIN(doc_date), 1),
      0
    ),
    0
  )
  FROM inventory_transactions
  WHERE item_code = p_item_code
    AND warehouse  = p_warehouse
    AND doc_date  >= CURRENT_DATE - INTERVAL '90 days'
    AND direction  = 'Out';
$$ LANGUAGE SQL STABLE;

-- Update clear_all_data: keep reference tables, clear transactional data only
CREATE OR REPLACE FUNCTION clear_all_data()
RETURNS void AS $$
BEGIN
  DELETE FROM inventory_transactions;
  DELETE FROM stock_thresholds;
  DELETE FROM items;
  DELETE FROM import_logs;
  INSERT INTO system_config (key, value)
  VALUES ('last_sync_at', '')
  ON CONFLICT (key) DO UPDATE SET value = '';
  -- warehouses, item_groups, transaction_types are reference data — NOT cleared.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── PHASE 11: Additional Indexes ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_transactions_direction_date
  ON inventory_transactions(direction, doc_date);

CREATE INDEX IF NOT EXISTS idx_transactions_whs_item
  ON inventory_transactions(warehouse, item_code);

CREATE INDEX IF NOT EXISTS idx_items_group_active
  ON items(group_code, is_active);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Summary of changes:
--   ✓ Created lookup tables: warehouses, item_groups, transaction_types
--   ✓ Seeded reference data from SAP constants
--   ✓ Added FK constraints (inventory_transactions → warehouses, transaction_types, item_groups)
--   ✓ Added FK constraints (items → item_groups, stock_thresholds → warehouses)
--   ✓ Dropped redundant columns: whs_name, group_name, trans_name (inventory_transactions)
--   ✓ Dropped redundant column: group_name (items)
--   ✓ Updated v_stock_onhand and v_movement_monthly to JOIN lookup tables
--   ✓ Created v_transactions (full row with all joined names)
--   ✓ Created v_stock_alerts (server-side computed with real days_remaining)
--   ✓ Created v_abc_analysis (ABC classification by cumulative value)
--   ✓ Created v_slow_moving (dead/slow stock identification)
--   ✓ Created v_inventory_turnover (annual turnover ratio + days-on-hand)
--   ✓ Created v_reorder_suggestions (items below reorder point + suggested qty)
--   ✓ Fixed get_daily_avg_out (90-day window with actual elapsed days)
--   ✓ Updated clear_all_data (preserves reference tables)
