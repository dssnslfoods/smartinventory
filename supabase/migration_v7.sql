-- ============================================
-- NSL-IIP Migration v7
-- Add expire_date to items + VV Matrix support
-- ============================================

-- ── PHASE 1: Add expire_date column ──────────────────────────────────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS expire_date DATE;

-- ── PHASE 2: Populate sample expire dates (deterministic by item_code) ───────
-- Spread: ~20% expired/near, ~30% orange, ~30% yellow, ~20% green
UPDATE items SET expire_date = (
  CURRENT_DATE + (
    CASE (ABS(HASHTEXT(item_code)) % 10)
      WHEN 0 THEN -45    -- already expired
      WHEN 1 THEN 15     -- < 30d  (validity=1)
      WHEN 2 THEN 45     -- 31-60d (validity=2)
      WHEN 3 THEN 75     -- 61-90d (validity=3)
      WHEN 4 THEN 120    -- 91-180d (validity=4)
      WHEN 5 THEN 200    -- >180d  (validity=5)
      WHEN 6 THEN 365    -- >180d  (validity=5)
      WHEN 7 THEN 60     -- 31-60d (validity=2)
      WHEN 8 THEN 90     -- 91-180d edge (validity=3)
      WHEN 9 THEN 500    -- >180d  (validity=5)
    END
  ) * INTERVAL '1 day'
)
WHERE expire_date IS NULL;

-- ── PHASE 3: Recreate v_stock_onhand with expire_date ─────────────────────────
-- Drop dependent views first
DROP VIEW IF EXISTS v_stock_position CASCADE;
DROP VIEW IF EXISTS v_stock_alerts CASCADE;
DROP VIEW IF EXISTS v_reorder_suggestions CASCADE;
DROP VIEW IF EXISTS v_slow_moving CASCADE;
DROP VIEW IF EXISTS v_abc_analysis CASCADE;
DROP VIEW IF EXISTS v_inventory_turnover CASCADE;
DROP VIEW IF EXISTS v_stock_onhand CASCADE;

CREATE OR REPLACE VIEW v_stock_onhand AS
SELECT
  t.item_code,
  i.itemname,
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
  i.is_active,
  i.expire_date
FROM inventory_transactions t
JOIN items       i ON i.item_code  = t.item_code
JOIN warehouses  w ON w.code       = t.warehouse
JOIN item_groups g ON g.group_code = i.group_code
GROUP BY
  t.item_code, t.warehouse,
  i.itemname, i.uom, i.moving_avg, i.std_cost, i.is_active,
  i.group_code, g.group_name,
  w.whs_name, w.whs_type, i.expire_date;

-- ── PHASE 4: Recreate all dependent views ────────────────────────────────────

CREATE OR REPLACE VIEW v_movement_monthly AS
SELECT
  DATE_TRUNC('month', t.doc_date)::DATE AS month,
  t.warehouse,
  t.direction,
  i.group_code,
  g.group_name,
  SUM(t.in_qty)  AS total_in,
  SUM(t.out_qty) AS total_out,
  SUM(t.amount)  AS total_amount,
  COUNT(*)       AS transaction_count
FROM inventory_transactions t
JOIN items       i ON i.item_code  = t.item_code
LEFT JOIN item_groups g ON g.group_code = i.group_code
GROUP BY 1, 2, 3, 4, 5;

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
    WHEN po.expected_arrival IS NULL        THEN 'unknown'
    WHEN po.expected_arrival < CURRENT_DATE THEN 'overdue'
    WHEN po.expected_arrival = CURRENT_DATE THEN 'arriving_today'
    WHEN po.expected_arrival <= CURRENT_DATE + 7 THEN 'arriving_soon'
    ELSE 'on_schedule'
  END                                                           AS arrival_status
FROM purchase_order_lines pol
JOIN purchase_orders  po ON po.po_number    = pol.po_number
JOIN suppliers         s ON s.supplier_code = po.supplier_code
JOIN items             i ON i.item_code     = pol.item_code
JOIN warehouses        w ON w.code          = pol.warehouse
WHERE po.status  IN ('confirmed','shipped','in_transit','customs')
  AND pol.status IN ('pending','partial');

CREATE OR REPLACE VIEW v_stock_position AS
WITH transit AS (
  SELECT item_code, warehouse,
    SUM(pending_qty)      AS transit_qty,
    SUM(pending_value)    AS transit_value,
    MIN(expected_arrival) AS nearest_arrival
  FROM v_goods_in_transit GROUP BY item_code, warehouse
)
SELECT
  s.item_code, s.itemname, s.warehouse, s.whs_name, s.whs_type,
  s.group_code, s.group_name, s.current_stock, s.uom,
  s.moving_avg, s.std_cost, s.stock_value,
  COALESCE(t.transit_qty,   0)                   AS transit_qty,
  COALESCE(t.transit_value, 0)                   AS transit_value,
  t.nearest_arrival,
  s.current_stock + COALESCE(t.transit_qty,  0)  AS projected_stock,
  s.stock_value   + COALESCE(t.transit_value,0)  AS projected_value,
  s.is_active,
  s.expire_date
FROM v_stock_onhand s
LEFT JOIN transit t ON t.item_code = s.item_code AND t.warehouse = s.warehouse;

CREATE OR REPLACE VIEW v_stock_alerts AS
WITH daily_avg AS (
  SELECT item_code, warehouse,
    COALESCE(SUM(out_qty) / NULLIF(GREATEST(CURRENT_DATE - MIN(doc_date),1),0), 0) AS daily_avg_out
  FROM inventory_transactions
  WHERE doc_date >= CURRENT_DATE - INTERVAL '90 days' AND direction = 'Out'
  GROUP BY item_code, warehouse
),
transit AS (
  SELECT item_code, warehouse,
    SUM(pending_qty)      AS transit_qty,
    MIN(expected_arrival) AS nearest_arrival
  FROM v_goods_in_transit GROUP BY item_code, warehouse
)
SELECT
  s.item_code, s.itemname, s.warehouse, s.whs_name, s.group_name,
  s.current_stock, s.uom, s.stock_value,
  st.min_level, st.reorder_point, st.max_level,
  COALESCE(da.daily_avg_out, 0) AS daily_avg_out,
  CASE WHEN COALESCE(da.daily_avg_out,0) > 0
    THEN ROUND(s.current_stock / da.daily_avg_out)::INTEGER ELSE NULL END AS days_remaining,
  COALESCE(t.transit_qty, 0) AS transit_qty,
  t.nearest_arrival,
  CASE
    WHEN s.current_stock < st.min_level     THEN 'critical'
    WHEN s.current_stock < st.reorder_point THEN 'warning'
    WHEN st.max_level IS NOT NULL AND s.current_stock > st.max_level THEN 'overstock'
    ELSE 'normal'
  END AS status
FROM v_stock_onhand s
JOIN stock_thresholds st ON st.item_code = s.item_code AND st.warehouse = s.warehouse
LEFT JOIN daily_avg   da ON da.item_code = s.item_code AND da.warehouse = s.warehouse
LEFT JOIN transit      t ON  t.item_code = s.item_code AND  t.warehouse = s.warehouse
WHERE s.is_active = TRUE;

CREATE OR REPLACE VIEW v_reorder_suggestions AS
WITH daily_out AS (
  SELECT item_code, warehouse,
    COALESCE(SUM(out_qty)/NULLIF(90,0),0) AS daily_avg_90d
  FROM inventory_transactions
  WHERE direction='Out' AND doc_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY item_code, warehouse
),
transit AS (
  SELECT item_code, warehouse, SUM(pending_qty) AS transit_qty
  FROM v_goods_in_transit GROUP BY item_code, warehouse
)
SELECT
  s.item_code, s.itemname, s.group_name, s.warehouse, s.whs_name,
  s.current_stock, s.uom,
  st.min_level, st.reorder_point, st.max_level,
  ROUND(COALESCE(d.daily_avg_90d,0),4) AS daily_avg_out,
  CASE WHEN COALESCE(d.daily_avg_90d,0) > 0
    THEN ROUND(s.current_stock/d.daily_avg_90d)::INTEGER ELSE NULL END AS days_remaining,
  COALESCE(t.transit_qty,0) AS transit_qty,
  GREATEST(COALESCE(st.max_level, st.reorder_point*2) - s.current_stock - COALESCE(t.transit_qty,0), 0) AS suggested_order_qty,
  ROUND(s.stock_value,2) AS stock_value,
  i.moving_avg,
  GREATEST(COALESCE(st.max_level, st.reorder_point*2) - s.current_stock - COALESCE(t.transit_qty,0), 0) * i.moving_avg AS suggested_order_value
FROM v_stock_onhand s
JOIN items            i  ON i.item_code  = s.item_code
JOIN stock_thresholds st ON st.item_code = s.item_code AND st.warehouse = s.warehouse
LEFT JOIN daily_out   d  ON d.item_code  = s.item_code AND d.warehouse  = s.warehouse
LEFT JOIN transit      t ON  t.item_code = s.item_code AND  t.warehouse = s.warehouse
WHERE s.is_active = TRUE AND s.current_stock <= st.reorder_point
ORDER BY (s.current_stock / NULLIF(st.min_level,0)) ASC NULLS FIRST;

CREATE OR REPLACE VIEW v_slow_moving AS
WITH last_out AS (
  SELECT item_code, warehouse,
    MAX(doc_date) AS last_out_date,
    SUM(out_qty)  AS total_out_qty
  FROM inventory_transactions WHERE direction='Out'
  GROUP BY item_code, warehouse
)
SELECT
  s.item_code, s.itemname, s.group_name, s.warehouse, s.whs_name,
  s.current_stock, s.uom, s.stock_value,
  lo.last_out_date,
  (CURRENT_DATE - lo.last_out_date)::INTEGER AS days_since_last_out,
  COALESCE(lo.total_out_qty, 0) AS total_out_qty,
  CASE
    WHEN lo.last_out_date IS NULL               THEN 'dead_stock'
    WHEN CURRENT_DATE - lo.last_out_date >= 180 THEN 'dead_stock'
    WHEN CURRENT_DATE - lo.last_out_date >= 90  THEN 'slow_moving'
    ELSE 'normal'
  END AS movement_status
FROM v_stock_onhand s
LEFT JOIN last_out lo ON lo.item_code = s.item_code AND lo.warehouse = s.warehouse
WHERE s.is_active = TRUE AND s.current_stock > 0
ORDER BY days_since_last_out DESC NULLS FIRST;

CREATE OR REPLACE VIEW v_abc_analysis AS
WITH item_value AS (
  SELECT
    t.item_code, i.itemname, g.group_name, i.uom,
    SUM(t.out_qty)             AS total_out_qty,
    SUM(ABS(t.amount))         AS total_out_value,
    COUNT(DISTINCT t.doc_date) AS active_days,
    MAX(t.doc_date)            AS last_movement_date
  FROM inventory_transactions t
  JOIN items       i ON i.item_code  = t.item_code
  JOIN item_groups g ON g.group_code = i.group_code
  WHERE t.direction = 'Out' AND i.is_active = TRUE
  GROUP BY t.item_code, i.itemname, g.group_name, i.uom
),
ranked AS (
  SELECT *,
    SUM(total_out_value) OVER () AS grand_total,
    SUM(total_out_value) OVER (ORDER BY total_out_value DESC ROWS UNBOUNDED PRECEDING) AS cumulative_value,
    ROW_NUMBER() OVER (ORDER BY total_out_value DESC) AS rank
  FROM item_value WHERE total_out_value > 0
)
SELECT
  rank, item_code, itemname, group_name, uom,
  ROUND(total_out_qty,   2) AS total_out_qty,
  ROUND(total_out_value, 2) AS total_out_value,
  ROUND(total_out_value / NULLIF(grand_total,0) * 100, 2) AS value_pct,
  ROUND(cumulative_value / NULLIF(grand_total,0) * 100, 2) AS cumulative_pct,
  CASE
    WHEN cumulative_value / NULLIF(grand_total,0) <= 0.80 THEN 'A'
    WHEN cumulative_value / NULLIF(grand_total,0) <= 0.95 THEN 'B'
    ELSE 'C'
  END AS abc_class,
  active_days, last_movement_date
FROM ranked;

CREATE OR REPLACE VIEW v_inventory_turnover AS
WITH cogs AS (
  SELECT item_code,
    SUM(ABS(amount)) AS annual_cogs, SUM(out_qty) AS annual_out_qty,
    COUNT(DISTINCT DATE_TRUNC('month', doc_date)) AS active_months
  FROM inventory_transactions
  WHERE direction='Out' AND doc_date >= CURRENT_DATE - INTERVAL '365 days'
  GROUP BY item_code
),
stock_total AS (
  SELECT item_code,
    SUM(current_stock) AS total_stock_qty,
    SUM(stock_value)   AS total_stock_value
  FROM v_stock_onhand GROUP BY item_code
)
SELECT
  c.item_code, i.itemname, g.group_name, i.uom,
  ROUND(c.annual_cogs,       2) AS annual_cogs,
  ROUND(c.annual_out_qty,    2) AS annual_out_qty,
  ROUND(st.total_stock_value,2) AS current_stock_value,
  ROUND(st.total_stock_qty,  2) AS current_stock_qty,
  CASE WHEN st.total_stock_value > 0
    THEN ROUND(c.annual_cogs/st.total_stock_value,2) ELSE NULL END AS turnover_ratio,
  CASE WHEN st.total_stock_value > 0 AND c.annual_cogs > 0
    THEN ROUND(365/(c.annual_cogs/st.total_stock_value),0)::INTEGER ELSE NULL END AS days_on_hand,
  c.active_months
FROM cogs c
JOIN items       i  ON i.item_code  = c.item_code
JOIN item_groups g  ON g.group_code = i.group_code
JOIN stock_total st ON st.item_code = c.item_code
WHERE i.is_active = TRUE;

-- ── PHASE 5: Permissions ──────────────────────────────────────────────────────
GRANT SELECT ON v_stock_onhand        TO authenticated;
GRANT SELECT ON v_stock_position      TO authenticated;
GRANT SELECT ON v_stock_alerts        TO authenticated;
GRANT SELECT ON v_slow_moving         TO authenticated;
GRANT SELECT ON v_abc_analysis        TO authenticated;
GRANT SELECT ON v_inventory_turnover  TO authenticated;
GRANT SELECT ON v_reorder_suggestions TO authenticated;
GRANT SELECT ON v_goods_in_transit    TO authenticated;
GRANT SELECT ON v_movement_monthly    TO authenticated;
