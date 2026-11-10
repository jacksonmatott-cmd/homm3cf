// Deploy from the existing seeded project, preserving its catalog and encrypted assets.
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,runWrangler} from './wrangler-run.mjs';
import {validateTownManifest} from '../dist/town-mods.js';
try{
  const config=JSON.parse(await readFile(path.join(ROOT,'wrangler.jsonc'),'utf8'));
  if(!config.d1_databases?.some(x=>x.binding==='DB'&&/^[a-f0-9-]{36}$/.test(x.database_id)))throw new Error('Extract the update into your existing configured HOMM3 folder, beside its wrangler.jsonc. If initial setup was never completed, run SETUP-FREE.bat first.');
  const catalog=JSON.parse(await readFile(path.join(ROOT,'server/library-manifest.json'),'utf8'));
  if(!/^[a-f0-9-]{36}$/.test(catalog.version)||!catalog.files?.length)throw new Error('Your existing private game catalog is missing here. Use the original project folder that completed the home game upload, or finish SETUP-FREE.bat first.');
  for(const f of catalog.files)for(const chunk of f.chunks){const url=new URL(chunk.url,'https://local.example/');if(url.origin!=='https://local.example'||!new RegExp('^/game-data/'+catalog.version+'/[a-f0-9-]+\\.bin$').test(url.pathname))throw new Error('Invalid existing game catalog.');const info=await stat(path.join(ROOT,'dist',url.pathname));if(info.size!==chunk.cipherSize)throw new Error('An encrypted game chunk is incomplete. Restore your existing project folder before updating.');}
  const pack=validateTownManifest(JSON.parse(await readFile(path.join(ROOT,'dist/town-pack/manifest.json'),'utf8')),'https://local.example/');
  for(const c of pack.chunks)if((await stat(path.join(ROOT,'dist',c.url))).size!==c.compressedSize)throw new Error('The town update was not fully extracted. Extract the entire update and retry.');
  console.log('Deploying the town update with your existing private game catalog. No account reset or game re-encryption is needed.');
  await runWrangler(['deploy']);
  console.log('Update deployed. Refresh your website, sign in, and check Three Realms before entering the game.');
}catch(error){console.error('Town update stopped: '+error.message);process.exitCode=1;}
