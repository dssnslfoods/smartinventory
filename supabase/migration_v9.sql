-- ============================================================
-- NSL-IIP Migration v9: Multi-tenant RBAC
-- Super Admin, Company Management, Role Permissions
-- ============================================================
--
-- Roles hierarchy:
--   super_admin → สร้างบริษัท, กำหนด admin, ควบคุม features ต่อบริษัท
--   admin       → จัดการ users + permissions ภายในบริษัทตัวเอง
--   executive   → ดูรายงานทั้งหมด (read-only)
--   supervisor  → operational tasks + import + settings
--   staff       → limited view (dashboard, stock, alerts)
--
-- ⚠ Run in Supabase SQL Editor (requires superuser for auth.users trigger)
-- ============================================================

-- ── 0. Helper trigger function (idempotent) ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. Companies ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  slug        TEXT    UNIQUE NOT NULL,
  description TEXT,
  logo_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure slug column exists (in case table was created by an older migration without it)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
-- Add unique constraint on slug if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_key'
  ) THEN
    UPDATE companies SET slug = id::text WHERE slug IS NULL;
    ALTER TABLE companies ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
  END IF;
END $$;

-- NSL Food Service = company ที่ 1 (เจ้าของข้อมูลเดิมทั้งหมด)
INSERT INTO companies (id, name, slug, description) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'NSL Food Service',
   'nsl-food-service',
   'NSL Food Service Co., Ltd. — ผู้ดูแลข้อมูลเดิมในระบบ')
ON CONFLICT (slug) DO NOTHING;

DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. User Profiles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('super_admin', 'admin', 'executive', 'supervisor', 'staff')),
  full_name   TEXT,
  email       TEXT,        -- synced from auth.users via trigger
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup (and sync email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, email, full_name)
  VALUES (
    NEW.id,
    'staff',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Helper functions (AFTER user_profiles table exists) ────────────────────
-- SECURITY DEFINER avoids recursive RLS when policies call these functions.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'guest');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 4. Company Features ───────────────────────────────────────────────────────
-- super_admin กำหนดว่าแต่ละบริษัทจะใช้ feature ไหนได้บ้าง
-- ถ้าไม่มีแถวสำหรับ feature นั้น = enabled โดย default

CREATE TABLE IF NOT EXISTS company_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, feature_key)
);

-- ── 5. Role Permissions ───────────────────────────────────────────────────────
-- admin กำหนดว่าแต่ละ role ภายในบริษัทตัวเองจะมีสิทธิอะไรบ้าง
-- ถ้าไม่มีแถว = ใช้ default ที่กำหนดใน app code

CREATE TABLE IF NOT EXISTS role_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role           TEXT NOT NULL
                   CHECK (role IN ('admin', 'executive', 'supervisor', 'staff')),
  permission_key TEXT NOT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, role, permission_key)
);

-- ── 6. Add company_id to existing data tables (skip if table doesn't exist yet) ─

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='items') THEN
    ALTER TABLE items ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_transactions') THEN
    ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_thresholds') THEN
    ALTER TABLE stock_thresholds ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='warehouses') THEN
    ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='item_groups') THEN
    ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='suppliers') THEN
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_config') THEN
    ALTER TABLE system_config ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id);
  END IF;
END $$;


-- ── 7. Row Level Security ─────────────────────────────────────────────────────

-- companies: all authenticated can read; only super_admin can write
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_read"  ON companies;
DROP POLICY IF EXISTS "companies_write" ON companies;

CREATE POLICY "companies_read" ON companies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "companies_write" ON companies
  FOR ALL TO authenticated
  USING      (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- user_profiles: all can read; super_admin can manage all; admin manages own company
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read"  ON user_profiles;
DROP POLICY IF EXISTS "profiles_write" ON user_profiles;

CREATE POLICY "profiles_read" ON user_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_write" ON user_profiles
  FOR ALL TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (id = auth.uid() OR company_id = public.get_my_company_id())
    )
    OR id = auth.uid()  -- user can update own profile
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (id = auth.uid() OR company_id = public.get_my_company_id())
    )
    OR id = auth.uid()
  );

-- company_features: all can read; only super_admin can write
ALTER TABLE company_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "features_read"  ON company_features;
DROP POLICY IF EXISTS "features_write" ON company_features;

CREATE POLICY "features_read" ON company_features
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "features_write" ON company_features
  FOR ALL TO authenticated
  USING      (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- role_permissions: all can read; super_admin or admin (own company) can write
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_perms_read"  ON role_permissions;
DROP POLICY IF EXISTS "role_perms_write" ON role_permissions;

CREATE POLICY "role_perms_read" ON role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_perms_write" ON role_permissions
  FOR ALL TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND company_id = public.get_my_company_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND company_id = public.get_my_company_id())
  );

-- ── 8. Grants ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON companies        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO authenticated;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Summary:
--   ✓ companies table (NSL Food Service seeded as id=...001)
--   ✓ user_profiles table (auto-created on signup via trigger)
--   ✓ get_my_role() / get_my_company_id() helper functions (after table creation)
--   ✓ company_features table (super_admin controls features per company)
--   ✓ role_permissions table (admin controls permissions per role)
--   ✓ company_id added to all data tables (defaulting to NSL)
--   ✓ RLS policies for all new tables
