CREATE TABLE IF NOT EXISTS free_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  revision INTEGER,
  status TEXT NOT NULL CHECK(status IN ('staging','committed')),
  size_bytes INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  encoding TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(account_id,revision)
);
CREATE INDEX IF NOT EXISTS free_snapshot_status ON free_snapshots(account_id,status,revision);
CREATE TABLE IF NOT EXISTS free_save_parts (
  snapshot_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  PRIMARY KEY(snapshot_id,part_index)
);
CREATE TABLE IF NOT EXISTS free_current (
  account_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  snapshot_id TEXT
);
INSERT OR IGNORE INTO free_current(account_id,revision) VALUES ('owner',0);
