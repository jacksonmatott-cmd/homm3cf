// Reproduce the complete deployment from pinned open-source engine/town releases.
// Never download commercial Heroes III data. GPL-2.0-or-later
import {readFile,writeFile,mkdir,stat,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTownPack} from './build-town-pack.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),LOCAL=path.join(ROOT,'.local/upstream');
const hash=b=>createHash('sha256').update(b).digest('hex');
const engine=JSON.parse(await readFile(path.join(ROOT,'dist/ENGINE.json'),'utf8'));
async function exists(p){try{return(await stat(p)).isFile();}catch{return false;}}
let needsEngine=false;for(const f of engine.runtime_files){const p=path.join(ROOT,'dist',f.name);if(!await exists(p)||hash(await readFile(p))!==f.sha256)needsEngine=true;}
const source=path.join(ROOT,'dist/source/homm3-browser-v0.1.0.tar.gz');
if(needsEngine||!await exists(source)){
 await mkdir(LOCAL,{recursive:true});const archive=path.join(LOCAL,'homm3-browser-release.tar.gz');
 if(!await exists(archive)||hash(await readFile(archive))!=='e58d0d64b387ead8c5a379eab4f71840b19c9bda4895c0d5925d80e9d84ffd91'){
  const response=await fetch('https://github.com/mihaicristianfarcas/homm3-browser/releases/download/v0.1.0/homm3-browser.tar.gz');if(!response.ok)throw new Error('Pinned engine release download failed: '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!=='e58d0d64b387ead8c5a379eab4f71840b19c9bda4895c0d5925d80e9d84ffd91')throw new Error('Pinned engine release checksum mismatch.');await writeFile(archive,bytes);
 }
 const destination=path.join(LOCAL,'engine-release');await mkdir(destination,{recursive:true});execFileSync('python3',['-c',`import tarfile,sys\nwith tarfile.open(sys.argv[1]) as t:t.extractall(sys.argv[2],filter='data')`,archive,destination]);
 const base=path.join(destination,'homm3-browser');for(const f of engine.runtime_files){const bytes=await readFile(path.join(base,'dist',f.name));if(hash(bytes)!==f.sha256)throw new Error('Wrong pinned engine file: '+f.name);await writeFile(path.join(ROOT,'dist',f.name),bytes);}
 await mkdir(path.dirname(source),{recursive:true});
 execFileSync('python3',['-c',`import tarfile,sys\nfrom pathlib import Path\nr=Path(sys.argv[1])\nwith tarfile.open(sys.argv[2],'w:gz',compresslevel=9) as t:\n for p in sorted(r.rglob('*')):\n  if p.is_file() and not any(x in p.relative_to(r).parts for x in ['dist','.git','node_modules','build']):t.add(p,arcname='homm3-browser/'+str(p.relative_to(r)),recursive=False)`,base,source]);
 if((await stat(source)).size>25*1024*1024)throw new Error('Engine source archive exceeds the Pages asset limit.');
}
const townManifest=path.join(ROOT,'dist/town-pack/manifest.json');let townsReady=await exists(townManifest);
if(townsReady){const m=JSON.parse(await readFile(townManifest,'utf8'));for(const c of m.chunks){const p=path.join(ROOT,'dist',c.url);if(!await exists(p)||(await stat(p)).size!==c.compressedSize)townsReady=false;}}
if(!townsReady){
 const lock=JSON.parse(await readFile(path.join(ROOT,'mods/towns.lock.json'),'utf8'));await mkdir(LOCAL,{recursive:true});
 for(const town of lock.towns){const dest=path.join(LOCAL,town.checkout);try{execFileSync('git',['-C',dest,'rev-parse','--git-dir'],{stdio:'ignore'});}catch{execFileSync('git',['clone','--filter=blob:none',town.repository,dest],{stdio:'inherit'});}execFileSync('git',['-C',dest,'fetch','--depth=1','origin',town.commit],{stdio:'inherit'});execFileSync('git',['-C',dest,'checkout','--detach',town.commit],{stdio:'inherit'});}
 await buildTownPack(LOCAL);
}
await mkdir(path.join(ROOT,'dist/source'),{recursive:true});await cp(path.join(ROOT,'node_modules/@noble/hashes/LICENSE'),path.join(ROOT,'dist/source/noble-hashes-LICENSE.txt'));
console.log('Complete pinned engine, source and town assets are available.');
