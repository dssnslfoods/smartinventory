-- ============================================
-- NSL-IIP Database Migration v3
-- Goods in Transit / Purchase Order Tracking
-- Run in Supabase SQL Editor (after migration_v2.sql)
-- ============================================

-- ── PHASE 1: New Tables ────────────────────────────────────────────────────────

-- 1. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_code    TEXT PRIMARY KEY,
  supplier_name    TEXT NOT NULL,
  country          TEXT,
  default_lead_days INTEGER NOT NULL DEFAULT 30,
  contact_name     TEXT,
  contact_email    TEXT,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  po_number        TEXT PRIMARY KEY,
  supplier_code    TEXT NOT NULL REFERENCES suppliers(supplier_code),
  order_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_arrival DATE,
  actual_arrival   DATE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','confirmed','shipped','in_transit','customs','arrived','cancelled')),
  shipping_method  TEXT CHECK (shipping_method IN ('Sea','Air','Land','Courier')),
  tracking_number  TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. purchase_order_lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id               BIGSERIAL PRIMARY KEY,
  po_number        TEXT NOT NULL REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
  item_code        TEXT NOT NULL REFERENCES items(item_code),
  warehouse        TEXT NOT NULL REFERENCES warehouses(code),
  ordered_qty      NUMERIC(18,4) NOT NULL CHECK (ordered_qty > 0),
  received_qty     NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit_price       NUMERIC(18,2) DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','partial','complete','cancelled')),
  notes            TEXT,
  UNIQUE (po_number, item_code, warehouse)
);

-- ── PHASE 2: Triggers ──────────────────────────────────────────────────────────

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PHASE 3: Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_po_supplier      ON purchase_orders(supplier_code);
CREATE INDEX IF NOT EXISTS idx_po_status        ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_expected      ON purchase_orders(expected_arrival);
CREATE INDEX IF NOT EXISTS idx_pol_po           ON purchase_order_lines(po_number);
CREATE INDEX IF NOT EXISTS idx_pol_item         ON purchase_order_lines(item_code);
CREATE INDEX IF NOT EXISTS idx_pol_warehouse    ON purchase_order_lines(warehouse);
CREATE INDEX IF NOT EXISTS idx_pol_status       ON purchase_order_lines(status);

-- ── PHASE 4: Views ─────────────────────────────────────────────────────────────

-- v_goods_in_transit: active transit lines with days until arrival
CREATE OR REPLACE VIEW v_goods_in_transit AS
SELECT
  pol.id                                                        AS line_id,
  po.po_number,
  po.supplier_code,
  s.supplier_name,
  s.country                                                     AS origin_country,
  po.order_date,
  po.expected_arrival,
  po.actual_arrival,
  po.status                                                     AS po_status,
  po.shipping_method,
  po.tracking_number,
  pol.item_code,
  i.itemname,
  i.foreign_name,
  i.uom,
  pol.warehouse,
  w.whs_name,
  pol.ordered_qty,
  pol.received_qty,
  (pol.ordered_qty - pol.received_qty)                          AS pending_qty,
  pol.unit_price,
  (pol.ordered_qty - pol.received_qty) * pol.unit_price         AS pending_value,
  pol.status                                                    AS line_status,
  CASE
    WHEN po.expected_arrival IS NULL THEN NULL
    ELSE (po.expected_arrival - CURRENT_DATE)::INTEGER
  END                                                           AS days_until_arrival,
  CASE
    WHEN po.expected_arrival IS NULL       THEN 'unknown'
    WHEN po.expected_arrival < CURRENT_DATE THEN 'overdue'
    WHEN po.expected_arrival = CURRENT_DATE THEN 'arriving_today'
    WHEN po.expected_arrival <= CURRENT_DATE + 7 THEN 'arriving_soon'
    ELSE 'on_schedule'
  END                                                           AS arrival_status
FROM purchase_order_lines pol
JOIN purchase_orders  po ON po.po_number     = pol.po_number
JOIN suppliers         s ON s.supplier_code  = po.supplier_code
JOIN items             i ON i.item_code      = pol.item_code
JOIN warehouses        w ON w.code           = pol.warehouse
WHERE po.status IN ('confirmed','shipped','in_transit','customs')
  AND pol.status IN ('pending','partial');

-- v_stock_position: current stock + in-transit combined view
CREATE OR REPLACE VIEW v_stock_position AS
WITH transit AS (
  SELECT
    item_code,
    warehouse,
    SUM(pending_qty)    AS transit_qty,
    SUM(pending_value)  AS transit_value,
    MIN(expected_arrival) AS nearest_arrival
  FROM v_goods_in_transit
  GROUP BY item_code, warehouse
)
SELECT
  s.item_code,
  s.itemname,
  s.foreign_name,
  s.warehouse,
  s.whs_name,
  s.whs_type,
  s.group_code,
  s.group_name,
  s.current_stock,
  s.uom,
  s.moving_avg,
  s.std_cost,
  s.stock_value,
  COALESCE(t.transit_qty,   0)                     AS transit_qty,
  COALESCE(t.transit_value, 0)                     AS transit_value,
  t.nearest_arrival,
  s.current_stock + COALESCE(t.transit_qty, 0)     AS projected_stock,
  s.stock_value   + COALESCE(t.transit_value, 0)   AS projected_value,
  s.is_active
FROM v_stock_onhand s
LEFT JOIN transit t ON t.item_code = s.item_code AND t.warehouse = s.warehouse;

-- ── PHASE 5: Update v_reorder_suggestions (account for transit qty) ───────────

DROP VIEW IF EXISTS v_reorder_suggestions CASCADE;

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
),
transit AS (
  SELECT
    item_code,
    warehouse,
    SUM(pending_qty) AS transit_qty
  FROM v_goods_in_transit
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
  ROUND(COALESCE(d.daily_avg_90d, 0), 4)                    AS daily_avg_out,
  CASE
    WHEN COALESCE(d.daily_avg_90d, 0) > 0
    THEN ROUND(s.current_stock / d.daily_avg_90d)::INTEGER
    ELSE NULL
  END                                                        AS days_remaining,
  COALESCE(t.transit_qty, 0)                                 AS transit_qty,
  -- Net need after accounting for in-transit
  GREATEST(
    COALESCE(st.max_level, st.reorder_point * 2)
      - s.current_stock
      - COALESCE(t.transit_qty, 0),
    0
  )                                                          AS suggested_order_qty,
  ROUND(s.stock_value, 2)                                    AS stock_value,
  i.moving_avg,
  GREATEST(
    COALESCE(st.max_level, st.reorder_point * 2)
      - s.current_stock
      - COALESCE(t.transit_qty, 0),
    0
  ) * i.moving_avg                                           AS suggested_order_value
FROM v_stock_onhand s
JOIN items            i  ON i.item_code  = s.item_code
JOIN stock_thresholds st ON st.item_code = s.item_code AND st.warehouse = s.warehouse
LEFT JOIN daily_out   d  ON d.item_code  = s.item_code AND d.warehouse  = s.warehouse
LEFT JOIN transit     t  ON t.item_code  = s.item_code AND t.warehouse  = s.warehouse
WHERE s.is_active = TRUE
  AND s.current_stock <= st.reorder_point
ORDER BY
  (s.current_stock / NULLIF(st.min_level, 0)) ASC NULLS FIRST;

-- ── PHASE 6: Update v_stock_alerts (add transit context) ──────────────────────

DROP VIEW IF EXISTS v_stock_alerts CASCADE;

CREATE OR REPLACE VIEW v_stock_alerts AS
WITH daily_avg AS (
  SELECT
    item_code,
    warehouse,
    COALESCE(
      SUM(out_qty) / NULLIF(
        GREATEST(CURRENT_DATE - MIN(doc_date), 1), 0
      ), 0
    ) AS daily_avg_out
  FROM inventory_transactions
  WHERE doc_date >= CURRENT_DATE - INTERVAL '90 days'
    AND direction = 'Out'
  GROUP BY item_code, warehouse
),
transit AS (
  SELECT
    item_code,
    warehouse,
    SUM(pending_qty)      AS transit_qty,
    MIN(expected_arrival) AS nearest_arrival
  FROM v_goods_in_transit
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
  COALESCE(t.transit_qty, 0)                                      AS transit_qty,
  t.nearest_arrival,
  CASE
    WHEN s.current_stock < st.min_level                              THEN 'critical'
    WHEN s.current_stock < st.reorder_point                          THEN 'warning'
    WHEN st.max_level IS NOT NULL AND s.current_stock > st.max_level THEN 'overstock'
    ELSE 'normal'
  END                                                             AS status
FROM v_stock_onhand s
JOIN stock_thresholds st ON st.item_code = s.item_code
                         AND st.warehouse = s.warehouse
LEFT JOIN daily_avg da    ON da.item_code = s.item_code
                         AND da.warehouse = s.warehouse
LEFT JOIN transit   t     ON t.item_code  = s.item_code
                         AND t.warehouse  = s.warehouse
WHERE s.is_active = TRUE;

-- ── PHASE 7: RLS ───────────────────────────────────────────────────────────────

ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read suppliers"    ON suppliers            FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage suppliers"  ON suppliers            FOR ALL    TO authenticated USING (true);
CREATE POLICY "Users can read pos"          ON purchase_orders      FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage pos"        ON purchase_orders      FOR ALL    TO authenticated USING (true);
CREATE POLICY "Users can read pol"          ON purchase_order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage pol"        ON purchase_order_lines FOR ALL    TO authenticated USING (true);

GRANT SELECT ON v_goods_in_transit  TO authenticated;
GRANT SELECT ON v_stock_position    TO authenticated;
GRANT SELECT ON v_reorder_suggestions TO authenticated;
GRANT SELECT ON v_stock_alerts      TO authenticated;

-- ── PHASE 8: Function — Receive Goods ─────────────────────────────────────────
-- Converts a PO line into an inventory_transaction and updates received_qty

CREATE OR REPLACE FUNCTION receive_po_line(
  p_po_number    TEXT,
  p_item_code    TEXT,
  p_warehouse    TEXT,
  p_qty          NUMERIC,
  p_unit_price   NUMERIC DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_trans_num  BIGINT;
  v_group_code INTEGER;
  v_line_id    BIGINT;
  v_ordered    NUMERIC;
  v_received   NUMERIC;
BEGIN
  -- Lock and fetch the PO line
  SELECT id, ordered_qty, received_qty
    INTO v_line_id, v_ordered, v_received
  FROM purchase_order_lines
  WHERE po_number = p_po_number
    AND item_code = p_item_code
    AND warehouse = p_warehouse
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO line not found: % / % / %', p_po_number, p_item_code, p_warehouse;
  END IF;

  IF (v_received + p_qty) > v_ordered THEN
    RAISE EXCEPTION 'Receive qty (%) exceeds remaining ordered qty (%)',
      p_qty, v_ordered - v_received;
  END IF;

  -- Get item's group_code
  SELECT group_code INTO v_group_code FROM items WHERE item_code = p_item_code;

  -- Generate unique trans_num
  SELECT COALESCE(MAX(trans_num), 0) + 1 INTO v_trans_num FROM inventory_transactions;

  -- Insert inventory transaction (Goods Receipt)
  INSERT INTO inventory_transactions (
    trans_num, doc_date, trans_type, warehouse, group_code,
    doc_line_num, item_code, in_qty, out_qty, balance_qty, amount, direction
  )
  SELECT
    v_trans_num,
    CURRENT_DATE,
    20,            -- Goods Receipt PO
    p_warehouse,
    v_group_code,
    0,
    p_item_code,
    p_qty,
    0,
    COALESCE(SUM(it.in_qty - it.out_qty), 0) + p_qty,
    p_qty * COALESCE(p_unit_price, (SELECT moving_avg FROM items WHERE item_code = p_item_code), 0),
    'In'
  FROM inventory_transactions it
  WHERE it.item_code = p_item_code AND it.warehouse = p_warehouse;

  -- Update PO line received_qty and status
  UPDATE purchase_order_lines
  SET received_qty = v_received + p_qty,
      status = CASE
        WHEN v_received + p_qty >= v_ordered THEN 'complete'
        ELSE 'partial'
      END
  WHERE id = v_line_id;

  -- If all lines complete, update PO status to arrived
  UPDATE purchase_orders
  SET status = 'arrived',
      actual_arrival = CURRENT_DATE
  WHERE po_number = p_po_number
    AND NOT EXISTS (
      SELECT 1 FROM purchase_order_lines
      WHERE po_number = p_po_number
        AND status NOT IN ('complete','cancelled')
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Done ───────────────────────────────────────────────────────────────────────
-- Summary:
--   ✓ Created tables: suppliers, purchase_orders, purchase_order_lines
--   ✓ Created views: v_goods_in_transit, v_stock_position
--   ✓ Updated v_reorder_suggestions (deduct transit_qty from suggested order)
--   ✓ Updated v_stock_alerts (added transit_qty + nearest_arrival columns)
--   ✓ Created function: receive_po_line (auto-creates inventory_transaction)
--   ✓ RLS policies for all new tables
