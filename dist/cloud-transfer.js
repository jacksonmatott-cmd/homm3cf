// Multipart D1 sync; each request is deliberately small. GPL-2.0-or-later
import {apiJSON,api} from './cloud-sync.js';
import {bytesToBase64,base64ToBytes} from './library-format.js';
const LIMIT=32*1024*1024,PART=128*1024,RAW_LIMIT=192*1024*1024,PENDING='h3-free-pending-upload';
async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function collect(stream,limit){const reader=stream.getReader(),chunks=[];let total=0;try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('The cloud backup exceeds the local restore limit. Your device copy was kept.');}chunks.push(value);}}finally{reader.releaseLock();}const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;}
export async function uploadCloud(bytes,baseRevision,onProgress=()=>{}) {
  let pending;try{pending=sessionStorage.getItem(PENDING);}catch{}
  if(pending){try{await api('/saves/uploads/'+pending,{method:'DELETE'});}catch{}try{sessionStorage.removeItem(PENDING);}catch{}}
  let encoding='identity',payload=bytes;
  if(typeof CompressionStream!=='undefined'){payload=await collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),LIMIT);encoding='gzip';}
  if(payload.length>LIMIT)throw new Error('This cloud backup exceeds 32 MiB. Export a local backup instead.');
  const start=await apiJSON('/saves/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision,size:payload.length,parts:Math.ceil(payload.length/PART),encoding,sha256:await sha256(payload)})});
  try{sessionStorage.setItem(PENDING,start.id);}catch{}
  try {
    const parts=Math.ceil(payload.length/PART);let index=0,done=0,failure=null;
    async function next(){while(index<parts&&!failure){const part=index++,chunk=payload.subarray(part*PART,Math.min(payload.length,(part+1)*PART));try{await apiJSON(`/saves/uploads/${start.id}/parts/${part}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:bytesToBase64(chunk)})});onProgress(`Uploading saves: ${++done} of ${parts} parts…`);}catch(error){failure=error;throw error;}}}
    // Finish all in-flight requests before either committing or cancelling the upload.
    const results=await Promise.allSettled([next(),next()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    const result=await apiJSON(`/saves/uploads/${start.id}/finish`,{method:'POST'});
    try{sessionStorage.removeItem(PENDING);}catch{}
    return result;
  }catch(error){try{await api('/saves/uploads/'+start.id,{method:'DELETE'});sessionStorage.removeItem(PENDING);}catch{}throw error;}
}
export async function downloadCloud(snapshotId,onProgress=()=>{}) {
  const meta=await apiJSON(snapshotId?'/saves/snapshots/'+snapshotId:'/saves/current');
  if(!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>LIMIT||meta.partSize!==PART||meta.parts!==Math.ceil(meta.size/PART)||!['identity','gzip'].includes(meta.encoding)||!/^[a-f0-9-]{36}$/.test(meta.id))throw new Error('The cloud backup metadata is invalid. Your device copy was kept.');
  const chunks=new Array(meta.parts);let index=0,done=0,failure=null;
  async function next(){while(index<meta.parts){const part=index++,result=await apiJSON(`/saves/snapshots/${meta.id}/parts/${part}`),bytes=base64ToBytes(result.data);if(bytes.length!==Math.min(PART,meta.size-part*PART)||await sha256(bytes)!==result.sha256)throw new Error('A cloud backup part failed its checksum. Your device copy was kept.');chunks[part]=bytes;onProgress(`Downloading saves: ${++done} of ${meta.parts} parts…`);}}
  const results=await Promise.allSettled([next(),next()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  const payload=new Uint8Array(meta.size);let offset=0;for(const chunk of chunks){payload.set(chunk,offset);offset+=chunk.length;}
  if(await sha256(payload)!==meta.sha256)throw new Error('The cloud backup checksum did not match. Your device copy was kept.');
  const bytes=meta.encoding==='gzip'?await collect(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')),RAW_LIMIT):payload;
  return {bytes,revision:meta.revision};
}
