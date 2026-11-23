-- Phase15-N: lightweight per-account "new book" state, NOT a formal ViewLog.
-- No user or transaction data is copied into notification payloads.
-- migrate:up
CREATE TABLE transaction_opened (
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    opened_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX transaction_opened_transaction_id_idx ON transaction_opened (transaction_id);

-- migrate:down
DROP TABLE transaction_opened;
