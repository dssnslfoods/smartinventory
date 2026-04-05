-- ============================================================
-- NSL-IIP Migration v11: User Invitations
-- ============================================================
-- Flow:
--   1. Admin/Super Admin สร้าง invitation (email + role + company_id)
--   2. User signup ด้วย email นั้น
--   3. handle_new_user() trigger ตรวจ invitation → กำหนด role + company ให้อัตโนมัติ
-- ============================================================

-- ── 1. user_invitations table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_invitations (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT    NOT NULL,
  role        TEXT    NOT NULL
                CHECK (role IN ('admin', 'executive', 'supervisor', 'staff')),
  company_id  UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by  UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'cancelled')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON user_invitations(email, status);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_read" ON user_invitations
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND company_id = public.get_my_company_id())
  );

CREATE POLICY "invitations_write" ON user_invitations
  FOR ALL TO authenticated
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND company_id = public.get_my_company_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND company_id = public.get_my_company_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON user_invitations TO authenticated;

-- ── 3. Update handle_new_user trigger to apply invitation ────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv RECORD;
BEGIN
  -- ตรวจ pending invitation ที่ยังไม่หมดอายุ
  SELECT * INTO v_inv
  FROM public.user_invitations
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- มี invitation → ใช้ role + company จาก invitation
    INSERT INTO public.user_profiles (id, role, email, full_name, company_id)
    VALUES (
      NEW.id,
      v_inv.role,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      v_inv.company_id
    )
    ON CONFLICT (id) DO UPDATE
      SET email      = EXCLUDED.email,
          role       = EXCLUDED.role,
          company_id = EXCLUDED.company_id;

    -- Mark invitation accepted
    UPDATE public.user_invitations
      SET status = 'accepted'
    WHERE id = v_inv.id;

  ELSE
    -- ไม่มี invitation → default staff ไม่มี company
    INSERT INTO public.user_profiles (id, role, email, full_name)
    VALUES (
      NEW.id,
      'staff',
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Summary:
--   ✓ user_invitations table (email, role, company_id, status, expires_at)
--   ✓ RLS: super_admin เห็นทั้งหมด, admin เห็นของบริษัทตัวเอง
--   ✓ handle_new_user trigger: ตรวจ invitation ก่อน signup → กำหนด role อัตโนมัติ
