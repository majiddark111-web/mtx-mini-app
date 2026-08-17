CREATE TABLE IF NOT EXISTS mtx_game_state (
  user_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mtx_game_state_updated_at_idx ON mtx_game_state (updated_at);

CREATE TABLE IF NOT EXISTS mtx_tap_events (
  user_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  taps INTEGER NOT NULL CHECK (taps > 0),
  accepted_taps INTEGER NOT NULL CHECK (accepted_taps >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, batch_id)
);

CREATE INDEX IF NOT EXISTS mtx_tap_events_received_at_idx ON mtx_tap_events (received_at);

CREATE TABLE IF NOT EXISTS mtx_inventory (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  acquired_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS mtx_purchases (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price BIGINT NOT NULL CHECK (price >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS mtx_payments (
  transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  credited_coins BIGINT NOT NULL CHECK (credited_coins >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS mtx_daily_claims (user_id TEXT PRIMARY KEY, claim_day DATE NOT NULL, streak INTEGER NOT NULL CHECK (streak BETWEEN 1 AND 7));
CREATE TABLE IF NOT EXISTS mtx_mission_claims (user_id TEXT NOT NULL, mission_id TEXT NOT NULL, period_key TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, mission_id, period_key));
CREATE TABLE IF NOT EXISTS mtx_referrals (referee_id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, device_hash TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, CHECK (referee_id <> referrer_id));
CREATE TABLE IF NOT EXISTS mtx_challenge_claims (user_id TEXT NOT NULL, challenge_type TEXT NOT NULL CHECK (challenge_type IN ('combo', 'cipher')), challenge_day DATE NOT NULL, reward BIGINT NOT NULL CHECK (reward > 0), claimed_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, challenge_type, challenge_day));
CREATE TABLE IF NOT EXISTS mtx_admin_bans (user_id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, reason TEXT, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS mtx_admin_logs (id UUID PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target TEXT, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS mtx_notifications (id UUID PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS mtx_events (id UUID PRIMARY KEY, title TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, multiplier NUMERIC NOT NULL CHECK (multiplier BETWEEN 1 AND 5));
