// Crown Authority launcher integration. GPL-2.0-or-later
export const CROWN_SCOPE='crown-authority';
export const CROWN_TOWNS=['grove','new-pavilion','cathedral-town'];
export function crownEnabled(config){return (config?.presets?.[config.activePreset]?.mods||[]).includes(CROWN_SCOPE);}
export function crownSelection(input,enabled){
 if(input!==null&&input!==undefined&&(typeof input!=='object'||Array.isArray(input)))throw new Error('Invalid saved mod settings.');
 const config=structuredClone(input||{});
 if(!config.presets||!Object.keys(config.presets).length){const mods=['vcmi'],settings={};for(const [id,entry]of Object.entries(config.activeMods||{})){if(entry.active)mods.push(id);settings[id]=Object.fromEntries(Object.entries(entry.mods||{}).map(([key,v])=>[key,!!v.active]));}config.presets={default:{mods:[...new Set(mods)],settings}};config.activePreset='default';}
 if(!config.presets[config.activePreset])config.activePreset=Object.keys(config.presets)[0];const preset=config.presets[config.activePreset];if(!Array.isArray(preset.mods))throw new Error('Invalid saved mod preset.');
 preset.mods=preset.mods.filter(id=>id!==CROWN_SCOPE&&!id.startsWith(CROWN_SCOPE+'.'));if(enabled)preset.mods.push(CROWN_SCOPE);
 preset.settings||={};preset.settings[CROWN_SCOPE]||={};for(const town of CROWN_TOWNS)preset.settings[CROWN_SCOPE][town]=!!enabled&&preset.mods.includes(town);
 for(const id of Object.keys(config.validatedMods||{}))if(id===CROWN_SCOPE||id.startsWith(CROWN_SCOPE+'.'))delete config.validatedMods[id];return config;
}
export function validCrownPath(p){return typeof p==='string'&&p.length<300&&p.startsWith('Mods/'+CROWN_SCOPE+'/')&&p.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\\\x00-\x1f]/.test(part))&&p.endsWith('.json');}
export function validateCrownManifest(m){
 if(m?.format!==1||m.id!==CROWN_SCOPE||m.engine!=='1.7.5'||!/^[a-f0-9]{64}$/.test(m.version||'')||!Array.isArray(m.files)||!m.files.length||m.files.length>50)throw new Error('Invalid Crown Authority manifest.');
 const paths=new Set();let total=0;for(const f of m.files){if(!validCrownPath(f.path)||paths.has(f.path.toLowerCase())||!Number.isSafeInteger(f.size)||f.size<1||f.size>512*1024||!/^[a-f0-9]{64}$/.test(f.sha256||''))throw new Error('Invalid Crown Authority file.');paths.add(f.path.toLowerCase());total+=f.size;}
 if(total!==m.totalSize||total>2*1024*1024||!paths.has('mods/crown-authority/mod.json'))throw new Error('Incomplete Crown Authority pack.');
 for(const file of ['resource.json','objects.json','core-towns.json'])if(!paths.has('mods/crown-authority/content/config/crown-authority/'+file))throw new Error('Crown Authority needs its complete resource and map-object definitions. Reload the updated website and retry.');
 for(const town of CROWN_TOWNS)if(!paths.has(`mods/crown-authority/mods/${town}/mod.json`))throw new Error('Missing town compatibility mod.');return m;
}
