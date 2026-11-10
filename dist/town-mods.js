// Three Realms launcher integration. GPL-2.0-or-later
export const TOWN_SCOPES=['grove','new-pavilion','cathedral-town'];
const hashPattern=/^[a-f0-9]{64}$/;
export function validTownPath(path){return typeof path==='string'&&path.length<400&&path.startsWith('Mods/')&&TOWN_SCOPES.includes(path.split('/')[1])&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[\\\x00-\x1f]/.test(p));}
export function validateTownManifest(m,origin){
  if(m?.format!==1||m.id!=='three-realms'||!hashPattern.test(m.version)||m.engine!=='1.7.5'||JSON.stringify(m.scopes)!==JSON.stringify(TOWN_SCOPES)||!Array.isArray(m.chunks)||!m.chunks.length||m.chunks.length>48)throw new Error('Invalid Three Realms manifest.');
  const paths=new Set();let total=0,compressed=0;
  for(const c of m.chunks){const url=new URL(c.url,origin);if(url.origin!==new URL(origin).origin||!url.pathname.startsWith(`/town-pack/${m.version}/`)||!Number.isSafeInteger(c.size)||c.size<1||c.size>8*1024*1024||!Number.isSafeInteger(c.compressedSize)||c.compressedSize<1||c.compressedSize>9*1024*1024||!hashPattern.test(c.sha256)||!Array.isArray(c.files)||!c.files.length)throw new Error('Invalid Three Realms download chunk.');
    let end=0;for(const f of c.files){const key=f.path.toLowerCase();if(!validTownPath(f.path)||paths.has(key)||!Number.isSafeInteger(f.size)||f.size<0||f.offset!==end||!hashPattern.test(f.sha256))throw new Error('Invalid Three Realms file.');paths.add(key);end+=f.size;}if(end!==c.size)throw new Error('Incomplete Three Realms manifest.');total+=end;compressed+=c.compressedSize;
  }
  if(paths.size>8000||paths.size!==m.fileCount||total>256*1024*1024||total!==m.totalSize||compressed!==m.downloadSize)throw new Error('Three Realms size limit exceeded.');
  for(const scope of TOWN_SCOPES)if(!paths.has(`mods/${scope}/mod.json`))throw new Error('A Three Realms town is missing.');
  return m;
}
export function townSelection(input,enabled){
  if(input!==null&&input!==undefined&&(typeof input!=='object'||Array.isArray(input)))throw new Error('The saved VCMI mod configuration is invalid.');
  const value=structuredClone(input||{});
  if(!value.presets||!Object.keys(value.presets).length){const mods=['vcmi'],settings={};for(const[id,entry]of Object.entries(value.activeMods||{})){if(entry.active)mods.push(id);settings[id]=Object.fromEntries(Object.entries(entry.mods||{}).map(([key,v])=>[key,!!v.active]));}value.presets={default:{mods:[...new Set(mods)],settings}};value.activePreset='default';}
  if(!value.presets[value.activePreset])value.activePreset=Object.keys(value.presets)[0];
  const p=value.presets[value.activePreset];if(!Array.isArray(p.mods))throw new Error('The saved VCMI mod preset is invalid. Export your saves before resetting browser data.');
  p.mods=p.mods.filter(id=>!TOWN_SCOPES.includes(id));if(enabled)p.mods.push(...TOWN_SCOPES);if(!p.mods.includes('vcmi'))p.mods.unshift('vcmi');
  for(const id of Object.keys(value.validatedMods||{}))if(TOWN_SCOPES.some(s=>id===s||id.startsWith(s+'.')))delete value.validatedMods[id];
  return value;
}
export function townsEnabled(config){const mods=config?.presets?.[config.activePreset]?.mods||[];return TOWN_SCOPES.every(s=>mods.includes(s));}
