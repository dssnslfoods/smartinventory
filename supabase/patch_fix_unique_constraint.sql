-- ============================================================
-- PATCH: Fix unique constraint on inventory_transactions
-- รันใน Supabase SQL Editor ถ้า migration.sql ตั้งค่าไปแล้ว
-- ============================================================

-- Step 1: Clear all imported transaction data (ต้อง reimport ใหม่หลัง patch)
TRUNCATE TABLE inventory_transactions RESTART IDENTITY;

-- Step 2: Drop the old functional index that used COALESCE
DROP INDEX IF EXISTS idx_transactions_unique;

-- Step 3: Change doc_line_num column — ตั้ง NOT NULL DEFAULT -1
--         (ถ้า column ยังเป็น nullable จาก migration เก่า)
ALTER TABLE inventory_transactions
  ALTER COLUMN doc_line_num SET DEFAULT -1,
  ALTER COLUMN doc_line_num SET NOT NULL;

-- Step 4: Create the new simple unique index
CREATE UNIQUE INDEX idx_transactions_unique
ON inventory_transactions(trans_num, item_code, doc_line_num);

-- Step 5: Add DELETE policy if missing (needed for Replace mode)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventory_transactions'
      AND policyname = 'Users can delete transactions'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete transactions"
      ON inventory_transactions FOR DELETE TO authenticated USING (true)';
  END IF;
END$$;

-- Step 6: Add INSERT policy for system_config if missing (needed for upsert last_sync_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_config'
      AND policyname = 'Users can insert system_config'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert system_config"
      ON system_config FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
END$$;

-- Verify
SELECT 'Patch applied successfully. Please reimport your data.' AS status;
