// Cross-check mod data against the exact resource-selection/registration contract
// in the distributed, pinned VCMI source. This does not simulate full gameplay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSON5 from 'json5';
const archive=fileURLToPath(new URL('../dist/source/homm3-browser-v0.1.0.tar.gz',import.meta.url));
const source=JSON.parse(execFileSync('python3',['-c',String.raw`
import json,sys,tarfile
paths=['config/resources.json','config/objects/moddables.json','lib/mapObjects/CGResource.cpp','lib/mapObjectConstructors/CObjectClassesHandler.cpp','lib/constants/EntityIdentifiers.h']
with tarfile.open(sys.argv[1]) as t:
 result={}
 for p in paths:
  names=[n for n in t.getnames() if n.endswith('/vcmi/'+p)]
  assert len(names)==1, 'Missing/ambiguous pinned engine source: '+p
  result[p]=t.extractfile(names[0]).read().decode('utf-8')
 print(json.dumps(result))
`,archive],{encoding:'utf8',maxBuffer:2*1024*1024}));
const coreResources=JSON5.parse(source['config/resources.json']),coreObjects=JSON5.parse(source['config/objects/moddables.json']);
const root=new URL('../dist/crown-pack/Mods/crown-authority/',import.meta.url);
const mod=JSON.parse(await readFile(new URL('mod.json',root),'utf8'));
const resourceDefinitions=JSON.parse(await readFile(new URL('Content/'+mod.resources[0],root),'utf8'));
const objectDefinitions=JSON.parse(await readFile(new URL('Content/'+mod.objects[0],root),'utf8'));
// Numeric slots are supplied by the pinned core data/engine, never by our builder.
const pickupSlots=Array(coreObjects.resource.lastReservedIndex+1);
const types={...coreObjects.resource.types,...objectDefinitions['core:resource'].types};
for(const [name,type]of Object.entries(types).sort(([a],[b])=>a.localeCompare(b,'en'))){if(type.index!==undefined)pickupSlots[type.index]={name,...type};else pickupSlots.push({name,...type});}
const resourceSlots=[];for(const [name,r]of Object.entries(coreResources))resourceSlots[r.index]=name;
for(const name of Object.keys(resourceDefinitions).sort())resourceSlots.push('crown-authority:'+name);

test('every resource selectable by the pinned engine has its matching map-object subtype',()=>{
 assert.match(source['lib/constants/EntityIdentifiers.h'],/RESOURCE\s*=\s*79/);
 assert.match(source['lib/mapObjects/CGResource.cpp'],/subID\s*=\s*gameRandomizer\.getDefault\(\)\.nextInt\(EGameResID::WOOD,\s*LIBRARY->resourceTypeHandler->getAllObjects\(\)\.size\(\)\s*-\s*1\)/);
 assert.match(source['lib/mapObjectConstructors/CObjectClassesHandler.cpp'],/objectTypeHandlers\.push_back\(subObject\)/);
 assert.equal(resourceSlots.length,8);assert.equal(resourceSlots[7],'crown-authority:authority');
 for(let id=0;id<resourceSlots.length;id++){assert.ok(pickupSlots[id],`Missing resource map object 79::${id}`);assert.equal(pickupSlots[id].resource,resourceSlots[id],`Wrong resource for map object 79::${id}`);}
});
test('Authority pickup uses original gold artwork, small amounts and normal appended IDs',()=>{
 const pickup=pickupSlots[resourceSlots.indexOf('crown-authority:authority')];
 assert.equal(pickup.index,undefined);assert.equal(resourceDefinitions.authority.index,undefined);
 assert.deepEqual(pickup.amounts,[1,2,3]);assert.equal(pickup.amountMultiplier,1);assert.deepEqual(pickup.rmg,{value:0,rarity:0});
 const template=pickup.templates.royalTreasury;assert.equal(template.animation,coreObjects.resource.types.gold.templates.res.animation);assert.deepEqual(template.mask,coreObjects.resource.base.base.mask);assert.deepEqual(template.visitableFrom,coreObjects.resource.base.base.visitableFrom);
});
test('resource fix leaves all seven original pickups and existing currency identifiers intact',()=>{
 for(const type of Object.values(coreObjects.resource.types)){const {name,...registered}=pickupSlots[type.index];assert.deepEqual(registered,type);}
 assert.deepEqual(Object.keys(objectDefinitions),['core:resource']);assert.deepEqual(Object.keys(objectDefinitions['core:resource'].types),['authority']);assert.equal(mod.version,'1.0.1');
});
