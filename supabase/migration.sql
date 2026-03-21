-- ============================================
-- NSL-IIP Database Migration
-- NSL Inventory Intelligence Platform
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Table: items (from dbo_OITM)
CREATE TABLE IF NOT EXISTS items (
  item_code      TEXT PRIMARY KEY,
  itemname       TEXT NOT NULL,
  foreign_name   TEXT,
  uom            TEXT NOT NULL DEFAULT 'KG',
  std_cost       NUMERIC(18,2) DEFAULT 0,
  moving_avg     NUMERIC(18,2) DEFAULT 0,
  group_code     INTEGER NOT NULL,
  group_name     TEXT NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table: inventory_transactions (from dbo_OIMN)
-- NOTE: doc_line_num uses -1 (instead of NULL) for Opening Balance rows.
--       This allows a simple, non-expression UNIQUE constraint that PostgREST can handle.
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id             BIGSERIAL PRIMARY KEY,
  trans_num      BIGINT NOT NULL,
  doc_date       DATE NOT NULL,
  trans_type     INTEGER NOT NULL,
  trans_name     TEXT NOT NULL,
  warehouse      TEXT NOT NULL,
  whs_name       TEXT NOT NULL,
  group_code     INTEGER NOT NULL,
  group_name     TEXT NOT NULL,
  doc_line_num   INTEGER NOT NULL DEFAULT -1,  -- -1 = Opening Balance (was NULL in SAP)
  item_code      TEXT NOT NULL REFERENCES items(item_code),
  in_qty         NUMERIC(18,4) DEFAULT 0,
  out_qty        NUMERIC(18,4) DEFAULT 0,
  balance_qty    NUMERIC(18,4) DEFAULT 0,
  amount         NUMERIC(18,2) DEFAULT 0,
  direction      TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Simple unique constraint (no expression) — PostgREST can use this directly
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique
ON inventory_transactions(trans_num, item_code, doc_line_num);

-- 3. Table: stock_thresholds
CREATE TABLE IF NOT EXISTS stock_thresholds (
  id             BIGSERIAL PRIMARY KEY,
  item_code      TEXT NOT NULL REFERENCES items(item_code),
  warehouse      TEXT NOT NULL,
  min_level      NUMERIC(18,4) DEFAULT 0,
  reorder_point  NUMERIC(18,4) DEFAULT 0,
  max_level      NUMERIC(18,4),
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_code, warehouse)
);

-- 4. Table: import_logs
CREATE TABLE IF NOT EXISTS import_logs (
  id                BIGSERIAL PRIMARY KEY,
  file_name         TEXT NOT NULL,
  imported_at       TIMESTAMPTZ DEFAULT NOW(),
  items_count       INTEGER DEFAULT 0,
  transactions_count INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'partial')),
  error_summary     TEXT,
  imported_by       UUID REFERENCES auth.users(id)
);

-- 5. Table: system_config
CREATE TABLE IF NOT EXISTS system_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (key, value) VALUES ('last_sync_at', '') ON CONFLICT DO NOTHING;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_transactions_doc_date ON inventory_transactions(doc_date);
CREATE INDEX IF NOT EXISTS idx_transactions_item_code ON inventory_transactions(item_code);
CREATE INDEX IF NOT EXISTS idx_transactions_warehouse ON inventory_transactions(warehouse);
CREATE INDEX IF NOT EXISTS idx_transactions_direction ON inventory_transactions(direction);
CREATE INDEX IF NOT EXISTS idx_transactions_trans_type ON inventory_transactions(trans_type);
CREATE INDEX IF NOT EXISTS idx_transactions_group_code ON inventory_transactions(group_code);
CREATE INDEX IF NOT EXISTS idx_items_group_code ON items(group_code);
CREATE INDEX IF NOT EXISTS idx_items_is_active ON items(is_active);
CREATE INDEX IF NOT EXISTS idx_thresholds_item_whs ON stock_thresholds(item_code, warehouse);

-- ============================================
-- VIEWS
-- ============================================

-- View: v_stock_onhand
CREATE OR REPLACE VIEW v_stock_onhand AS
SELECT
  t.item_code,
  i.itemname,
  i.foreign_name,
  t.warehouse,
  t.whs_name,
  t.group_code,
  t.group_name,
  COALESCE(SUM(t.in_qty - t.out_qty), 0) AS current_stock,
  i.uom,
  i.moving_avg,
  i.std_cost,
  COALESCE(SUM(t.in_qty - t.out_qty), 0) * i.moving_avg AS stock_value,
  i.is_active
FROM inventory_transactions t
JOIN items i ON i.item_code = t.item_code
GROUP BY t.item_code, t.warehouse, t.whs_name,
         t.group_code, t.group_name,
         i.itemname, i.foreign_name, i.uom, i.moving_avg, i.std_cost, i.is_active;

-- View: v_movement_monthly
CREATE OR REPLACE VIEW v_movement_monthly AS
SELECT
  DATE_TRUNC('month', doc_date)::DATE AS month,
  item_code,
  warehouse,
  group_name,
  direction,
  SUM(in_qty)  AS total_in,
  SUM(out_qty) AS total_out,
  SUM(amount)  AS total_amount,
  COUNT(*)     AS transaction_count
FROM inventory_transactions
GROUP BY 1,2,3,4,5;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Users can read items" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read transactions" ON inventory_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read thresholds" ON stock_thresholds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read import_logs" ON import_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read system_config" ON system_config FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users (admin operations)
CREATE POLICY "Users can insert items" ON items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update items" ON items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete items" ON items FOR DELETE TO authenticated USING (true);
CREATE POLICY "Users can insert transactions" ON inventory_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can delete transactions" ON inventory_transactions FOR DELETE TO authenticated USING (true);
CREATE POLICY "Users can manage thresholds" ON stock_thresholds FOR ALL TO authenticated USING (true);
CREATE POLICY "Users can insert import_logs" ON import_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can insert system_config" ON system_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update system_config" ON system_config FOR UPDATE TO authenticated USING (true);

-- ── Master Reset Function (Bypass RLS) ───────────────────────────────────
-- This function runs with service role privileges to ensure 100% deletion
CREATE OR REPLACE FUNCTION clear_all_data()
RETURNS void AS $$
BEGIN
  -- Batch delete to avoid massive transaction overhead
  DELETE FROM inventory_transactions;
  DELETE FROM stock_thresholds;
  DELETE FROM items;
  DELETE FROM import_logs;
  
  -- Reset sync time
  INSERT INTO system_config (key, value) 
  VALUES ('last_sync_at', '') 
  ON CONFLICT (key) DO UPDATE SET value = '';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get daily average out quantity for last 30 days
CREATE OR REPLACE FUNCTION get_daily_avg_out(p_item_code TEXT, p_warehouse TEXT)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(out_qty) / NULLIF(30, 0), 0)
  FROM inventory_transactions
  WHERE item_code = p_item_code
    AND warehouse = p_warehouse
    AND doc_date >= CURRENT_DATE - INTERVAL '30 days'
    AND direction = 'Out';
$$ LANGUAGE SQL STABLE;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER thresholds_updated_at BEFORE UPDATE ON stock_thresholds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
