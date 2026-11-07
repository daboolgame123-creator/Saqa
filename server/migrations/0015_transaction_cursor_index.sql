-- Phase 23: active-book cursor pagination on immutable creation order.
-- migrate:up
CREATE INDEX transactions_active_created_cursor_idx
  ON transactions (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- migrate:down
DROP INDEX transactions_active_created_cursor_idx;
