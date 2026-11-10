import {libraryAAD,base64ToBytes} from './library-format.js';
// Browser storage/download worker. GPL-2.0-or-later
const ALLOWED=/^(Data|Maps|Mp3)\/[^/\\\x00-\x1f]+$/;
const STATE='.cloud-files.json';
async function dirFor(root,parts) {let dir=root;for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});return dir;}
async function openWriter(file) {
  let timedOut=false,timer;
  const opening=file.createSyncAccessHandle();opening.then(handle=>{if(timedOut)handle.close();},()=>{});
  return Promise.race([opening,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('Browser storage is busy. Close other game tabs and retry.'));},10000);})]).finally(()=>clearTimeout(timer));
}
async function writeFile(root,dest,stream,onBytes=()=>{},maxSize=Infinity) {
  const parts=dest.split('/'),name=parts.pop(),dir=await dirFor(root,parts);
  const file=await dir.getFileHandle(name,{create:true}),handle=await openWriter(file);
  let offset=0;
  try {
    handle.truncate(0);const reader=stream.getReader();
    try {for(;;){const {done,value}=await reader.read();if(done)break;if(offset+value.length>maxSize){await reader.cancel();throw new Error('A game file exceeds its declared size.');}let consumed=0;while(consumed<value.length){const written=handle.write(value.subarray(consumed),{at:offset});if(written<=0)throw new Error('Browser storage is full.');offset+=written;consumed+=written;onBytes(written);}}}
    finally {reader.releaseLock();}
    handle.flush();
  }finally{handle.close();}
  return {size:offset,file};
}
async function importFiles(files) {
  const root=await dirFor(await navigator.storage.getDirectory(),['h3']);
  const total=files.reduce((n,e)=>n+e.file.size,0);let copied=0;
  for(let index=0;index<files.length;index++) {
    const {dest,file}=files[index];if(!ALLOWED.test(dest)||dest.includes('/..'))throw new Error('Invalid game filename.');
    const result=await writeFile(root,dest,file.stream(),bytes=>{copied+=bytes;postMessage({type:'progress',copied,total,file:dest,index,count:files.length});});
    if(result.size!==file.size)throw new Error(`Incomplete copy: ${dest}.`);
  }
  postMessage({type:'progress',copied:total,total,file:''});
}
async function downloadFiles(files,keyText,version,accountId) {
  if(!/^[a-f0-9-]{36}$/.test(version))throw new Error('Invalid encrypted library version.');
  const key=await crypto.subtle.importKey('raw',base64ToBytes(keyText),{name:'AES-GCM'},false,['decrypt']);
  for(const entry of files) {
    if(!ALLOWED.test(entry.path)||entry.path.includes('/..')||!Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>300*1024*1024||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('The server game manifest is invalid.');
    if(entry.encoding!==undefined&&entry.encoding!=='gzip')throw new Error('Unsupported game file encoding.');
    const encodedSize=entry.encoding==='gzip'?entry.encodedSize:entry.size;
    if(!Number.isSafeInteger(encodedSize)||encodedSize<1||encodedSize>300*1024*1024||!Array.isArray(entry.chunks)||!entry.chunks.length||entry.chunks.reduce((n,c)=>n+c.size,0)!==encodedSize)throw new Error('The encrypted library manifest is invalid.');
    for(const chunk of entry.chunks){const url=new URL(chunk.url,location.href);if(url.origin!==location.origin||(!url.pathname.startsWith('/game-data/'+version+'/')&&!url.pathname.startsWith('/api/game-library/chunks/'+version+'/'))||!Number.isInteger(chunk.size)||chunk.size<1||chunk.size>8*1024*1024||chunk.cipherSize!==chunk.size+16||base64ToBytes(chunk.iv).length!==12)throw new Error('Invalid encrypted game chunk.');}
  }
  const root=await dirFor(await navigator.storage.getDirectory(),['h3']);
  let state={};try{state=JSON.parse(await(await(await root.getFileHandle(STATE)).getFile()).text());}catch{}
  let copied=0,lastReport=0;
  const total=files.reduce((n,file)=>n+file.size,0),queue=[];
  for(const file of files) {
    let present=false;
    if(state[file.path]?.sha256===file.sha256&&state[file.path]?.size===file.size){try{const parts=file.path.split('/');const dir=await root.getDirectoryHandle(parts[0]);present=(await(await dir.getFileHandle(parts[1])).getFile()).size===file.size;}catch{}}
    if(present)copied+=file.size;else queue.push(file);
  }
  const report=(file='')=>{postMessage({type:'progress',copied,total,file});lastReport=performance.now();};report();
  let writes=Promise.resolve(),failure=null;const controllers=new Set();
  async function next() {
    while(queue.length&&!failure) {
      const entry=queue.shift(),controller=new AbortController();controllers.add(controller);let timer;
      const keepAlive=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),30000);};keepAlive();
      try {
        // A failed replacement must not leave the old checksum claiming this path is intact.
        if(Object.hasOwn(state,entry.path)){delete state[entry.path];writes=writes.then(()=>writeFile(root,STATE,new Blob([JSON.stringify(state)]).stream()));await writes;}
        let part=0;
        const stream=new ReadableStream({async pull(output){
          if(part>=entry.chunks.length){output.close();return;}
          const index=part++,chunk=entry.chunks[index];
          try{
            const response=await fetch(chunk.url,{credentials:'same-origin',headers:accountId?{'X-H3-Account':accountId}:{},cache:chunk.url.startsWith('/api/')?'no-store':'force-cache',signal:controller.signal});
            if(!response.ok)throw new Error(`Game chunk could not load (${response.status}). Retry the library download.`);
            const encrypted=await response.arrayBuffer();if(encrypted.byteLength!==chunk.cipherSize)throw new Error('An encrypted game chunk arrived incomplete.');
            const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(chunk.iv),additionalData:libraryAAD(version,entry.path,index,chunk.size)},key,encrypted);
            if(plain.byteLength!==chunk.size)throw new Error('An encrypted game chunk has an invalid size.');
            output.enqueue(new Uint8Array(plain));
          }catch(error){output.error(new Error(error.name==='OperationError'?'A game chunk failed authentication. Retry the library setup/download.':error.message));}
        }});
        const decoded=entry.encoding==='gzip'?stream.pipeThrough(new DecompressionStream('gzip')):stream;
        const result=await writeFile(root,entry.path,decoded,bytes=>{copied+=bytes;keepAlive();if(performance.now()-lastReport>120)report(entry.path);},entry.size);
        if(result.size!==entry.size)throw new Error(`Incomplete download of ${entry.path}. Retry to finish your library.`);
        const bytes=new Uint8Array(await(await result.file.getFile()).arrayBuffer());
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
        const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==entry.sha256)throw new Error(`The checksum of ${entry.path} did not match. Retry the download.`);
        state[entry.path]={size:entry.size,sha256:entry.sha256};
        writes=writes.then(()=>writeFile(root,STATE,new Blob([JSON.stringify(state)]).stream()));await writes;
      } catch(error){if(!failure){failure=error;for(const pending of controllers)pending.abort();}}
      finally{clearTimeout(timer);controllers.delete(controller);}
    }
  }
  await Promise.allSettled([next(),next()]);await writes;
  if(failure)throw failure;
  // Discard obsolete cached game assets only after the whole replacement library is intact.
  const wanted=new Set(files.map(file=>file.path.toLowerCase()));
  for(const name of ['Data','Maps','Mp3']) {
    let dir;try{dir=await root.getDirectoryHandle(name);}catch{continue;}
    for await(const [filename,handle]of dir.entries())if(handle.kind==='file'&&!wanted.has(`${name}/${filename}`.toLowerCase()))await dir.removeEntry(filename);
  }
  copied=total;report();
}
onmessage=async({data})=>{
  try {
    if(data.type==='import')await importFiles(data.files);
    else if(data.type==='download')await downloadFiles(data.files,data.key,data.version,data.accountId);
    else if(data.type==='clear') {const root=await navigator.storage.getDirectory();try{await root.removeEntry('h3',{recursive:true});}catch(error){if(error.name!=='NotFoundError')throw error;}}
    else throw new Error('Unknown import operation.');
    postMessage({type:'done'});
  }catch(error){postMessage({type:'error',message:error?.message||String(error)});}
};
