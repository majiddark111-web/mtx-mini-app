ALTER TABLE mtx_notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE mtx_notifications SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL;
ALTER TABLE mtx_notifications ALTER COLUMN expires_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS mtx_notification_read_state (
  user_id TEXT PRIMARY KEY,
  read_at TIMESTAMPTZ NOT NULL
);
