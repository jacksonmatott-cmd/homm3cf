// Check required capabilities before starting account/file operations.
// SPDX-License-Identifier: GPL-2.0-or-later
export function readSetting(key){try{return globalThis.localStorage.getItem(key);}catch{return null;}}
export function missingFeatures(env=globalThis){
 const missing=[];
 if(!env.isSecureContext)missing.push('A secure HTTPS address');
 if(!env.crossOriginIsolated)missing.push('Cross-origin isolation for game threads');
 if(typeof env.SharedArrayBuffer==='undefined')missing.push('WebAssembly shared memory');
 if(!env.HTMLCanvasElement?.prototype?.transferControlToOffscreen)missing.push('OffscreenCanvas');
 if(!env.navigator?.storage?.getDirectory)missing.push('Private browser file storage');
 if(typeof env.Worker!=='function')missing.push('Browser workers');
 if(!env.crypto?.subtle)missing.push('Secure browser encryption');
 if(typeof env.CompressionStream!=='function'||typeof env.DecompressionStream!=='function')missing.push('Gzip compression and decompression');
 if(env.navigator?.cookieEnabled===false)missing.push('First-party cookies for sign-in');
 const simd=new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
 if(!env.WebAssembly?.validate?.(simd))missing.push('WebAssembly SIMD');
 const probe='h3-storage-check-'+Math.random().toString(36).slice(2);
 try{env.localStorage.setItem(probe,'1');if(env.localStorage.getItem(probe)!=='1')throw new Error();env.localStorage.removeItem(probe);}
 catch{missing.push('Browser settings storage (allow this site to save data)');}
 return missing;
}
