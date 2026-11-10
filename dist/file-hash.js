// Incremental hashing keeps large game archives out of JavaScript's heap.
// GPL-2.0-or-later; SHA-256 implementation: @noble/hashes, MIT.
import {sha256} from './vendor-sha256.js';
export const createFileHash=()=>sha256.create();
export const hashHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashFile(file){const hash=createFileHash(),reader=file.stream().getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;hash.update(value);}}finally{reader.releaseLock();}return hashHex(hash.digest());}
