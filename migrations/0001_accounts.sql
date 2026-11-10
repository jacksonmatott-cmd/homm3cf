CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_state (
  account_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  object_key TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
INSERT OR IGNORE INTO cloud_state(account_id,revision) VALUES ('owner',0);
CREATE TABLE IF NOT EXISTS save_history (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(account_id,revision)
);
