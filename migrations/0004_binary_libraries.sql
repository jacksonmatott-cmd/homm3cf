CREATE TABLE IF NOT EXISTS game_blobs (
 version TEXT NOT NULL,
 part_index INTEGER NOT NULL,
 data_blob BLOB NOT NULL,
 PRIMARY KEY(version,part_index)
);
CREATE TABLE IF NOT EXISTS game_library_files (
 version TEXT NOT NULL,
 file_index INTEGER NOT NULL,
 metadata_json TEXT NOT NULL,
 PRIMARY KEY(version,file_index)
);
