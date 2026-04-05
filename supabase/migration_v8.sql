-- ============================================
-- NSL-IIP Migration v8
-- Auto expire_date calculation via Trigger
-- ============================================
-- Logic:
--   WHEN expire_date IS NULL on INSERT or UPDATE:
--     1. Try  → item_groups.shelf_life_days  (per-group default)
--     2. Then → system_config 'default_shelf_life_days' (global fallback)
--     3. Final → 365 days hard-coded fallback
-- ============================================

-- ── PHASE 1: Add shelf_life_days to item_groups ───────────────────────────────
ALTER TABLE item_groups
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER DEFAULT NULL;

-- Seed sensible defaults per existing group
UPDATE item_groups SET shelf_life_days = 365  WHERE group_code = 123; -- Finish Goods
UPDATE item_groups SET shelf_life_days = 548  WHERE group_code = 125; -- Raw Materials (1.5 yr)
UPDATE item_groups SET shelf_life_days = 730  WHERE group_code = 126; -- By Product
UPDATE item_groups SET shelf_life_days = 365  WHERE group_code = 127; -- Packaging

-- ── PHASE 2: Global fallback in system_config ─────────────────────────────────
INSERT INTO system_config (key, value)
VALUES ('default_shelf_life_days', '365')
ON CONFLICT (key) DO NOTHING;

-- ── PHASE 3: Trigger function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_expire_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_shelf_life INTEGER;
  v_global     INTEGER;
BEGIN
  -- Only fill in when expire_date is NULL
  IF NEW.expire_date IS NULL THEN

    -- 1) Try group-level shelf life
    SELECT shelf_life_days
      INTO v_shelf_life
      FROM item_groups
     WHERE group_code = NEW.group_code;

    -- 2) Fallback: global system_config
    IF v_shelf_life IS NULL THEN
      SELECT COALESCE(NULLIF(value, ''), '365')::INTEGER
        INTO v_global
        FROM system_config
       WHERE key = 'default_shelf_life_days'
       LIMIT 1;
      v_shelf_life := COALESCE(v_global, 365);
    END IF;

    NEW.expire_date := CURRENT_DATE + (v_shelf_life * INTERVAL '1 day');
  END IF;

  RETURN NEW;
END;
$$;

-- ── PHASE 4: Attach trigger to items table ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_expire_date ON items;

CREATE TRIGGER trg_auto_expire_date
  BEFORE INSERT OR UPDATE OF expire_date, group_code
  ON items
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_expire_date();

-- ── PHASE 5: Back-fill existing items that still have NULL expire_date ─────────
-- Touch the row so the trigger fires (safe — expire_date stays NULL going in)
UPDATE items
SET expire_date = NULL
WHERE expire_date IS NULL;

-- ── PHASE 6: Permissions ──────────────────────────────────────────────────────
GRANT SELECT, UPDATE ON item_groups TO authenticated;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Summary:
--   ✓ Added shelf_life_days to item_groups
--   ✓ Seeded per-group shelf life values
--   ✓ Added global fallback in system_config
--   ✓ Created fn_auto_expire_date() trigger function
--   ✓ Attached trigger trg_auto_expire_date (BEFORE INSERT OR UPDATE)
--   ✓ Back-filled all existing NULL expire_date rows
