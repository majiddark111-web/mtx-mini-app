CREATE TABLE IF NOT EXISTS mtx_equipped_cosmetics (
  user_id TEXT PRIMARY KEY,
  skin_item_id TEXT NOT NULL CHECK (skin_item_id = 'skin:aurora'),
  equipped_at TIMESTAMPTZ NOT NULL
);
