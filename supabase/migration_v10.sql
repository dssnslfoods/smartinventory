-- ============================================================
-- NSL-IIP Migration v10: Multi-tenant Data Isolation
-- Backfill company_id + RLS per company + SECURITY INVOKER views
-- ============================================================
--
-- Prerequisites: migration_v9.sql must have been run first.
--   (This file re-creates helper functions to be safe / idempotent)
--
-- What this migration does:
--   1. Add company_id to tables missing it (import_logs, purchase_order_lines)
--   2. Backfill company_id = NSL on ALL existing rows (safety net)
--   3. Replace open "USING (true)" RLS policies with company-filtered ones
--   4. Set all views to SECURITY INVOKER so they respect table-level RLS
--      → each user sees only their company's data through every view
-- ============================================================

-- ── 0. Ensure helper functions exist (idempotent — safe to re-run) ───────────
-- These were defined in v9 but re-created here in case v9 ran partially.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'guest');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 1. Add company_id to remaining tables ────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='import_logs') THEN
    ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_lines') THEN
    ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
END $$;

-- ── 2. Backfill: ensure every row has NSL company_id ─────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='items') THEN
    UPDATE items SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_transactions') THEN
    UPDATE inventory_transactions SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_thresholds') THEN
    UPDATE stock_thresholds SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='warehouses') THEN
    UPDATE warehouses SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='item_groups') THEN
    UPDATE item_groups SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='suppliers') THEN
    UPDATE suppliers SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    UPDATE purchase_orders SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_lines') THEN
    UPDATE purchase_order_lines pol
      SET company_id = po.company_id
      FROM purchase_orders po
      WHERE pol.po_number = po.po_number AND pol.company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_config') THEN
    UPDATE system_config SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='import_logs') THEN
    UPDATE import_logs SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
  END IF;
END $$;

-- ── 3. Replace RLS policies with company-filtered versions ───────────────────
-- Pattern:
--   SELECT  → company_id = my company  OR  super_admin (sees all)
--   ALL     → same

-- ── items ──────────────────────────────────────────────────────────────────

-- Apply company-filtered RLS to each data table (skip if table doesn't exist)
DO $$
DECLARE
  tbl TEXT;
  sel_policy TEXT;
  wrt_policy TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'items','inventory_transactions','stock_thresholds','warehouses',
    'item_groups','suppliers','purchase_orders'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      -- Drop old open policies (various names used across migrations)
      EXECUTE format('DROP POLICY IF EXISTS "Users can read %s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Users can insert %s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Users can update %s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Users can delete %s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Users can manage %s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_select', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_write', tbl);
      -- Create company-filtered SELECT policy
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')',
        tbl || '_select', tbl
      );
      -- Create company-filtered ALL policy
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'') WITH CHECK (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')',
        tbl || '_write', tbl
      );
    END IF;
  END LOOP;
END $$;

-- ── purchase_order_lines ──────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_lines') THEN
    EXECUTE 'ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can read pol" ON purchase_order_lines';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage pol" ON purchase_order_lines';
    EXECUTE 'DROP POLICY IF EXISTS pol_select ON purchase_order_lines';
    EXECUTE 'DROP POLICY IF EXISTS pol_write ON purchase_order_lines';
    EXECUTE $p$
      CREATE POLICY pol_select ON purchase_order_lines FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
    EXECUTE $p$
      CREATE POLICY pol_write ON purchase_order_lines FOR ALL TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
      WITH CHECK (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
  END IF;
END $$;

-- ── system_config ─────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_config') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can read system_config" ON system_config';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert system_config" ON system_config';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update system_config" ON system_config';
    EXECUTE 'DROP POLICY IF EXISTS system_config_select ON system_config';
    EXECUTE 'DROP POLICY IF EXISTS system_config_write ON system_config';
    EXECUTE $p$
      CREATE POLICY system_config_select ON system_config FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
    EXECUTE $p$
      CREATE POLICY system_config_write ON system_config FOR ALL TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
      WITH CHECK (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
  END IF;
END $$;

-- ── import_logs ───────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='import_logs') THEN
    EXECUTE 'ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can read import_logs" ON import_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert import_logs" ON import_logs';
    EXECUTE 'DROP POLICY IF EXISTS import_logs_select ON import_logs';
    EXECUTE 'DROP POLICY IF EXISTS import_logs_write ON import_logs';
    EXECUTE $p$
      CREATE POLICY import_logs_select ON import_logs FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
    EXECUTE $p$
      CREATE POLICY import_logs_write ON import_logs FOR ALL TO authenticated
      USING (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
      WITH CHECK (company_id = public.get_my_company_id() OR public.get_my_role() = ''super_admin'')
    $p$;
  END IF;
END $$;

-- ── transaction_types (global lookup — keep open, no company_id) ─────────
-- No changes needed; these are shared reference data across all companies.

-- ── 4. Views → SECURITY INVOKER ──────────────────────────────────────────────
-- Default views run as the owner (postgres) and bypass RLS.
-- SECURITY INVOKER makes them run as the calling user, so RLS applies.
-- Requires PostgreSQL 15+ (Supabase default).

-- All view alterations are conditional (views may not exist on fresh databases)
DO $$
DECLARE v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_stock_onhand','v_movement_monthly','v_transactions','v_stock_alerts',
    'v_slow_moving','v_inventory_turnover','v_reorder_suggestions','v_abc_analysis',
    'v_goods_in_transit','v_stock_position','v_active_item_count'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name=v) THEN
      EXECUTE format('ALTER VIEW %I SET (security_invoker = on)', v);
    END IF;
  END LOOP;
END $$;

-- ── 5. Grant on purchase_order_lines / import_logs if they exist ─────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_lines') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_order_lines TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='import_logs') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON import_logs TO authenticated';
  END IF;
END $$;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Summary:
--   ✓ company_id added to import_logs + purchase_order_lines
--   ✓ All existing rows backfilled with NSL company_id
--   ✓ Old open RLS policies replaced with company-filtered policies
--   ✓ All views set to SECURITY INVOKER (respect table RLS)
--   ✓ transaction_types kept as global lookup (no company filter)
--
-- Result: users in NSL see only NSL data; future companies see only their data
