import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash,webcrypto} from 'node:crypto';
import {readFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSON5 from 'json5';
import {TOWN_SCOPES,validateTownManifest,townSelection,townsEnabled} from '../dist/town-mods.js';
import {unpackTownPack} from '../scripts/unpack-town-pack.mjs';
import {memory,addFile,runWorker} from './helpers/storage.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const origin='https://heroes.example/';
const saved=new TextEncoder().encode('progress that must survive a mod install');
async function getFile(root,p){const parts=p.split('/'),name=parts.pop();for(const part of parts)root=await root.getDirectoryHandle(part);return root.getFileHandle(name);}
async function getJSON(root,p){return JSON.parse(await(await(await getFile(root,p)).getFile()).text());}
function fixture(){
  const version=hash('three-realms-test-fixture'),responses=new Map(),chunks=[];
  for(const [i,scopes]of [[0,TOWN_SCOPES.slice(0,2)],[1,TOWN_SCOPES.slice(2)]]){
    let offset=0;const bodies=scopes.map(id=>Buffer.from(JSON.stringify({name:id,version:'1.0.0'}))),raw=Buffer.concat(bodies),compressed=gzipSync(raw);
    const files=scopes.map((id,j)=>{const f={path:`Mods/${id}/mod.json`,offset,size:bodies[j].length,sha256:hash(bodies[j])};offset+=f.size;return f;});
    const c={url:`town-pack/${version}/chunk-${i}.bin`,size:raw.length,compressedSize:compressed.length,sha256:hash(raw),files};chunks.push(c);responses.set(c.url,compressed);
  }
  const manifest={format:1,id:'three-realms',version,engine:'1.7.5',scopes:TOWN_SCOPES,chunks,totalSize:chunks.reduce((n,c)=>n+c.size,0),downloadSize:chunks.reduce((n,c)=>n+c.compressedSize,0),fileCount:3};
  return{manifest,responses};
}
function environment(fixture,fetcher){return {TOWN_SCOPES,validateTownManifest,townSelection,townsEnabled,crypto:webcrypto,DecompressionStream,structuredClone,location:{href:origin},fetch:fetcher||(async url=>new Response(url==='town-pack/manifest.json'?JSON.stringify(fixture.manifest):fixture.responses.get(url)))};}

test('checkbox changes only managed root mods in the active preset and retains other settings',()=>{
  const input={activePreset:'solo',presets:{solo:{mods:['vcmi','other',...TOWN_SCOPES],settings:{other:{feature:true}}},separate:{mods:['vcmi','other']}},validatedMods:{other:123,grove:456},custom:{keep:1}};
  const disabled=townSelection(input,false);assert.deepEqual(disabled.presets.solo.mods,['vcmi','other']);assert.deepEqual(disabled.presets.separate,input.presets.separate);assert.deepEqual(disabled.custom,input.custom);assert.equal(disabled.validatedMods.other,123);assert.ok(!('grove'in disabled.validatedMods));assert.equal(townsEnabled(townSelection(disabled,true)),true);assert.equal(input.presets.solo.mods.length,5);
});
test('old activeMods settings migrate without dropping other enabled mods or submod settings',()=>{
  const config=townSelection({activeMods:{other:{active:true,mods:{feature:{active:false}}}}},true);assert.ok(config.presets.default.mods.includes('other'));assert.equal(config.presets.default.settings.other.feature,false);assert.ok(townsEnabled(config));assert.throws(()=>townSelection([],true),/invalid/);
});
test('town manifest rejects traversal, duplicate files, foreign origins, bad offsets and excess sizes',()=>{
  const {manifest}=fixture();assert.equal(validateTownManifest(manifest,origin),manifest);
  for(const mutate of [m=>{m.chunks[0].files[0].path='Mods/grove/../../user/save';},m=>{m.chunks[0].files[1].path=m.chunks[0].files[0].path;},m=>{m.chunks[0].url='https://foreign.example/town-pack/x';},m=>{m.chunks[0].files[0].offset=1;},m=>{m.chunks[0].size=9*1024*1024;}]){const bad=structuredClone(manifest);mutate(bad);assert.throws(()=>validateTownManifest(bad,origin));}
});
test('town installer writes real mod files, reuses complete chunks, disables without downloading and preserves saves',async()=>{
  const f=fixture(),{root,state}=memory(),requests=[];await addFile(root,'user/data/Saves/test.vcgm',saved);
  const extra=environment(f,async url=>{requests.push(url);return new Response(url==='town-pack/manifest.json'?JSON.stringify(f.manifest):f.responses.get(url));});
  let messages=await runWorker('town-worker.js',{type:'prepare',enabled:true},root,null,extra);assert.equal(messages.at(-1).type,'done',messages.at(-1).message);assert.ok(townsEnabled(await getJSON(root,'user/config/modSettings.json')));
  for(const id of TOWN_SCOPES)assert.equal((await getJSON(root,`h3/Mods/${id}/mod.json`)).name,id);
  messages=await runWorker('town-worker.js',{type:'prepare',enabled:true},root,null,extra);assert.equal(messages.at(-1).type,'done');assert.equal(requests.filter(u=>u.includes('.bin')).length,2);
  const count=requests.length;await runWorker('town-worker.js',{type:'prepare',enabled:false},root,null,extra);assert.equal(requests.length,count);assert.equal(townsEnabled(await getJSON(root,'user/config/modSettings.json')),false);assert.equal(state.open,0);assert.deepEqual(new Uint8Array(await(await(await getFile(root,'user/data/Saves/test.vcgm')).getFile()).arrayBuffer()),saved);
});
test('interrupted pack remains disabled and resumes after the last completed chunk',async()=>{
  const f=fixture(),{root,state}=memory();let interrupted=true,first=0;
  const extra=environment(f,async url=>{if(url==='town-pack/manifest.json')return new Response(JSON.stringify(f.manifest));if(url===f.manifest.chunks[0].url)first++;if(interrupted&&url===f.manifest.chunks[1].url)return new Response('Try later',{status:503});return new Response(f.responses.get(url));});
  let messages=await runWorker('town-worker.js',{type:'prepare',enabled:true},root,null,extra);assert.equal(messages.at(-1).type,'error');assert.equal(townsEnabled(await getJSON(root,'user/config/modSettings.json')),false);assert.equal(state.open,0);
  interrupted=false;messages=await runWorker('town-worker.js',{type:'prepare',enabled:true},root,null,extra);assert.equal(messages.at(-1).type,'done',messages.at(-1).message);assert.equal(first,1);assert.ok(townsEnabled(await getJSON(root,'user/config/modSettings.json')));
});
test('corrupt or oversized decompressed chunks cannot activate towns or overwrite saves',async()=>{
  for(const bomb of [false,true]){const f=fixture(),{root,state}=memory();await addFile(root,'user/data/Saves/test.vcgm',saved);const bad=gzipSync(Buffer.alloc(bomb?1024:f.manifest.chunks[0].size,65));f.responses.set(f.manifest.chunks[0].url,bad);f.manifest.chunks[0].compressedSize=bad.length;f.manifest.downloadSize=f.manifest.chunks.reduce((n,c)=>n+c.compressedSize,0);
    const messages=await runWorker('town-worker.js',{type:'prepare',enabled:true},root,null,environment(f));assert.equal(messages.at(-1).type,'error');assert.equal(townsEnabled(await getJSON(root,'user/config/modSettings.json')),false);assert.equal(state.open,0);assert.deepEqual(new Uint8Array(await(await(await getFile(root,'user/data/Saves/test.vcgm')).getFile()).arrayBuffer()),saved);
  }
});
test('pack contents have three complete factions, nine added heroes, intended costs and loadable JSON registrations',async t=>{
  const output=await mkdtemp(path.join(tmpdir(),'h3-town-pack-'));t.after(()=>rm(output,{recursive:true,force:true}));
  const manifest=JSON.parse(await readFile(new URL('../dist/town-pack/manifest.json',import.meta.url),'utf8'));assert.equal(await unpackTownPack(output),manifest.fileCount);assert.equal(manifest.towns.reduce((n,t)=>n+t.heroes,0),60);assert.equal(manifest.towns.reduce((n,t)=>n+t.creatures,0),43);
  for(const scope of TOWN_SCOPES){
    const dir=path.join(output,'Mods',scope),mod=JSON5.parse(await readFile(path.join(dir,'mod.json'),'utf8'));assert.match(mod.version,/^\d+\.\d+\.\d+$/);const content=path.join(dir,(await readdir(dir)).find(n=>n.toLowerCase()==='content'));let buildings={},roster,custom=0;const actual=new Map();async function index(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await index(p);else actual.set(p.toLowerCase(),p);}}await index(content);
    for(const group of ['factions','heroes','creatures','heroClasses','spells','objects','artifacts','skills'])for(const rel of mod[group]||[]){const file=path.join(content,rel.endsWith('.json')?rel:rel+'.json'),data=JSON5.parse(await readFile(actual.get(file.toLowerCase())||file,'utf8'));if(group==='factions')for(const v of Object.values(data)){Object.assign(buildings,v.town?.buildings||{});roster||=v.town?.creatures;}if(group==='heroes')for(const[id,h]of Object.entries(data))if(id.startsWith('threeRealms')){assert.ok(h.images.large&&h.class&&h.army.length);custom++;}}
    assert.equal(custom,3);assert.equal(roster.length,7);
    if(scope==='grove'){for(let i=1;i<=4;i++)for(const r of ['gems','crystal','sulfur','mercury'])assert.equal(buildings['dwellingLvl'+i].cost[r]||0,0);assert.equal(buildings.resourceSilo.produce.wood,1);assert.equal(buildings.special1.name,'Muster Oak');}
    if(scope==='new-pavilion'){assert.equal(buildings.special3.produce.gold,750);assert.equal(buildings.special1.configuration.rewards[0].heroExperience,2000);}
    if(scope==='cathedral-town'){assert.equal(buildings.special2.produce.gold,1000);assert.equal(buildings.special3.bonuses[0].val,2);assert.ok(buildings.dwellingLvl7.cost.gold>8500);}
  }
});
