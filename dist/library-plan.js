// Shared browser/server format. GPL-2.0-or-later
export const GAME_PART_SIZE=128*1024,MAX_LIBRARY_BYTES=240*1024*1024;
const HEX=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
export function validGamePath(path){if(typeof path!=='string'||path.length>220||/[\\\x00-\x1f]/.test(path)||path.includes('/..'))return false;return /^(Data\/[^/]+\.(lod|snd|pac)|Maps\/[^/]+\.(h3m|h3c|tut)|Mp3\/[^/]+\.mp3)$/i.test(path);}
export function validateLibraryPlan(plan){
 if(!UUID.test(plan?.version)||typeof plan.key!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(plan.key)||!Array.isArray(plan.files)||!plan.files.length||plan.files.length>1000)throw new Error('Invalid game-library metadata.');
 const names=new Set(),parts=[];let encoded=0,raw=0,budget=4096;const files=[];
 for(const f of plan.files){if(!validGamePath(f.path)||names.has(f.path.toLowerCase())||!Number.isSafeInteger(f.size)||f.size<1||f.size>300*1024*1024||f.encoding!=='gzip'||!Number.isSafeInteger(f.encodedSize)||f.encodedSize<1||!HEX.test(f.sha256)||!Array.isArray(f.chunks)||!f.chunks.length)throw new Error('Invalid or duplicate game file.');names.add(f.path.toLowerCase());let size=0;
  const chunks=f.chunks.map(c=>{if(!Number.isSafeInteger(c.size)||c.size<1||c.size>GAME_PART_SIZE||c.cipherSize!==c.size+16||!HEX.test(c.sha256)||typeof c.iv!=='string'||!/^[A-Za-z0-9+/]{16}$/.test(c.iv))throw new Error('Invalid encrypted upload part.');size+=c.size;const index=parts.length;parts.push({index,size:c.cipherSize,sha256:c.sha256});budget+=4*Math.ceil(c.cipherSize/3)+512;return {size:c.size,cipherSize:c.cipherSize,iv:c.iv,url:`/api/game-library/chunks/${plan.version}/${index}`};});
  if(size!==f.encodedSize)throw new Error('Incomplete game file metadata.');encoded+=size;raw+=f.size;files.push({path:f.path,size:f.size,sha256:f.sha256,encoding:'gzip',encodedSize:f.encodedSize,chunks});
 }
 for(const required of ['data/h3bitmap.lod','data/h3sprite.lod','data/heroes3.snd'])if(!names.has(required))throw new Error('Missing '+required+'. Select the folder of your installed Complete / Shadow of Death game.');
 if(encoded>MAX_LIBRARY_BYTES||raw>1024*1024*1024||parts.length>3000)throw new Error('The library exceeds the free upload limit. Try without optional music or extra maps.');
 const manifest={version:plan.version,files};budget+=new TextEncoder().encode(JSON.stringify(manifest)).length;
 return {manifest,parts,budget,compressedSize:encoded,totalCipherSize:parts.reduce((n,p)=>n+p.size,0)};
}
