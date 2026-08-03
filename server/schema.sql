CREATE TABLE IF NOT EXISTS lumos_game_state (
  user_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lumos_game_state_updated_at_idx ON lumos_game_state (updated_at);
