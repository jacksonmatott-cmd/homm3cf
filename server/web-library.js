// Private per-account game libraries, stored in bounded D1 parts. GPL-2.0-or-later
import {HTTPError,json,readJSON} from './http.js';
import {tokenHash} from './auth.js';
import {validateLibraryPlan} from '../dist/library-plan.js';
import {STORAGE_LIMIT,USED_STORAGE_SQL,cleanExpired} from './storage-quota.js';
export async function libraryState(db,owner){return await db.prepare('SELECT revision,version FROM game_current WHERE account_id=?').bind(owner).first()||{revision:0,version:null};}
export async function libraryManifest(db,owner){const row=await db.prepare("SELECT v.manifest_json,v.key_base64,c.revision FROM game_current c JOIN game_versions v ON v.id=c.version WHERE c.account_id=? AND v.account_id=? AND v.status='active'").bind(owner,owner).first();return row?{...JSON.parse(row.manifest_json),key:row.key_base64,revision:row.revision}:{version:null,key:null,files:[],revision:(await libraryState(db,owner)).revision};}
export async function libraryAPI(request,db,url,owner){
 const route=url.pathname;
 if(route==='/api/game-library/state'&&request.method==='GET'){const state=await libraryState(db,owner);return json({...state,ready:!!state.version});}
 if(route==='/api/game-library/start'&&request.method==='POST'){
  const data=await readJSON(request,1024*1024);if(!Number.isSafeInteger(data.baseRevision)||data.baseRevision<0)throw new HTTPError(428,'A library revision is required.');
  let plan;try{plan=validateLibraryPlan(data);}catch(e){throw new HTTPError(400,e.message);}
  await cleanExpired(db);if((await libraryState(db,owner)).revision!==data.baseRevision)throw new HTTPError(409,'Your library changed on another computer. Reload before uploading.');
  const now=Date.now(),version=data.version;
  const statements=[
   db.prepare("DELETE FROM game_parts WHERE version IN (SELECT id FROM game_versions WHERE account_id=? AND status='staging')").bind(owner),
   db.prepare("DELETE FROM game_versions WHERE account_id=? AND status='staging'").bind(owner),
   db.prepare(`INSERT INTO game_versions(id,account_id,base_revision,status,manifest_json,key_base64,encoded_budget,total_cipher_size,total_parts,created_at,expires_at) SELECT ?,?,?,'staging',?,?,?,?,?,?,? WHERE (${USED_STORAGE_SQL})+?<=? AND EXISTS(SELECT 1 FROM game_current WHERE account_id=? AND revision=?)`).bind(version,owner,data.baseRevision,JSON.stringify(plan.manifest),data.key,plan.budget,plan.totalCipherSize,plan.parts.length,now,now+7200000,plan.budget,STORAGE_LIMIT,owner,data.baseRevision),
   ...plan.parts.map(p=>db.prepare("INSERT INTO game_parts(version,part_index,expected_size,expected_sha256) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM game_versions WHERE id=? AND account_id=? AND status='staging')").bind(version,p.index,p.size,p.sha256,version,owner))
  ];
  let results;try{results=await db.batch(statements);}catch(e){if(/UNIQUE|constraint/i.test(e.message))throw new HTTPError(409,'This upload already exists. Start again.');throw e;}
  if(results[2].meta.changes!==1){if((await libraryState(db,owner)).revision!==data.baseRevision)throw new HTTPError(409,'Your library changed on another computer. Reload before uploading.');throw new HTTPError(507,'Free cloud storage is full. Try without music or remove an old library. Your current library and saves were kept.');}
  return json({version,parts:plan.parts.length});
 }
 let m=/^\/api\/game-library\/uploads\/([a-f0-9-]{36})(?:\/parts\/(\d+)|\/(finish))?$/.exec(route);
 if(m){
  const row=await db.prepare('SELECT * FROM game_versions WHERE id=? AND account_id=?').bind(m[1],owner).first();if(!row)throw new HTTPError(404,'Upload not found.');
  if(m[2]!==undefined&&request.method==='PUT'){
   if(row.status!=='staging'||row.expires_at<Date.now())throw new HTTPError(409,'The upload ended. Start it again.');
   const index=Number(m[2]),part=await db.prepare('SELECT * FROM game_parts WHERE version=? AND part_index=?').bind(row.id,index).first();if(!part)throw new HTTPError(404,'Upload part not found.');
   const {data}=await readJSON(request,256*1024);
   if(typeof data!=='string'||data.length!==4*Math.ceil(part.expected_size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new HTTPError(400,'An upload part is damaged.');
   let bytes;try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{throw new HTTPError(400,'An upload part is damaged.');}
   if(bytes.length!==part.expected_size||tokenHash(bytes)!==part.expected_sha256)throw new HTTPError(400,'An upload part failed its checksum.');
   const result=await db.batch([
    db.prepare("UPDATE game_parts SET data_base64=? WHERE version=? AND part_index=? AND EXISTS(SELECT 1 FROM game_versions WHERE id=? AND account_id=? AND status='staging')").bind(data,row.id,index,row.id,owner),
    db.prepare("UPDATE game_versions SET expires_at=? WHERE id=? AND account_id=? AND status='staging'").bind(Date.now()+7200000,row.id,owner)
   ]);if(result[0].meta.changes!==1)throw new HTTPError(409,'The upload ended.');return json({ok:true});
  }
  if(m[3]==='finish'&&request.method==='POST'){
   const current=await libraryState(db,owner);if(row.status==='active'&&current.version===row.id)return json({revision:current.revision,version:row.id});
   if(row.status!=='staging'||row.expires_at<Date.now())throw new HTTPError(409,'The upload ended. Start it again.');
   const complete=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(expected_size),0) AS bytes FROM game_parts WHERE version=? AND data_base64 IS NOT NULL').bind(row.id).first();
   if(complete.n!==row.total_parts||complete.bytes!==row.total_cipher_size)throw new HTTPError(400,'The upload is incomplete. Your previous library was kept.');
   const results=await db.batch([
    db.prepare("UPDATE game_current SET revision=revision+1,version=? WHERE account_id=? AND revision=? AND EXISTS(SELECT 1 FROM game_versions WHERE id=? AND account_id=? AND status='staging')").bind(row.id,owner,row.base_revision,row.id,owner),
    db.prepare("UPDATE game_versions SET status='active' WHERE id=? AND EXISTS(SELECT 1 FROM game_current WHERE account_id=? AND version=?)").bind(row.id,owner,row.id)
   ]);
   if(results[0].meta.changes!==1){const state=await libraryState(db,owner);if(state.version===row.id)return json({revision:state.revision,version:row.id});throw new HTTPError(409,'A newer library was uploaded on another computer. Reload to use it.');}
   // Remove only superseded committed versions; a newer pending upload stays intact.
   try{await db.batch([
    db.prepare("DELETE FROM game_parts WHERE version IN (SELECT id FROM game_versions WHERE account_id=? AND status='active' AND id<>(SELECT version FROM game_current WHERE account_id=?))").bind(owner,owner),
    db.prepare("DELETE FROM game_versions WHERE account_id=? AND status='active' AND id<>(SELECT version FROM game_current WHERE account_id=?)").bind(owner,owner)
   ]);}catch{}
   return json({revision:row.base_revision+1,version:row.id});
  }
  if(m[2]===undefined&&!m[3]&&request.method==='DELETE'){
   await db.batch([
    db.prepare("DELETE FROM game_parts WHERE version=? AND EXISTS(SELECT 1 FROM game_versions WHERE id=? AND account_id=? AND status='staging')").bind(row.id,row.id,owner),
    db.prepare("DELETE FROM game_versions WHERE id=? AND account_id=? AND status='staging'").bind(row.id,owner)
   ]);return json({ok:true});
  }
 }
 m=/^\/api\/game-library\/chunks\/([a-f0-9-]{36})\/(\d+)$/.exec(route);
 if(m&&request.method==='GET'){
  const row=await db.prepare("SELECT p.data_base64 FROM game_parts p JOIN game_versions v ON v.id=p.version JOIN game_current c ON c.version=v.id WHERE p.version=? AND p.part_index=? AND c.account_id=? AND v.account_id=? AND v.status='active'").bind(m[1],Number(m[2]),owner,owner).first();
  if(!row?.data_base64)throw new HTTPError(404,'Game part not found.');return new Response(Uint8Array.from(atob(row.data_base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store'}});
 }
 if(route==='/api/game-library/current'&&request.method==='DELETE'){
  await db.batch([
   db.prepare('UPDATE game_current SET revision=revision+1,version=NULL WHERE account_id=?').bind(owner),
   db.prepare('DELETE FROM game_parts WHERE version IN (SELECT id FROM game_versions WHERE account_id=?)').bind(owner),
   db.prepare('DELETE FROM game_versions WHERE account_id=?').bind(owner)
  ]);return json({ok:true});
 }
 throw new HTTPError(404,'Library endpoint not found.');
}
