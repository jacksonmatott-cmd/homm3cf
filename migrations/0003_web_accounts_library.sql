CREATE TABLE IF NOT EXISTS web_accounts (
 id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
 salt TEXT NOT NULL, verifier TEXT NOT NULL, version TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_sessions (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, account_version TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS web_session_expiry ON web_sessions(expires_at);
CREATE TABLE IF NOT EXISTS web_rate_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS game_current (account_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, version TEXT);
CREATE TABLE IF NOT EXISTS game_versions (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, base_revision INTEGER NOT NULL,
 status TEXT NOT NULL, manifest_json TEXT NOT NULL, key_base64 TEXT NOT NULL,
 encoded_budget INTEGER NOT NULL, total_cipher_size INTEGER NOT NULL, total_parts INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_versions_owner ON game_versions(account_id,status);
CREATE TABLE IF NOT EXISTS game_parts (
 version TEXT NOT NULL, part_index INTEGER NOT NULL, expected_size INTEGER NOT NULL,
 expected_sha256 TEXT NOT NULL, data_base64 TEXT,
 PRIMARY KEY(version,part_index)
);
