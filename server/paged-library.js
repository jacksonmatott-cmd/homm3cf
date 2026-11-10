// Bounded preparation requests for free Worker CPU and D1 query limits.
// SPDX-License-Identifier: GPL-2.0-or-later
import {HTTPError,json,readJSON} from './http.js';
import {BINARY_LIBRARY,UPLOAD_PROTOCOL,MAX_GAME_FILES,MAX_GAME_PARTS,MAX_GAME_RAW_BYTES,MAX_LIBRARY_BYTES,METADATA_FILES,validateLibraryPlan} from '../dist/library-plan.js';
import {STORAGE_LIMIT} from './storage-quota.js';
const REQUIRED=['data/h3bitmap.lod','data/h3sprite.lod','data/heroes3.snd'];
export async function nativeHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export function pagedReservation(data){
 const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
 if(data.storage!==BINARY_LIBRARY||data.protocol!==UPLOAD_PROTOCOL||!/^[a-f0-9-]{36}$/.test(data.version)||!/^[A-Za-z0-9+/]{43}=$/.test(data.key||'')||!integer(data.fileCount,3,MAX_GAME_FILES)||!integer(data.partCount,data.fileCount,MAX_GAME_PARTS)||!integer(data.rawSize,3,MAX_GAME_RAW_BYTES)||!integer(data.compressedSize,1,MAX_LIBRARY_BYTES)||data.totalCipherSize!==data.compressedSize+16*data.partCount||!integer(data.budget,4096+data.totalCipherSize+data.partCount*512+data.fileCount*512,STORAGE_LIMIT))throw new HTTPError(400,'Invalid upload summary. Reload the website and select the game folder again.');
 const header={version:data.version,storage:BINARY_LIBRARY,protocol:UPLOAD_PROTOCOL,fileCount:data.fileCount,rawSize:data.rawSize,compressedSize:data.compressedSize,preparedFiles:0,preparedParts:0,preparedRaw:0,preparedCompressed:0,preparedBudget:4096,required:0,complete:false};
 return {manifest:header,budget:data.budget,totalCipherSize:data.totalCipherSize,partCount:data.partCount};
}
export function metadataStatements(db,row,header,files,parts,offset){
 const guard="EXISTS(SELECT 1 FROM game_versions WHERE id=? AND account_id=? AND status='staging' AND manifest_json=?)";
 return [
  db.prepare(`INSERT INTO game_library_files(version,file_index,metadata_json) SELECT ?,?+CAST(key AS INTEGER),value FROM json_each(?) WHERE ${guard}`).bind(row.id,offset,JSON.stringify(files),row.id,row.account_id,header),
  db.prepare(`INSERT INTO game_parts(version,part_index,expected_size,expected_sha256) SELECT ?,json_extract(value,'$.index'),json_extract(value,'$.size'),json_extract(value,'$.sha256') FROM json_each(?) WHERE ${guard}`).bind(row.id,JSON.stringify(parts),row.id,row.account_id,header)
 ];
}
export async function registerMetadata(request,db,row){
 if(row.status!=='staging'||row.expires_at<Date.now())throw new HTTPError(409,'The upload ended. Start it again.');
 const header=JSON.parse(row.manifest_json);if(header.protocol!==UPLOAD_PROTOCOL)throw new HTTPError(409,'This upload uses an older format. Reload before retrying.');
 const data=await readJSON(request,2*1024*1024);
 if(!Number.isSafeInteger(data.fileOffset)||data.fileOffset<0||!Number.isSafeInteger(data.partOffset)||data.partOffset<0||!Array.isArray(data.files)||!data.files.length||data.files.length>METADATA_FILES)throw new HTTPError(400,'Invalid metadata batch.');
 const hash=await nativeHash(new TextEncoder().encode(JSON.stringify(data)));
 const replay=h=>h.lastPage?.offset===data.fileOffset&&h.lastPage?.hash===hash;
 if(replay(header))return json({files:header.preparedFiles,parts:header.preparedParts,ready:header.complete});
 if(data.fileOffset!==header.preparedFiles||data.partOffset!==header.preparedParts||header.complete)throw new HTTPError(409,'Upload metadata arrived out of order. Retry the upload.');
 let page;try{page=validateLibraryPlan({version:row.id,key:row.key_base64,storage:BINARY_LIBRARY,files:data.files},{partial:true,partOffset:data.partOffset});}catch(error){throw new HTTPError(400,error.message);}
 const next={...header,preparedFiles:header.preparedFiles+page.manifest.files.length,preparedParts:header.preparedParts+page.parts.length,preparedRaw:header.preparedRaw+page.manifest.files.reduce((n,f)=>n+f.size,0),preparedCompressed:header.preparedCompressed+page.compressedSize,preparedBudget:header.preparedBudget+page.budget-4096,lastPage:{offset:data.fileOffset,hash}};
 for(const file of page.manifest.files){const i=REQUIRED.indexOf(file.path.toLowerCase());if(i>=0&&file.size>0)next.required|=1<<i;}
 if(next.preparedFiles>header.fileCount||next.preparedParts>row.total_parts||next.preparedRaw>header.rawSize||next.preparedCompressed>header.compressedSize||next.preparedBudget>row.encoded_budget)throw new HTTPError(400,'The upload metadata exceeds its reserved size. Your current library was kept.');
 next.complete=next.preparedFiles===header.fileCount;
 if(next.complete&&(next.required!==7||next.preparedParts!==row.total_parts||next.preparedRaw!==header.rawSize||next.preparedCompressed!==header.compressedSize))throw new HTTPError(400,'The game metadata is incomplete. Select the installed game folder again.');
 const text=JSON.stringify(next);let result;
 try{result=await db.batch([
  db.prepare("UPDATE game_versions SET manifest_json=?,expires_at=?,encoded_budget=? WHERE id=? AND account_id=? AND status='staging' AND manifest_json=?").bind(text,Date.now()+7200000,next.complete?next.preparedBudget:row.encoded_budget,row.id,row.account_id,row.manifest_json),
  ...metadataStatements(db,row,text,page.manifest.files,page.parts,data.fileOffset)
 ]);}catch(error){
  const current=await db.prepare('SELECT manifest_json FROM game_versions WHERE id=? AND account_id=?').bind(row.id,row.account_id).first();if(current&&replay(JSON.parse(current.manifest_json)))return json({files:next.preparedFiles,parts:next.preparedParts,ready:next.complete});
  if(/UNIQUE|constraint/i.test(error.message))throw new HTTPError(400,'The upload contains duplicate game paths. Select one game installation.');throw error;
 }
 if(result[0].meta.changes!==1)throw new HTTPError(409,'This upload changed in another request. Retry the upload.');
 return json({files:next.preparedFiles,parts:next.preparedParts,ready:next.complete});
}
