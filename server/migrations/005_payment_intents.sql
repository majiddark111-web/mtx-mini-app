CREATE TABLE IF NOT EXISTS mtx_payment_intents (
  transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_address TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_nano BIGINT NOT NULL CHECK (amount_nano > 0),
  credited_coins BIGINT NOT NULL CHECK (credited_coins > 0),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS mtx_payment_intents_user_created_idx ON mtx_payment_intents (user_id, created_at DESC);
