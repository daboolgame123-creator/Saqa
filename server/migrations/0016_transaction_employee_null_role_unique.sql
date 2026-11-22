-- Phase 1 relation integrity hardening on the existing Phase 9 schema.
-- Keep migration 0002 unchanged: it may already be applied on staging.
-- The original UNIQUE (transaction_id, employee_id, relationship_type)
-- permits duplicates when relationship_type IS NULL (PostgreSQL NULL semantics).
-- No rows are changed or removed. If historical duplicates exist, fail safely
-- until the administrator reconciles them on a reviewed backup.

-- migrate:up
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transaction_employees
     WHERE relationship_type IS NULL
     GROUP BY transaction_id, employee_id
     HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PHASE1_DUPLICATE_UNTYPED_LINKS: inspect and reconcile existing rows before migration'
      USING ERRCODE = '23505';
  END IF;
END
$$;

CREATE UNIQUE INDEX transaction_employees_null_role_unique_idx
    ON transaction_employees (transaction_id, employee_id)
    WHERE relationship_type IS NULL;

-- migrate:down
DROP INDEX transaction_employees_null_role_unique_idx;
