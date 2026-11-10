// Free Edition: prepare encrypted static files, deploy them, then set the private key.
// SPDX-License-Identifier: GPL-2.0-or-later
import {writeFile,mkdir,rm} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';
import {encryptLibrary} from './encrypt-library.mjs';
import {runWrangler,ROOT} from './wrangler-run.mjs';
try {
  let folder=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
  if(!folder){const rl=createInterface({input:process.stdin,output:process.stdout});folder=await rl.question('Path to your installed Heroes III Complete folder: ');rl.close();}
  folder=folder.trim().replace(/^"(.*)"$/,'$1');
  const output=path.join(ROOT,'dist/game-data');await mkdir(output,{recursive:true});
  console.log('Preparing encrypted game chunks locally for free static hosting…');
  const result=await encryptLibrary(path.resolve(folder),output);
  // Only the generated version is retained; the key stays in memory, never in the project.
  const {readdir}=await import('node:fs/promises');
  for(const name of await readdir(output))if(name!==result.manifest.version)await rm(path.join(output,name),{recursive:true,force:true});
  await writeFile(path.join(ROOT,'server/library-manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
  console.log(`${result.manifest.files.length} game files prepared. Deploying encrypted static assets…`);
  await runWrangler(['deploy']);
  await runWrangler(['secret','put','CATALOG_KEY'],{input:JSON.stringify(result.secret)+'\n'});
  console.log('Encrypted library deployed. Other computers open your website and sign in. No additional storage service is used.');
}catch(error){console.error(error.message);console.error('Your original game files were not changed. Rerun npm run upload-game if preparation or key installation was interrupted.');process.exitCode=1;}
