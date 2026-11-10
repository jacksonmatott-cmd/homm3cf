// Build a COMPLETE personal upload. Nothing is uploaded or billed by this tool.
// GPL-2.0-or-later
import {readFile,writeFile,readdir,mkdir,rm,mkdtemp,rename,copyFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptLibrary} from './encrypt-library.mjs';
import {derivePassword,proofVerifier,ACCOUNT_ALGORITHM} from '../server/auth.js';
import {buildPagesWorker,readPrivateConfig} from './build-pages-worker.mjs';
import {writeUploadZip,openUploadZip} from './upload-zip.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const clean=p=>p.trim().replace(/^"(.*)"$/,'$1');
async function staticFiles(dir,prefix=''){let out=[];for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name.startsWith('.')||['_worker.js','_routes.json','game-data'].includes(e.name))continue;const name=prefix+e.name;if(e.isDirectory())out.push(...await staticFiles(path.join(dir,e.name),name+'/'));else if(e.isFile())out.push({name,path:path.join(dir,e.name)});}return out;}
export async function preparePagesUpload({gameFolder,account,previousUpload,output=path.join(ROOT,'UPLOAD-TO-CLOUDFLARE.zip'),assetsDirectory=path.join(ROOT,'dist')}){
  const stage=await mkdtemp(path.join(tmpdir(),'h3-pages-upload-'));let previous;
  try{
    let config,gameEntries=[];
    if(previousUpload){previous=await openUploadZip(previousUpload);config=readPrivateConfig((await previous.read('_worker.js')).toString('utf8'));
      for(const f of config.library.files)for(const c of f.chunks){const url=new URL(c.url,'https://local.example/');if(url.origin!=='https://local.example'||!new RegExp('^/game-data/'+config.library.version+'/[a-f0-9-]+\\.bin$').test(url.pathname))throw new Error('Invalid previous game catalog.');const name=url.pathname.slice(1),bytes=await previous.read(name);if(bytes.length!==c.cipherSize)throw new Error('The previous game library is incomplete.');const destination=path.join(stage,name);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);gameEntries.push({name,path:destination});}
      console.log('Reusing the account and encrypted game library from your previous complete upload.');
    }else{if(!account||!gameFolder)throw new Error('Choose your owned game folder and account for the first complete upload.');const library=await encryptLibrary(path.resolve(gameFolder),path.join(stage,'game-data'));config={format:1,account,library:library.manifest,secret:library.secret};for(const f of config.library.files)for(const c of f.chunks){const name=c.url.slice(1);gameEntries.push({name,path:path.join(stage,name)});}}
    const entries=await staticFiles(assetsDirectory);
    entries.push(...gameEntries,{name:'_worker.js',bytes:Buffer.from(await buildPagesWorker(config))},{name:'_routes.json',bytes:Buffer.from(JSON.stringify({version:1,include:['/api/*','/_worker.js','/_worker.js/*','/_worker.js.map'],exclude:[]}))});
    for(const name of ['index.html','app.js','_headers','vcmiclient.js','vcmiclient.wasm','vcmiclient.data','town-pack/manifest.json'])if(!entries.some(e=>e.name===name))throw new Error('The complete package is missing '+name);
    if(entries.length>1000)throw new Error('This game folder has too many extra map/files for the dashboard’s 1000-file upload limit. Use a clean Complete installation with fewer optional maps and try again.');
    const partial=output+'.partial';await rm(partial,{force:true});
    try{await writeUploadZip(partial,entries);const check=await openUploadZip(partial);try{if(check.entries.size!==entries.length||!readPrivateConfig((await check.read('_worker.js')).toString('utf8')))throw new Error('The generated upload could not be verified.');}finally{await check.close();}}catch(error){await rm(partial,{force:true});throw error;}
    if(previous){await previous.close();previous=null;}
    try{await stat(output);await copyFile(output,output.replace(/\.zip$/i,'')+'.previous.zip');}catch(error){if(error.code!=='ENOENT')throw error;}
    await rename(partial,output);
    console.log('Complete upload created: '+output);console.log('Upload THIS generated ZIP to Cloudflare Pages. Bind a free D1 database as DB and redeploy once. No separate account secret, key setup or SQL migration commands are needed.');
    return {output,files:entries.length,libraryVersion:config.library.version};
  }finally{if(previous)await previous.close();await rm(stage,{recursive:true,force:true});}
}
async function prompt(){
  const rl=createInterface({input:process.stdin,output:process.stdout,terminal:!!(process.stdin.isTTY&&process.stdout.isTTY)}),lines=rl[Symbol.asyncIterator]();
  const ask=async text=>{rl.setPrompt(text);rl.prompt();const next=await lines.next();if(next.done)throw new Error('Input closed. Reopen PREPARE-UPLOAD.bat in a terminal.');return next.value;};
  try{console.log('Complete Cloudflare upload builder. Passwords are visible. No Cloudflare login or paid service is used here.');const previousUpload=clean(await ask('Previous prepared UPLOAD-TO-CLOUDFLARE.zip path (Enter for first setup): '));if(previousUpload)return {previousUpload:path.resolve(previousUpload)};
    const gameFolder=clean(await ask('Path to your installed Heroes III Complete folder: '));let username,password;
    while(true){username=(await ask('Choose account username (3–40 letters/numbers/._-): ')).trim();if(/^[a-zA-Z0-9_.-]{3,40}$/.test(username))break;console.log('Please use 3–40 letters, numbers, periods, underscores or hyphens.');}
    while(true){password=await ask('Choose password (14–256 characters, VISIBLE): ');if(password.length<14||password.length>256){console.log('Use 14–256 characters.');continue;}if(password===await ask('Repeat password (VISIBLE): '))break;console.log('Passwords did not match. Try again.');}
    const salt=randomBytes(16).toString('hex'),account={algorithm:ACCOUNT_ALGORITHM,username,salt,hash:proofVerifier(await derivePassword(password,salt)),version:randomUUID()};return {gameFolder,account};
  }finally{rl.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{await preparePagesUpload(await prompt());}catch(error){console.error('Upload preparation stopped: '+error.message);process.exitCode=1;}}
