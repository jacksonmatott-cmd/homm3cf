// Shared browser/server upload limits and path policy. GPL-2.0-or-later
export const GAME_PART_SIZE=128*1024,MAX_LIBRARY_BYTES=400*1024*1024;
export const MAX_GAME_FILES=10000,MAX_GAME_FILE_BYTES=2*1024**3,MAX_GAME_RAW_BYTES=8*1024**3,MAX_GAME_PARTS=MAX_GAME_FILES+Math.ceil(MAX_LIBRARY_BYTES/GAME_PART_SIZE);
export const BINARY_LIBRARY='blob-v1';
export const GAME_FOLDERS={data:'Data',maps:'Maps',mp3:'Mp3',sprites:'Sprites',sounds:'Sounds',config:'config'};
const TYPES={Data:/\.(lod|snd|pac|def|msk|msg|fnt|ttf|bmp|gif|jpg|jpeg|pcx|png|tga|pal|wav|82m|mp3|ogg|json|txt|md)$/i,Maps:/\.(h3m|h3c|tut|vmap|vcmp)$/i,Mp3:/\.(mp3|ogg|wav)$/i,Sprites:/\.(def|msk|msg|bmp|gif|jpg|jpeg|pcx|png|tga|pal|json)$/i,Sounds:/\.(wav|82m|mp3|ogg)$/i,config:/\.(json|txt)$/i};
const HEX=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
export function validGamePath(path){if(typeof path!=='string'||path.length>500||/[\\\x00-\x1f]/.test(path))return false;const pieces=path.split('/');if(pieces.length<2||pieces.length>32||pieces.some(p=>!p||p==='.'||p==='..'||p.includes(':')||/[. ]$/.test(p)))return false;const root=pieces[0].toLowerCase(),folder=Object.hasOwn(GAME_FOLDERS,root)&&GAME_FOLDERS[root];return !!folder&&TYPES[folder].test(pieces.at(-1));}
export function validateLibraryPlan(plan){
 const binary=plan?.storage===BINARY_LIBRARY;
 if((plan?.storage!==undefined&&!binary)||!UUID.test(plan?.version)||typeof plan.key!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(plan.key)||!Array.isArray(plan.files)||!plan.files.length||plan.files.length>MAX_GAME_FILES)throw new Error('Invalid game-library metadata.');
 const names=new Set(),parts=[];let encoded=0,raw=0,budget=4096;const files=[];
 for(const f of plan.files){if(!validGamePath(f.path)||names.has(f.path.toLowerCase())||!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_GAME_FILE_BYTES||f.encoding!=='gzip'||!Number.isSafeInteger(f.encodedSize)||f.encodedSize<1||!HEX.test(f.sha256)||!Array.isArray(f.chunks)||!f.chunks.length)throw new Error('Invalid or duplicate game file.');names.add(f.path.toLowerCase());let size=0;
  const chunks=f.chunks.map(c=>{if(!Number.isSafeInteger(c.size)||c.size<1||c.size>GAME_PART_SIZE||c.cipherSize!==c.size+16||!HEX.test(c.sha256)||typeof c.iv!=='string'||!/^[A-Za-z0-9+/]{16}$/.test(c.iv))throw new Error('Invalid encrypted upload part.');size+=c.size;const index=parts.length;parts.push({index,size:c.cipherSize,sha256:c.sha256});budget+=(binary?c.cipherSize:4*Math.ceil(c.cipherSize/3))+512;return {size:c.size,cipherSize:c.cipherSize,iv:c.iv,url:`/api/game-library/chunks/${plan.version}/${index}`};});
  if(size!==f.encodedSize)throw new Error('Incomplete game file metadata.');encoded+=size;raw+=f.size;const entry={path:f.path,size:f.size,sha256:f.sha256,encoding:'gzip',encodedSize:f.encodedSize,chunks};const metadataSize=new TextEncoder().encode(JSON.stringify(entry)).length;if(metadataSize>1024*1024)throw new Error('A game file has too much chunk metadata.');budget+=metadataSize+512;files.push(entry);
 }
 for(const required of ['data/h3bitmap.lod','data/h3sprite.lod','data/heroes3.snd']){const entry=files.find(f=>f.path.toLowerCase()===required);if(!entry?.size)throw new Error('Missing '+required+'. Select the folder of your installed Complete / Shadow of Death game.');}
 if(encoded>MAX_LIBRARY_BYTES||raw>MAX_GAME_RAW_BYTES||parts.length>MAX_GAME_PARTS)throw new Error('The library exceeds free cloud storage. Try excluding optional music or extra maps; your existing library stays intact.');
 const manifest={version:plan.version,...(binary?{storage:BINARY_LIBRARY}:{}),files};
 return {manifest,parts,budget,compressedSize:encoded,totalCipherSize:parts.reduce((n,p)=>n+p.size,0)};
}
