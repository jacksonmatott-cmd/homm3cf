// Upload owned game files directly from this browser. GPL-2.0-or-later
import {libraryAAD,bytesToBase64} from './library-format.js';
import {GAME_PART_SIZE,validateLibraryPlan,validGamePath,MAX_LIBRARY_BYTES} from './library-plan.js';
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export function selectGameFiles(files,includeMusic=true){
 const selected=[],names=new Set();
 for(const file of files){const parts=(file.webkitRelativePath||file.name).split('/');if(parts.length<2)continue;const folder=parts.at(-2).toLowerCase(),canonical={data:'Data',maps:'Maps',mp3:'Mp3'}[folder];if(!canonical||(!includeMusic&&canonical==='Mp3'))continue;const path=canonical+'/'+parts.at(-1);if(!validGamePath(path))continue;if(names.has(path.toLowerCase()))throw new Error('The selected folder contains duplicate '+path+'. Select one clean game installation.');names.add(path.toLowerCase());selected.push({path,file});}
 for(const required of ['data/h3bitmap.lod','data/h3sprite.lod','data/heroes3.snd'])if(!names.has(required))throw new Error('Missing '+required+'. Select the installed Heroes III Complete / Shadow of Death folder, containing Data, Maps and Mp3.');
 return selected.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function prepareLibrary(selected,progress=()=>{}){
 if(selected.length>1000||selected.reduce((n,e)=>n+e.file.size,0)>1024**3)throw new Error('Too many files. Select a clean installation with fewer extra maps.');
 const version=crypto.randomUUID(),rawKey=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
 const plan={version,key:bytesToBase64(rawKey),files:[]},payloads=[];let compressedSize=0;
 for(let f=0;f<selected.length;f++){
  const {path,file}=selected[f];if(!file.size||file.size>300*1024*1024)throw new Error('Unsupported file size: '+path);
  progress({message:`Compressing ${path} (${f+1}/${selected.length})…`,fraction:.3*f/selected.length});
  if(/\.lod$/i.test(path)){const magic=new Uint8Array(await file.slice(0,4).arrayBuffer());if(magic[0]!==76||magic[1]!==79||magic[2]!==68||magic[3]!==0)throw new Error(path+' is not a supported original LOD archive.');}
  const sha256=await digest(await file.arrayBuffer()),compressed=await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();compressedSize+=compressed.size;
  if(compressedSize>MAX_LIBRARY_BYTES)throw new Error('The compressed library exceeds 240 MiB. Try again without music or extra maps.');
  const entry={path,size:file.size,sha256,encoding:'gzip',encodedSize:compressed.size,chunks:[]};
  for(let offset=0,index=0;offset<compressed.size;offset+=GAME_PART_SIZE,index++){
   const bytes=await compressed.slice(offset,offset+GAME_PART_SIZE).arrayBuffer(),iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:libraryAAD(version,path,index,bytes.byteLength)},key,bytes));
   entry.chunks.push({size:bytes.byteLength,cipherSize:encrypted.length,iv:bytesToBase64(iv),sha256:await digest(encrypted)});payloads.push(new Blob([encrypted]));
  }
  plan.files.push(entry);
 }
 validateLibraryPlan(plan);return {plan,payloads};
}
async function request(path,method='GET',body,accountId){const headers=body===undefined?{}:{'Content-Type':'application/json'};if(accountId)headers['X-H3-Account']=accountId;const response=await fetch('/api'+path,{method,credentials:'same-origin',cache:'no-store',headers,body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await response.json();}catch{throw new Error('The server response was incomplete. Retry the upload.');}if(!response.ok)throw new Error(data.error||'The upload could not finish.');return data;}
export async function uploadLibrary(files,includeMusic=true,progress=()=>{},accountId){
 const send=(path,method,body)=>request(path,method,body,accountId);
 const selected=files[0]?.path&&files[0]?.file?files:selectGameFiles(files,includeMusic),{plan,payloads}=await prepareLibrary(selected,progress),state=await send('/game-library/state');let started=false,finished=false;
 try{
  await send('/game-library/start','POST',{...plan,baseRevision:state.revision});started=true;let next=0,done=0;
  async function upload(){for(;;){const index=next++;if(index>=payloads.length)return;const data=bytesToBase64(new Uint8Array(await payloads[index].arrayBuffer()));let error;
   for(let attempt=0;attempt<3;attempt++){try{await send(`/game-library/uploads/${plan.version}/parts/${index}`,'PUT',{data});error=null;break;}catch(e){error=e;}}
   if(error)throw error;done++;progress({message:`Uploading your private library… ${Math.round(100*done/payloads.length)}%`,fraction:.3+.65*done/payloads.length});
  }}
  const results=await Promise.allSettled([upload(),upload()]);for(const result of results)if(result.status==='rejected')throw result.reason;
  const result=await send(`/game-library/uploads/${plan.version}/finish`,'POST');finished=true;progress({message:'Your game files are stored. Opening your library…',fraction:1});return result;
 }finally{if(started&&!finished)await send(`/game-library/uploads/${plan.version}`,'DELETE').catch(()=>{});}
}
