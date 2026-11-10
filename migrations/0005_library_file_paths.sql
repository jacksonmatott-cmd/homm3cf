-- Enforce path uniqueness across small metadata batches, including case variants.
CREATE UNIQUE INDEX IF NOT EXISTS game_library_paths
 ON game_library_files(version, lower(json_extract(metadata_json, '$.path')));
