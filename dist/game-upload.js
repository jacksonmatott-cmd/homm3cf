// Upload owned game files directly from this browser. GPL-2.0-or-later
import {libraryAAD,bytesToBase64} from './library-format.js';
import {createFileHash,hashHex} from './file-hash.js';
import {GAME_PART_SIZE,validateLibraryPlan,validGamePath,MAX_LIBRARY_BYTES,MAX_GAME_FILES,MAX_GAME_FILE_BYTES,MAX_GAME_RAW_BYTES,BINARY_LIBRARY,GAME_FOLDERS} from './library-plan.js';
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
  const hash=createFileHash();let rawSize=0;
  const stream=file.stream().pipeThrough(new TransformStream({transform(bytes,controller){rawSize+=bytes.length;if(rawSize>file.size)throw new Error('The selected file changed. Select the game folder again.');hash.update(bytes);controller.enqueue(bytes);}})).pipeThrough(new CompressionStream('gzip'));
  const entry={path,size:file.size,sha256:'',encoding:'gzip',encodedSize:0,chunks:[]},reader=stream.getReader();let part=new Uint8Array(GAME_PART_SIZE),used=0;
  async function encrypt(bytes){const index=entry.chunks.length,iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:libraryAAD(version,path,index,bytes.length)},key,bytes));entry.chunks.push({size:bytes.length,cipherSize:encrypted.length,iv:bytesToBase64(iv),sha256:await digest(encrypted)});payloads.push(await put(encrypted));}
  try{for(;;){const {done,value}=await reader.read();if(done)break;compressedSize+=value.length;entry.encodedSize+=value.length;if(compressedSize>MAX_LIBRARY_BYTES)throw new Error('The compressed library exceeds 400 MiB. Try again without optional music or extra maps.');let at=0;while(at<value.length){const n=Math.min(GAME_PART_SIZE-used,value.length-at);part.set(value.subarray(at,at+n),used);used+=n;at+=n;if(used===GAME_PART_SIZE){await encrypt(part);used=0;}}}if(used)await encrypt(part.subarray(0,used));}
  catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(rawSize!==file.size)throw new Error('The selected file changed. Select the game folder again.');entry.sha256=hashHex(hash.digest());plan.files.push(entry);
 }
 validateLibraryPlan(plan);return {plan,payloads:sink?await sink.finish(payloads):payloads};
}
async function request(path,method='GET',body,accountId){const binary=body instanceof Blob,headers=body===undefined?{}:{'Content-Type':binary?'application/octet-stream':'application/json'};if(accountId)headers['X-H3-Account']=accountId;const response=await fetch('/api'+path,{method,credentials:'same-origin',cache:'no-store',headers,body:body===undefined?undefined:binary?body:JSON.stringify(body)});let data;try{data=await response.json();}catch{throw new Error('The server response was incomplete. Retry the upload.');}if(!response.ok)throw new Error(data.error||'The upload could not finish.');return data;}
export async function uploadLibrary(files,includeMusic=true,progress=()=>{},accountId){
 const send=(path,method,body)=>request(path,method,body,accountId),selected=files[0]?.path&&files[0]?.file?files:selectGameFiles(files,includeMusic),sink=await spool();let plan,started=false,finished=false;
 try{
  const prepared=await prepareLibrary(selected,progress,sink);plan=prepared.plan;const {payloads}=prepared,state=await send('/game-library/state');
  await send('/game-library/start','POST',{...plan,baseRevision:state.revision});started=true;let next=0,done=0,failed=false;
  async function upload(){for(;;){if(failed)return;const index=next++;if(index>=payloads.length)return;let error;
   for(let attempt=0;attempt<3;attempt++){try{await send(`/game-library/uploads/${plan.version}/parts/${index}`,'PUT',payloads[index]);error=null;break;}catch(e){error=e;}}
   if(error){failed=true;throw error;}done++;progress({message:`Uploading your private library… ${Math.round(100*done/payloads.length)}%`,fraction:.3+.65*done/payloads.length});
  }}
  const results=await Promise.allSettled([upload(),upload()]);for(const result of results)if(result.status==='rejected')throw result.reason;
  const result=await send(`/game-library/uploads/${plan.version}/finish`,'POST');finished=true;progress({message:'Your game files are stored. Opening your library…',fraction:1});return result;
 }finally{if(started&&!finished)await send(`/game-library/uploads/${plan.version}`,'DELETE').catch(()=>{});await sink.cleanup().catch(()=>{});}
}
