// Small D1 requests keep uploads/downloads inside Free-plan per-request CPU and row limits.
// SPDX-License-Identifier: GPL-2.0-or-later
import {Buffer} from 'node:buffer';
import {tokenHash} from './auth.js';
import {json,HTTPError,readJSON} from './http.js';
import {USED_STORAGE_SQL,cleanExpired} from './storage-quota.js';
export const CLOUD_LIMIT=32*1024*1024;
export const PART_SIZE=128*1024;
export function createSaveStore(OWNER='owner',{globalLimit=0}={}){
async function cloudState(db) {
  const row=await db.prepare(`SELECT c.revision,c.snapshot_id,s.size_bytes,s.created_at FROM free_current c
    LEFT JOIN free_snapshots s ON s.id=c.snapshot_id WHERE c.account_id=?`).bind(OWNER).first();
  return {revision:row?.revision??0,size:row?.size_bytes??0,updatedAt:row?.created_at??null,snapshotId:row?.snapshot_id??null};
}
async function removeSnapshots(db,ids) {
  if(!ids.length)return;
  const placeholders=ids.map(()=>'?').join(',');
  await db.batch([
    db.prepare(`DELETE FROM free_save_parts WHERE snapshot_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM free_snapshots WHERE id IN (${placeholders})`).bind(...ids)
  ]);
}
async function discardStaging(db,id) {
  await db.batch([
    db.prepare("DELETE FROM free_save_parts WHERE snapshot_id=? AND EXISTS(SELECT 1 FROM free_snapshots WHERE id=? AND status='staging')").bind(id,id),
    db.prepare("DELETE FROM free_snapshots WHERE id=? AND status='staging'").bind(id)
  ]);
}
async function prune(db) {
  const now=Date.now();
  await db.batch([
    db.prepare("DELETE FROM free_save_parts WHERE snapshot_id IN (SELECT id FROM free_snapshots WHERE account_id=? AND status='staging' AND expires_at<?)").bind(OWNER,now),
    db.prepare("DELETE FROM free_snapshots WHERE account_id=? AND status='staging' AND expires_at<?").bind(OWNER,now)
  ]);
  const old=await db.prepare("SELECT id FROM free_snapshots WHERE account_id=? AND status='committed' ORDER BY revision DESC LIMIT -1 OFFSET 5").bind(OWNER).all();
  await removeSnapshots(db,old.results.map(row=>row.id));
}
async function snapshot(db,id) {
  if(!/^[a-f0-9-]{36}$/.test(id))throw new HTTPError(404,'Backup not found.');
  const row=await db.prepare('SELECT * FROM free_snapshots WHERE id=? AND account_id=?').bind(id,OWNER).first();
  if(!row)throw new HTTPError(404,'Backup not found.');
  return row;
}
function metadata(row) {
  return {id:row.id,revision:row.revision,size:row.size_bytes,parts:row.total_parts,partSize:PART_SIZE,encoding:row.encoding,sha256:row.sha256,updatedAt:row.created_at};
}
async function saveAPI(request,db,url) {
  const route=url.pathname;
  if(route==='/api/saves/meta'&&request.method==='GET')return json(await cloudState(db));
  if(route==='/api/saves/history'&&request.method==='GET') {
    const {results}=await db.prepare("SELECT * FROM free_snapshots WHERE account_id=? AND status='committed' ORDER BY revision DESC LIMIT 5").bind(OWNER).all();
    return json({backups:results.map(row=>metadata(row))});
  }
  if(route==='/api/saves/current'&&request.method==='GET') {
    const state=await cloudState(db);
    if(!state.snapshotId)throw new HTTPError(404,'No cloud save has been uploaded yet.');
    return json(metadata(await snapshot(db,state.snapshotId)));
  }
  if(route==='/api/saves/start'&&request.method==='POST') {
    if(globalLimit)await cleanExpired(db);await prune(db);const data=await readJSON(request);
    if(!Number.isSafeInteger(data.baseRevision)||data.baseRevision<0)throw new HTTPError(428,'A save revision is required.');
    if(!Number.isSafeInteger(data.size)||data.size<1||data.size>CLOUD_LIMIT)throw new HTTPError(413,'Cloud backups are limited to 32 MiB. Export larger backups locally.');
    if(data.parts!==Math.ceil(data.size/PART_SIZE)||!['gzip','identity'].includes(data.encoding)||!/^[a-f0-9]{64}$/.test(data.sha256||''))throw new HTTPError(400,'Invalid backup metadata.');
    const state=await cloudState(db);
    if(state.revision!==data.baseRevision)return json({error:'Another computer has newer cloud saves. Your device copy was kept.',save:state},409);
    const pending=await db.prepare("SELECT COUNT(*) AS n FROM free_snapshots WHERE account_id=? AND status='staging'").bind(OWNER).first();
    if(pending.n>=2)throw new HTTPError(409,'Two uploads are already pending. Finish or cancel those uploads, or retry after they expire. Your device copy was kept.');
    const id=crypto.randomUUID(),created=new Date().toISOString();
    const fields="INSERT INTO free_snapshots(id,account_id,base_revision,status,size_bytes,total_parts,encoding,sha256,created_at,expires_at) ";
    const query=globalLimit?fields+`SELECT ?,?,?,'staging',?,?,?,?,?,? WHERE (${USED_STORAGE_SQL})+?<=?`:fields+"VALUES (?,?,?,'staging',?,?,?,?,?,?)";
    const args=[id,OWNER,data.baseRevision,data.size,data.parts,data.encoding,data.sha256,created,Date.now()+2*60*60*1000];
    if(globalLimit)args.push(4*Math.ceil(data.size/3)+data.parts*512+2048,globalLimit);
    const reserved=await db.prepare(query).bind(...args).run();
    if(reserved.meta.changes!==1)throw new HTTPError(507,'Free cloud storage is full. Your local saves were kept; export a backup before freeing stored game files.');
    return json({id,partSize:PART_SIZE});
  }
  let match=/^\/api\/saves\/uploads\/([a-f0-9-]{36})\/parts\/(\d+)$/.exec(route);
  if(match&&request.method==='PUT') {
    const row=await snapshot(db,match[1]),index=Number(match[2]);
    if(row.status!=='staging'||row.expires_at<Date.now())throw new HTTPError(409,'This upload has ended. Retry syncing your device copy.');
    if(!Number.isSafeInteger(index)||index<0||index>=row.total_parts)throw new HTTPError(400,'Invalid backup part.');
    const {data}=await readJSON(request,256*1024),expected=Math.min(PART_SIZE,row.size_bytes-index*PART_SIZE);
    if(typeof data!=='string'||data.length!==4*Math.ceil(expected/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new HTTPError(400,'A backup part is damaged.');
    const bytes=Buffer.from(data,'base64');
    if(bytes.length!==expected)throw new HTTPError(400,'A backup part is incomplete.');
    const hash=tokenHash(bytes);
    await db.prepare('INSERT OR IGNORE INTO free_save_parts(snapshot_id,part_index,data_base64,sha256,byte_length) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM free_snapshots WHERE id=? AND status=\'staging\')').bind(row.id,index,data,hash,bytes.length,row.id).run();
    const stored=await db.prepare('SELECT sha256 FROM free_save_parts WHERE snapshot_id=? AND part_index=?').bind(row.id,index).first();
    if(!stored||stored.sha256!==hash)throw new HTTPError(409,'This part was already uploaded with different data. Retry the backup.');
    return json({ok:true});
  }
  match=/^\/api\/saves\/uploads\/([a-f0-9-]{36})\/finish$/.exec(route);
  if(match&&request.method==='POST') {
    const row=await snapshot(db,match[1]);
    if(row.status==='committed')return json({revision:row.revision,size:row.size_bytes,updatedAt:row.created_at});
    if(row.expires_at<Date.now())throw new HTTPError(409,'The upload expired. Retry syncing your saved files.');
    const parts=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(byte_length),0) AS bytes FROM free_save_parts WHERE snapshot_id=?').bind(row.id).first();
    if(parts.n!==row.total_parts||parts.bytes!==row.size_bytes)throw new HTTPError(400,'The backup upload is incomplete. Your previous cloud save is unchanged.');
    const result=await db.batch([
      db.prepare("UPDATE free_current SET revision=revision+1,snapshot_id=? WHERE account_id=? AND revision=? AND EXISTS(SELECT 1 FROM free_snapshots WHERE id=? AND status='staging')").bind(row.id,OWNER,row.base_revision,row.id),
      db.prepare("UPDATE free_snapshots SET status='committed',revision=(SELECT revision FROM free_current WHERE account_id=? AND snapshot_id=?) WHERE id=? AND EXISTS(SELECT 1 FROM free_current WHERE account_id=? AND snapshot_id=?)").bind(OWNER,row.id,row.id,OWNER,row.id)
    ]);
    if(result[0].meta.changes!==1){const latest=await snapshot(db,row.id).catch(()=>null);if(latest?.status==='committed')return json({revision:latest.revision,size:latest.size_bytes,updatedAt:latest.created_at});await discardStaging(db,row.id);return json({error:'Another computer uploaded newer progress. Your device copy was kept.',save:await cloudState(db)},409);}
    try{await prune(db);}catch{}
    return json({revision:row.base_revision+1,size:row.size_bytes,updatedAt:row.created_at});
  }
  match=/^\/api\/saves\/uploads\/([a-f0-9-]{36})$/.exec(route);
  if(match&&request.method==='DELETE') {
    const row=await snapshot(db,match[1]);
    if(row.status==='staging')await discardStaging(db,row.id);
    return json({ok:true});
  }
  match=/^\/api\/saves\/snapshots\/([a-f0-9-]{36})(?:\/parts\/(\d+))?$/.exec(route);
  if(match&&request.method==='GET') {
    const row=await snapshot(db,match[1]);
    if(row.status!=='committed')throw new HTTPError(404,'Backup not found.');
    if(match[2]===undefined)return json(metadata(row));
    const index=Number(match[2]);
    if(!Number.isSafeInteger(index)||index<0||index>=row.total_parts)throw new HTTPError(404,'Backup part not found.');
    const part=await db.prepare('SELECT data_base64,sha256,byte_length FROM free_save_parts WHERE snapshot_id=? AND part_index=?').bind(row.id,index).first();
    if(!part)throw new HTTPError(503,'A cloud backup part is unavailable. Your device copy was kept.');
    return json({data:part.data_base64,sha256:part.sha256,size:part.byte_length});
  }
  throw new HTTPError(404,'This save endpoint was not found.');
}

return {cloudState,saveAPI};
}
const legacy=createSaveStore();
export const cloudState=(...args)=>legacy.cloudState(...args);
export const saveAPI=(...args)=>legacy.saveAPI(...args);
