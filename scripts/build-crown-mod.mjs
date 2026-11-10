// Crown Authority: native VCMI data mod; no executable or engine patch. GPL-2.0-or-later
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export const CORE_TOWNS=['castle','rampart','tower','inferno','necropolis','dungeon','stronghold','fortress','conflux'];
export function edictReward(edict,rules){
 const reward={message:`{${edict.name}}\n\n${edict.summary}\n\n${edict.cost} Crown Authority spent. This council reconvenes at the start of next week.`,description:`${edict.name} — ${edict.cost} Authority. ${edict.summary}`,limiter:{resources:{[rules.resource]:edict.cost}},resources:{[rules.resource]:-edict.cost,...(edict.resources||{})}};
 for(const key of ['manaPoints'])if(edict[key]!==undefined)reward[key]=edict[key];
 for(const key of ['playerBonuses','bonuses'])if(edict[key])reward[key]=edict[key].map((b,index)=>{const {enemy,...bonus}=b;return {...bonus,duration:'N_DAYS',turns:7,stacking:`crown-authority.${edict.id}.${index}`,description:edict.name,...(enemy?{propagator:'BATTLE_WIDE',propagationUpdater:'BONUS_OWNER_UPDATER',limiters:['OPPOSITE_SIDE']}:{})};});
 return reward;
}
export function townPatch(rules){
 const buildings={};for(const name of ['villageHall','townHall','cityHall','capitol'])buildings[name]={produce:{[rules.resource]:rules.townIncome+(name==='capitol'?rules.capitalExtraIncome:0)}};
 buildings.fort={name:'Fort — Royal Council',description:'Fortifications defend the town. With a visiting hero, click this fort, citadel or castle to convene the Royal Council and spend Crown Authority. One successful decree per town per week.',manualHeroVisit:true,configuration:{visitMode:'once',selectMode:'selectPlayer',canRefuse:true,resetParameters:{period:rules.sessionPeriodDays,visitors:true},onSelectMessage:'{The Royal Council}\n\nChoose an affordable edict or decree. Costs are paid from your kingdom’s Crown Authority. One successful decree per town per week. Hover each choice for its full effect.',onVisitedMessage:'{The Royal Council}\n\nThis town’s council has already issued its decree. It reconvenes at the start of next week, even if the town changes owner.',onEmptyMessage:'{The Royal Council}\n\nNo decree is affordable. Earn +3 Crown Authority per town each new day, plus +5 for each built Capitol. The cheapest decree costs 8.',rewards:rules.edicts.map(e=>edictReward(e,rules))}};
 return {town:{buildings}};
}
async function writeJSON(file,value){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
export async function buildCrownMod(){
 const rules=JSON.parse(await readFile(path.join(ROOT,'mods/crown-authority-rules.json'),'utf8')),output=path.join(ROOT,'dist/crown-pack'),base=path.join(output,'Mods/crown-authority');await rm(output,{recursive:true,force:true});
 await writeJSON(path.join(base,'mod.json'),{name:'Crown Authority',description:'Empire politics for Heroes III: automatic daily Authority income, a Royal Council in every fort, and twelve paid edicts and decrees. Uses your original installed town graphics.',version:rules.version,author:'ArcLink Studios / Jackson Matott',modType:'Mechanics',licenseName:'GPL-2.0-or-later',licenseURL:'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',compatibility:{min:'1.7.5',max:'1.7.99'},resources:['config/crown-authority/resource.json'],factions:['config/crown-authority/core-towns.json']});
 // Supported VCMI image syntax reuses the original gold/royal treasury pieces, without redistributing Ubisoft assets.
 await writeJSON(path.join(base,'Content/config/crown-authority/resource.json'),{authority:{name:'Crown Authority',price:250,images:{small:'SMALRES.def:0:6',medium:'RESOURCE.def:0:6',large:'RESOUR82.def:0:6'}}});
 await writeJSON(path.join(base,'Content/config/crown-authority/core-towns.json'),Object.fromEntries(CORE_TOWNS.map(t=>['core:'+t,townPatch(rules)])));
 const towns=JSON.parse(await readFile(path.join(ROOT,'mods/towns.lock.json'),'utf8'));
 for(const t of towns.towns){const sub=path.join(base,'Mods',t.id);await writeJSON(path.join(sub,'mod.json'),{name:`Crown Authority — ${t.name}`,description:`Royal Council and daily Authority for ${t.name}.`,version:rules.version,author:'ArcLink Studios / Jackson Matott',modType:'Compatibility',depends:['crown-authority',t.id],factions:['config/crown-authority/town.json']});await writeJSON(path.join(sub,'Content/config/crown-authority/town.json'),{[t.id+':'+t.faction]:townPatch(rules)});}
 const files=[];async function walk(dir,prefix=''){for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const name=prefix+e.name;if(e.isDirectory())await walk(path.join(dir,e.name),name+'/');else{const bytes=await readFile(path.join(dir,e.name));files.push({path:name,size:bytes.length,sha256:sha(bytes)});}}}await walk(output);
 const version=sha(Buffer.from(JSON.stringify(files)));await writeJSON(path.join(output,'manifest.json'),{format:1,id:'crown-authority',version,engine:'1.7.5',files,totalSize:files.reduce((n,f)=>n+f.size,0)});
 await writeJSON(path.join(ROOT,'dist/crown-rules.json'),rules);console.log(`Built Crown Authority: ${rules.edicts.length} edicts, 12 towns, ${files.length} files.`);return {rules,files,version};
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildCrownMod();
