// Reserve stored/base64 bytes rather than promising unlimited Free D1 storage.
export const STORAGE_LIMIT=400*1024*1024;
export const USED_STORAGE_SQL=`COALESCE((SELECT SUM(encoded_budget) FROM game_versions),0)+COALESCE((SELECT SUM(((size_bytes+2)/3)*4+total_parts*512+2048) FROM free_snapshots),0)`;
export async function cleanExpired(db){const now=Date.now();await db.batch([
 db.prepare("DELETE FROM game_parts WHERE version IN (SELECT id FROM game_versions WHERE status='staging' AND expires_at<?)").bind(now),
 db.prepare("DELETE FROM game_versions WHERE status='staging' AND expires_at<?").bind(now),
 db.prepare("DELETE FROM free_save_parts WHERE snapshot_id IN (SELECT id FROM free_snapshots WHERE status='staging' AND expires_at<?)").bind(now),
 db.prepare("DELETE FROM free_snapshots WHERE status='staging' AND expires_at<?").bind(now)
]);}
