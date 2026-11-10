import {TOWN_SCOPES,validateTownManifest,townSelection,townsEnabled} from './town-mods.js';
// Install town resources into /opfs/h3/Mods; only small settings enter cloud backups.
const STATE='.three-realms.json';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function directory(root,parts,create=true){let dir=root;for(const part of parts)dir=await dir.getDirectoryHandle(part,{create});return dir;}
async function read(root,path){const parts=path.split('/'),name=parts.pop(),dir=await directory(root,parts,false);return(await(await dir.getFileHandle(name)).getFile());}
async function json(root,path,fallback){try{return JSON.parse(await(await read(root,path)).text());}catch(error){if(error.name==='NotFoundError')return fallback;throw new Error('A local town configuration could not be read. Export saves before resetting site storage.');}}
async function write(root,path,bytes){const parts=path.split('/'),name=parts.pop(),dir=await directory(root,parts),file=await dir.getFileHandle(name,{create:true});let expired=false,timer;
  const opening=file.createSyncAccessHandle();opening.then(h=>{if(expired)h.close();},()=>{});
  const handle=await Promise.race([opening,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Browser storage is busy. Close other game tabs and retry.'));},10000);})]).finally(()=>clearTimeout(timer));
  try{handle.truncate(0);let offset=0;while(offset<bytes.length){const n=handle.write(bytes.subarray(offset),{at:offset});if(n<=0)throw new Error('Browser storage is full.');offset+=n;}handle.flush();}finally{handle.close();}
}
const writeJSON=(root,path,value)=>write(root,path,new TextEncoder().encode(JSON.stringify(value)));
async function settings(root,enabled){const config=await json(root,'user/config/modSettings.json',{});await writeJSON(root,'user/config/modSettings.json',townSelection(config,enabled));}
async function boundedBytes(stream,limit){const reader=stream.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Town download exceeded its expected size.');}parts.push(value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return all;}
async function fetchTimed(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);try{const response=await fetch(url,{credentials:'same-origin',cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error(`Town download failed (${response.status}). Retry with the checkbox enabled.`);const limit=url.endsWith('manifest.json')?3*1024*1024:9*1024*1024;return await boundedBytes(response.body,limit);}finally{clearTimeout(timer);}}
async function install(root){
  if(typeof DecompressionStream==='undefined')throw new Error('This browser needs gzip decompression support to install Three Realms.');
  const manifest=validateTownManifest(JSON.parse(new TextDecoder().decode(await fetchTimed('town-pack/manifest.json'))),location.href);
  const h3=await directory(root,['h3']);let state=await json(h3,STATE,{version:null,chunks:[]});if(state.version!==manifest.version)state={version:manifest.version,chunks:[]};
  // Keep partial installations disabled, including when upgrading an older pack.
  await settings(root,false);let completed=0;
  for(let index=0;index<manifest.chunks.length;index++){
    const chunk=manifest.chunks[index];let present=state.chunks.includes(chunk.sha256);
    if(present)for(const file of chunk.files){try{if((await read(h3,file.path)).size!==file.size){present=false;break;}}catch{present=false;break;}}
    if(!present){const compressed=await fetchTimed(chunk.url);if(compressed.length!==chunk.compressedSize)throw new Error('A town download arrived incomplete.');const raw=await boundedBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),chunk.size);
      if(raw.length!==chunk.size||await sha(raw)!==chunk.sha256)throw new Error('A town download failed its checksum. Retry the download.');
      // Verify the complete chunk before changing any files in it.
      for(const f of chunk.files)if(await sha(raw.subarray(f.offset,f.offset+f.size))!==f.sha256)throw new Error('A town file failed its checksum.');
      for(const f of chunk.files)await write(h3,f.path,raw.subarray(f.offset,f.offset+f.size));
      if(!state.chunks.includes(chunk.sha256))state.chunks.push(chunk.sha256);await writeJSON(h3,STATE,state);
    }
    completed+=chunk.size;postMessage({type:'progress',message:`Preparing Three Realms · ${Math.round(completed/manifest.totalSize*100)}%`});
  }
  const wanted=new Set(manifest.chunks.flatMap(c=>c.files.map(f=>f.path)));
  async function trim(dir,prefix){for await(const[name,handle]of dir.entries()){const p=prefix+name;if(handle.kind==='directory')await trim(handle,p+'/');else if(!wanted.has(p))await dir.removeEntry(name);}}
  for(const scope of TOWN_SCOPES)await trim(await directory(h3,['Mods',scope]),`Mods/${scope}/`);
  await settings(root,true);
  return {version:manifest.version};
}
onmessage=async({data})=>{try{const root=await navigator.storage.getDirectory();let result={};if(data.type==='status')result={enabled:townsEnabled(await json(root,'user/config/modSettings.json',{}))};else if(data.type==='prepare'){if(data.enabled)result=await install(root);else await settings(root,false);}else throw new Error('Unknown town operation.');postMessage({type:'done',...result});}catch(error){postMessage({type:'error',message:error.message||String(error)});}};
