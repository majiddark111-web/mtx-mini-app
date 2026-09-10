CREATE TABLE IF NOT EXISTS mtx_tap_receipts (
  user_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  taps INTEGER NOT NULL CHECK (taps > 0),
  accepted_taps INTEGER NOT NULL CHECK (accepted_taps >= 0),
  flagged BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, batch_id)
);
