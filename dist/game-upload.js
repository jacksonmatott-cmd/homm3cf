// Upload owned game files directly from this browser. GPL-2.0-or-later
import {libraryAAD,bytesToBase64} from './library-format.js';
import {createFileHash,hashHex} from './file-hash.js';
import {fetchTimed,responseJSON,retryDelay} from './http-client.js';
import {UPLOAD_PART_SIZE,UPLOAD_PROTOCOL,librarySummary,metadataPages,validateLibraryPlan,validGamePath,MAX_LIBRARY_BYTES,MAX_GAME_FILES,MAX_GAME_FILE_BYTES,MAX_GAME_RAW_BYTES,BINARY_LIBRARY,GAME_FOLDERS} from './library-plan.js';
const digest=async bytes=>hashHex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
const REQUIRED=['h3bitmap.lod','h3sprite.lod','heroes3.snd'];
export function selectGameFiles(files,includeMusic=true){
 const entries=Array.from(files,file=>({file,parts:(file.webkitRelativePath||file.name).split('/')})),roots=new Map();
 // Locate one complete installation; do not flatten nested backup installations.
 for(const {parts}of entries){if(parts.length<2||parts.at(-2).toLowerCase()!=='data'||!REQUIRED.includes(parts.at(-1).toLowerCase()))continue;const base=parts.slice(0,-2).join('/');if(!roots.has(base))roots.set(base,new Set());roots.get(base).add(parts.at(-1).toLowerCase());}
 const complete=[...roots].filter(([,names])=>REQUIRED.every(n=>names.has(n))).map(([base])=>base).sort((a,b)=>(a?a.split('/').length:0)-(b?b.split('/').length:0));
 if(!complete.length)throw new Error('Missing required Data/H3bitmap.lod, Data/H3sprite.lod or Data/Heroes3.snd. Select your installed Heroes III Complete / Shadow of Death folder.');
 const base=complete[0],depth=base?base.split('/').length:0;
 if(complete.slice(1).some(p=>(p?p.split('/').length:0)===depth))throw new Error('The selected folder contains multiple game installations. Select the single Heroes III folder you want to use.');
 const selected=[],names=new Set(),prefix=base?base+'/':'';
 for(const {file,parts}of entries){const full=parts.join('/');if(!full.startsWith(prefix))continue;const relative=full.slice(prefix.length).split('/'),canonical=Object.hasOwn(GAME_FOLDERS,relative[0]?.toLowerCase())&&GAME_FOLDERS[relative[0].toLowerCase()];if(!canonical||(!includeMusic&&canonical==='Mp3'))continue;const path=[canonical,...relative.slice(1)].join('/');if(!validGamePath(path))continue;if(names.has(path.toLowerCase()))throw new Error('The selected folder contains duplicate '+path+'. Select one clean game installation.');names.add(path.toLowerCase());selected.push({path,file});}
 return selected.sort((a,b)=>a.path.localeCompare(b.path));
}
async function spool(){
 if(!globalThis.navigator?.storage?.getDirectory)return {put:async bytes=>new Blob([bytes]),finish:async parts=>parts,cleanup:async()=>{}};
 const root=await navigator.storage.getDirectory(),name='h3-upload-staging';
 try{await root.removeEntry(name,{recursive:true});}catch(e){if(e.name!=='NotFoundError')throw e;}
 const dir=await root.getDirectoryHandle(name,{create:true}),file=await dir.getFileHandle('encrypted-parts',{create:true});let handle,offset=0;
 try{handle=await file.createSyncAccessHandle();handle.truncate(0);}catch(e){await root.removeEntry(name,{recursive:true}).catch(()=>{});throw e;}
 const close=()=>{if(handle){handle.flush();handle.close();handle=null;}};
 return {
  async put(bytes){const start=offset;let n=0;while(n<bytes.length){const wrote=handle.write(bytes.subarray(n),{at:offset});if(wrote<=0)throw new Error('Browser storage is full. Free some device space and retry.');offset+=wrote;n+=wrote;}return {start,end:offset};},
  async finish(parts){close();const snapshot=await file.getFile();return parts.map(p=>snapshot.slice(p.start,p.end));},
  async cleanup(){try{close();}finally{await root.removeEntry(name,{recursive:true});}}
 };
}
export async function prepareLibrary(selected,progress=()=>{},sink){
 if(!selected.length||selected.length>MAX_GAME_FILES)throw new Error(`Select at most ${MAX_GAME_FILES.toLocaleString()} supported game files.`);
 if(selected.reduce((n,e)=>n+e.file.size,0)>MAX_GAME_RAW_BYTES)throw new Error('The game folder exceeds 8 GiB of supported files.');
 const version=crypto.randomUUID(),rawKey=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
 const plan={version,key:bytesToBase64(rawKey),storage:BINARY_LIBRARY,files:[]},payloads=[];let compressedSize=0;
 const put=sink?bytes=>sink.put(bytes):async bytes=>new Blob([bytes]);
 for(let f=0;f<selected.length;f++){
  const {path,file}=selected[f];if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_GAME_FILE_BYTES)throw new Error('Game files can be at most 2 GiB each: '+path);
  progress({message:`Compressing ${path} (${f+1}/${selected.length})…`,fraction:.3*f/selected.length});
  if(/\.lod$/i.test(path)){const magic=new Uint8Array(await file.slice(0,4).arrayBuffer());if(magic[0]!==76||magic[1]!==79||magic[2]!==68||magic[3]!==0)throw new Error(path+' is not a supported original LOD archive.');}
  const hash=createFileHash();let rawSize=0,lastProgress=performance.now();
  const stream=file.stream().pipeThrough(new TransformStream({transform(bytes,controller){rawSize+=bytes.length;if(rawSize>file.size)throw new Error('The selected file changed. Select the game folder again.');hash.update(bytes);if(performance.now()-lastProgress>500){progress({message:`Compressing ${path} (${f+1}/${selected.length}) · ${Math.round(100*rawSize/Math.max(1,file.size))}%…`,fraction:.3*(f+rawSize/Math.max(1,file.size))/selected.length});lastProgress=performance.now();}controller.enqueue(bytes);}})).pipeThrough(new CompressionStream('gzip'));
  const entry={path,size:file.size,sha256:'',encoding:'gzip',encodedSize:0,chunks:[]},reader=stream.getReader();let part=new Uint8Array(UPLOAD_PART_SIZE),used=0;
  async function encrypt(bytes){const index=entry.chunks.length,iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:libraryAAD(version,path,index,bytes.length)},key,bytes));entry.chunks.push({size:bytes.length,cipherSize:encrypted.length,iv:bytesToBase64(iv),sha256:await digest(encrypted)});payloads.push(await put(encrypted));}
  try{for(;;){const {done,value}=await reader.read();if(done)break;compressedSize+=value.length;entry.encodedSize+=value.length;if(compressedSize>MAX_LIBRARY_BYTES)throw new Error('The compressed library exceeds 400 MiB. Try again without optional music or extra maps.');let at=0;while(at<value.length){const n=Math.min(UPLOAD_PART_SIZE-used,value.length-at);part.set(value.subarray(at,at+n),used);used+=n;at+=n;if(used===UPLOAD_PART_SIZE){await encrypt(part);used=0;}}}if(used)await encrypt(part.subarray(0,used));}
  catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(rawSize!==file.size)throw new Error('The selected file changed. Select the game folder again.');entry.sha256=hashHex(hash.digest());plan.files.push(entry);
 }
 validateLibraryPlan(plan);return {plan,payloads:sink?await sink.finish(payloads):payloads};
}
async function request(path,method='GET',body,accountId,label='Uploading game files'){
 const binary=body instanceof Blob,headers=body===undefined?{}:{'Content-Type':binary?'application/octet-stream':'application/json'};if(accountId)headers['X-H3-Account']=accountId;
 let response;try{response=await fetchTimed('/api'+path,{method,credentials:'same-origin',cache:'no-store',headers,body:body===undefined?undefined:binary?body:JSON.stringify(body)});}catch(error){error.message=label+': '+error.message;error.retryable=error.retryable??true;throw error;}
 const data=await responseJSON(response,{label});if(!response.ok){const error=new Error(label+': '+(data.error||'The upload could not finish.')+' (HTTP '+response.status+').');error.status=response.status;error.retryAfterMs=retryDelay(response);error.retryable=error.retryAfterMs>30000?false:data.retryable??[408,425,429,500,502,503,504].includes(response.status);throw error;}return data;
}
export async function uploadLibrary(files,includeMusic=true,progress=()=>{},accountId){
 const send=(path,method,body,label)=>request(path,method,body,accountId,label),selected=files[0]?.path&&files[0]?.file?files:selectGameFiles(files,includeMusic),sink=await spool();let plan,started=false,finished=false;
 const retry=async(path,method,body,label)=>{let error;for(let attempt=0;attempt<3;attempt++){try{return await send(path,method,body,label);}catch(e){error=e;if(!e.retryable||attempt===2)throw e;progress({message:label+' · connection interrupted, retrying…',fraction:.3});await new Promise(resolve=>setTimeout(resolve,e.retryAfterMs||500*(attempt+1)));}}throw error;};
 try{
  const prepared=await prepareLibrary(selected,progress,sink);plan=prepared.plan;const {payloads}=prepared,state=await retry('/game-library/state','GET',undefined,'Checking upload storage');
  if(state.uploadProtocol!==UPLOAD_PROTOCOL)throw new Error('The website backend needs the current upload update. Reload the site before retrying. Keep the same DB database.');
  const summary=librarySummary(plan,state.revision);progress({message:'Reserving private upload storage…',fraction:.3});
  await retry('/game-library/start','POST',summary,'Starting upload');started=true;
  for(const page of metadataPages(plan)){progress({message:`Preparing file list · ${page.fileOffset+page.files.length}/${plan.files.length} files…`,fraction:.3});await retry(`/game-library/uploads/${plan.version}/files`,'POST',page,`Preparing files ${page.fileOffset+1}–${page.fileOffset+page.files.length}`);}
  let next=0,done=0,failed=false;
  async function upload(){for(;;){if(failed)return;const index=next++;if(index>=payloads.length)return;
   try{await retry(`/game-library/uploads/${plan.version}/parts/${index}`,'PUT',payloads[index],`Uploading part ${index+1}/${payloads.length}`);}catch(error){failed=true;throw error;}
   done++;progress({message:`Uploading your private library… ${Math.round(100*done/payloads.length)}%`,fraction:.3+.65*done/payloads.length});
  }}
  const results=await Promise.allSettled([upload(),upload()]);for(const result of results)if(result.status==='rejected')throw result.reason;
  const result=await retry(`/game-library/uploads/${plan.version}/finish`,'POST',undefined,'Finishing upload');finished=true;progress({message:'Your game files are stored. Opening your library…',fraction:1});return result;
 }finally{if(started&&!finished)await send(`/game-library/uploads/${plan.version}`,'DELETE',undefined,'Cancelling incomplete upload').catch(()=>{});await sink.cleanup().catch(()=>{});}
}
