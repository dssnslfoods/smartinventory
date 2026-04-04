-- ─────────────────────────────────────────────────────────────────────────────
-- Migration v6: Configurable ABC Analysis Thresholds
-- Stores A/B thresholds in system_config so users can adjust them via Settings.
-- Threshold values are stored as decimals (0.80 = 80%, 0.95 = 95%).
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert default ABC thresholds into system_config (no-op if already set)
INSERT INTO system_config (key, value)
VALUES
  ('abc_threshold_a', '0.80'),
  ('abc_threshold_b', '0.95')
ON CONFLICT (key) DO NOTHING;

-- Recreate v_abc_analysis to read thresholds dynamically from system_config
CREATE OR REPLACE VIEW v_abc_analysis AS
WITH item_value AS (
  SELECT
    t.item_code,
    i.itemname,
    g.group_name,
    i.uom,
    SUM(t.out_qty)             AS total_out_qty,
    SUM(ABS(t.amount))         AS total_out_value,
    COUNT(DISTINCT t.doc_date) AS active_days,
    MAX(t.doc_date)            AS last_movement_date
  FROM inventory_transactions t
  JOIN items       i ON i.item_code  = t.item_code
  JOIN item_groups g ON g.group_code = i.group_code
  WHERE t.direction = 'Out'
    AND i.is_active = TRUE
  GROUP BY t.item_code, i.itemname, g.group_name, i.uom
),
ranked AS (
  SELECT *,
    SUM(total_out_value) OVER ()                                                   AS grand_total,
    SUM(total_out_value) OVER (ORDER BY total_out_value DESC ROWS UNBOUNDED PRECEDING) AS cumulative_value,
    ROW_NUMBER() OVER (ORDER BY total_out_value DESC)                              AS rank
  FROM item_value
  WHERE total_out_value > 0
)
SELECT
  rank,
  item_code,
  itemname,
  group_name,
  uom,
  ROUND(total_out_qty,   2)                                                   AS total_out_qty,
  ROUND(total_out_value, 2)                                                   AS total_out_value,
  ROUND(total_out_value / NULLIF(grand_total, 0) * 100, 2)                   AS value_pct,
  ROUND(cumulative_value / NULLIF(grand_total, 0) * 100, 2)                  AS cumulative_pct,
  CASE
    WHEN cumulative_value / NULLIF(grand_total, 0) <=
         (SELECT value::numeric FROM system_config WHERE key = 'abc_threshold_a') THEN 'A'
    WHEN cumulative_value / NULLIF(grand_total, 0) <=
         (SELECT value::numeric FROM system_config WHERE key = 'abc_threshold_b') THEN 'B'
    ELSE 'C'
  END                                                                         AS abc_class,
  active_days,
  last_movement_date
FROM ranked;
