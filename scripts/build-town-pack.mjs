// Three Realms adaptations. GPL-2.0-or-later; adapted mod content CC-BY-SA-4.0.
import {readFile,writeFile,readdir,mkdir,rm,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSON5 from 'json5';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async p=>JSON5.parse(await readFile(p,'utf8'));
const writeJSON=async(p,value)=>{await mkdir(path.dirname(p),{recursive:true});await writeFile(p,JSON.stringify(value,null,2)+'\n');};
async function files(dir,prefix=''){let out=[];for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){if(e.name.startsWith('.'))continue;const p=prefix+e.name;if(e.isDirectory())out.push(...await files(path.join(dir,e.name),p+'/'));else if(e.isFile())out.push(p);}return out;}
function buildingCost(cost,role,key){
  if(!cost)return cost;const tier=Number(key.match(/(?:dwellingLvl|dwellingUpLvl)(\d)/)?.[1]||0);
  if(role==='grove')return Object.fromEntries(Object.entries(cost).map(([r,v])=>[r,r==='gold'?Math.ceil(v*(tier<=4?.65:1)/25)*25:['wood','ore'].includes(r)?Math.ceil(v*.6):tier>0&&tier<=4?0:Math.ceil(v*.8)]));
  if(role==='pavilion')return Object.fromEntries(Object.entries(cost).map(([r,v])=>[r,Math.ceil(v*(tier>=3&&tier<=5?.85:1))]));
  return Object.fromEntries(Object.entries(cost).map(([r,v])=>[r,Math.ceil(v*(tier>=6?1.4:tier>0?1.15:1))]));
}
export async function adaptTown(root,town){
  const mod=await readJSON(path.join(root,'mod.json'));
  const contentName=(await readdir(root)).find(x=>x.toLowerCase()==='content');
  const content=path.join(root,contentName),roster=new Set();let faction;
  for(const name of mod.factions||[]){const p=path.join(content,name.endsWith('.json')?name:name+'.json'),data=await readJSON(p),value=data[town.faction];if(!value)continue;
    if(value.town?.creatures){faction=value;for(const tier of value.town.creatures)for(const id of tier)roster.add(id);}
    const buildings=value.town?.buildings;
    if(buildings){for(const [key,b]of Object.entries(buildings))if(b.cost)b.cost=buildingCost(b.cost,town.faction,key);
      if(town.faction==='grove'){
        Object.assign(buildings.special1,{name:'Muster Oak',cost:{gold:700,wood:2},requires:['tavern'],description:'Every visiting hero receives +1 Defense once at this town.'});
        buildings.special1.configuration={visitMode:'hero',rewards:[{message:'The wardens of the Muster Oak teach you to hold the line (+1 Defense).',primary:{defence:1}}]};
        Object.assign(buildings.special2,{name:'Wardens’ Watch',cost:{gold:600,wood:3},description:'Adds +2 Defense to the garrison hero during a siege.'});
        Object.assign(buildings.resourceSilo,{name:'Foragers’ Lodge',cost:{gold:2000,wood:3},produce:{wood:1,ore:1},description:'Produces 1 wood and 1 ore each day.'});
      }else if(town.faction==='pavilion'){
        Object.assign(buildings.special3,{name:'Caravan Exchange',cost:{gold:3500,wood:5,ore:5},produce:{gold:750},description:'Caravans earn your kingdom 750 gold each day.'});
        Object.assign(buildings.special1,{name:'Sunward Academy',cost:{gold:2000,gems:3},description:'Each visiting hero receives 2000 experience once at this town.'});
        buildings.special1.configuration={visitMode:'hero',rewards:[{message:'The Sunward Academy shares its desert chronicles (+2000 experience).',heroExperience:2000}]};
      }else{
        Object.assign(buildings.special1,{name:'Tithe Hall',cost:{gold:2500,wood:10},produce:{gold:350},description:'Earns your kingdom 350 gold each day.'});
        Object.assign(buildings.special2,{name:'Crusader Endowment',cost:{gold:8500,gems:5,sulfur:5},produce:{gold:1000},upgradeReplacesBonuses:true,description:'Replaces Tithe Hall income with 1000 gold per day and adds +2 Luck to the garrison hero during a siege.'});
        Object.assign(buildings.special3,{name:'Vigil Chapel',cost:{gold:2000},bonuses:[{type:'MORALE',val:2}],description:'Adds +2 Morale to troops defending this town.'});
      }
    }
    await writeJSON(p,data);
  }
  const units=[];
  for(const name of mod.creatures||[]){const p=path.join(content,name.endsWith('.json')?name:name+'.json'),data=await readJSON(p);let changed=false;
    for(const[id,c]of Object.entries(data)){if(!roster.has(id)||!c.level)continue;changed=true;
      if(town.faction==='grove'){
        if(c.level<=4){c.cost={gold:Math.max(10,Math.round(c.cost.gold*.75/5)*5)};c.growth+=c.level<=2?4:2;}
        if(c.level>=6){c.hitPoints=Math.round(c.hitPoints*.9);c.cost={...c.cost,gold:Math.round(c.cost.gold*1.1)};}
      }else if(town.faction==='pavilion'&&c.level>=3&&c.level<=5){c.growth+=1;c.hitPoints=Math.round(c.hitPoints*1.08);}
      else if(town.faction==='cathedral'&&c.level>=6){c.cost={...c.cost,gold:Math.round(c.cost.gold*1.35)};c.hitPoints=Math.round(c.hitPoints*1.25);c.attack+=3;c.defense+=2;c.damage.min=Math.round(c.damage.min*1.15);c.damage.max=Math.round(c.damage.max*1.15);}
      // Keep AI valuation aligned with changed health/damage rather than retaining the old score.
      const factor=town.faction==='cathedral'&&c.level>=6?1.25:town.faction==='grove'&&c.level>=6?.9:town.faction==='pavilion'&&c.level>=3&&c.level<=5?1.08:1;
      for(const k of ['aiValue','fightValue'])if(c[k])c[k]=Math.round(c[k]*factor);
      units.push({id,name:c.name.singular,level:c.level,cost:c.cost,growth:c.growth,hitPoints:c.hitPoints,attack:c.attack,defense:c.defense});
    }if(changed)await writeJSON(p,data);
  }
  const added=[];
  for(let i=0;i<3;i++){
    const template=Object.values(await readJSON(path.join(content,mod.heroes[i])))[0],hero=structuredClone(template),id='threeRealms'+town.faction+i;
    hero.texts.name=town.heroes[i];hero.texts.biography=[
      `${town.heroes[i]} guards the small border settlements of the Grove. Resourceful wardens and inexpensive troops let this captain act before richer kingdoms can muster their armies.`,
      `${town.heroes[i]} follows the caravans between distant Pavilion cities. Patient expansion and a steady treasury turn scattered desert settlements into a thriving realm.`,
      `${town.heroes[i]} serves Cathedral through long wars of attrition. Costly sanctuaries and veteran elite troops reward a ruler who can sustain a lengthy campaign.`
    ][['grove','pavilion','cathedral'].indexOf(town.faction)];
    // Portraits/animations/classes and actual working specialties come from this town's heroes.
    const rel=`config/three-realms/heroes/${id}.json`;await writeJSON(path.join(content,rel),{[id]:hero});mod.heroes.push(rel);added.push({id,name:hero.texts.name,class:hero.class,specialty:hero.texts.specialty});
  }
  mod.name=town.name+' — Three Realms';mod.description=`Three Realms adaptation for ${town.role.toLowerCase()}. Original town by ${town.author}. Changed building economies, unit statistics, and added three heroes.`;
  const parts=mod.version.split('.').map(Number);mod.version=[parts[0],parts[1]||0,(parts[2]||0)+1000].join('.');mod.licenseName='Creative Commons Attribution-ShareAlike 4.0';mod.licenseURL='https://creativecommons.org/licenses/by-sa/4.0/';
  await writeJSON(path.join(root,'mod.json'),mod);
  return {id:town.id,name:town.name,role:town.role,heroes:(mod.heroes||[]).length,addedHeroes:added,creatures:units.length,roster:units,source:town.repository,commit:town.commit};
}
export async function buildTownPack(sourceParent){
  const lock=await readJSON(path.join(ROOT,'mods/towns.lock.json')),stage=path.join(ROOT,'.local/three-realms'),all=[];await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
  const summaries=[];
  for(const town of lock.towns){
    const source=path.resolve(sourceParent,town.checkout);if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==town.commit)throw new Error('Wrong upstream revision: '+town.id);
    const dest=path.join(stage,town.id);await cp(path.join(source,town.subdirectory),dest,{recursive:true,filter:p=>!path.relative(path.join(source,town.subdirectory),p).split(path.sep).some(x=>x.startsWith('.'))});
    summaries.push(await adaptTown(dest,town));
    for(const file of await files(dest)){if(/\.(smk|bik|avi|mp4)$/i.test(file))continue;const bytes=await readFile(path.join(dest,file));if(bytes.length>8*1024*1024)throw new Error('Town file too large: '+file);all.push({path:`Mods/${town.id}/${file}`,bytes,sha256:hash(bytes)});}
  }
  const version=hash(Buffer.from(JSON.stringify(all.map(f=>[f.path,f.sha256])))),output=path.join(ROOT,'dist/town-pack',version);await rm(path.dirname(output),{recursive:true,force:true});await mkdir(output,{recursive:true});
  const chunks=[];let batch=[],size=0;
  async function flush(){if(!batch.length)return;const raw=Buffer.concat(batch.map(x=>x.bytes)),compressed=gzipSync(raw,{level:9}),index=chunks.length;const filename=`chunk-${String(index).padStart(3,'0')}.bin`;await writeFile(path.join(output,filename),compressed);let offset=0;const entries=batch.map(f=>{const record={path:f.path,offset,size:f.bytes.length,sha256:f.sha256};offset+=f.bytes.length;return record;});chunks.push({url:`town-pack/${version}/${filename}`,size:raw.length,compressedSize:compressed.length,sha256:hash(raw),files:entries});batch=[];size=0;}
  for(const file of all){if(size+file.bytes.length>8*1024*1024)await flush();batch.push(file);size+=file.bytes.length;}await flush();
  const manifest={format:1,id:'three-realms',version,engine:lock.engine,scopes:lock.towns.map(t=>t.id),totalSize:all.reduce((n,f)=>n+f.bytes.length,0),downloadSize:chunks.reduce((n,c)=>n+c.compressedSize,0),fileCount:all.length,towns:summaries,chunks};
  await writeJSON(path.join(ROOT,'dist/town-pack/manifest.json'),manifest);
  await writeJSON(path.join(ROOT,'mods/content-report.json'),{version,towns:summaries,fileCount:all.length,totalSize:manifest.totalSize,downloadSize:manifest.downloadSize});
  console.log(`Built Three Realms: ${all.length} files, ${(manifest.downloadSize/1024**2).toFixed(1)} MiB download, ${summaries.reduce((n,t)=>n+t.heroes,0)} heroes, ${summaries.reduce((n,t)=>n+t.creatures,0)} recruitable creatures.`);
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildTownPack(path.resolve(process.argv[2]||path.join(ROOT,'../town-work')));
