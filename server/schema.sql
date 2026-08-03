CREATE TABLE IF NOT EXISTS lumos_game_state (
  user_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lumos_game_state_updated_at_idx ON lumos_game_state (updated_at);

CREATE TABLE IF NOT EXISTS lumos_inventory (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  acquired_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS lumos_purchases (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price BIGINT NOT NULL CHECK (price >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS lumos_payments (
  transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  credited_coins BIGINT NOT NULL CHECK (credited_coins >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lumos_daily_claims (user_id TEXT PRIMARY KEY, claim_day DATE NOT NULL, streak INTEGER NOT NULL CHECK (streak BETWEEN 1 AND 7));
CREATE TABLE IF NOT EXISTS lumos_mission_claims (user_id TEXT NOT NULL, mission_id TEXT NOT NULL, period_key TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, mission_id, period_key));
CREATE TABLE IF NOT EXISTS lumos_referrals (referee_id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, device_hash TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, CHECK (referee_id <> referrer_id));
