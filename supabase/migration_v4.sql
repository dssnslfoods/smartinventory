-- ============================================
-- NSL-IIP Database Migration v4
-- Dynamic Active Item Threshold
-- ============================================

-- Add threshold configuration for active items (default 90 days)
INSERT INTO system_config (key, value)
VALUES ('active_item_threshold_days', '90')
ON CONFLICT (key) DO NOTHING;

-- View to calculate unique active items based on the threshold
CREATE OR REPLACE VIEW v_active_item_count AS
SELECT COUNT(DISTINCT item_code) as active_count
FROM inventory_transactions
WHERE doc_date >= (
  CURRENT_DATE - (
    SELECT COALESCE(NULLIF(value, ''), '90')::INTEGER 
    FROM system_config 
    WHERE key = 'active_item_threshold_days'
  ) * INTERVAL '1 day'
);

GRANT SELECT ON v_active_item_count TO authenticated;
