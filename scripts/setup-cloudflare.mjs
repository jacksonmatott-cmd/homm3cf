// One-time setup on the computer containing your owned game. GPL-2.0-or-later
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';
import {ROOT,runWrangler,runNode} from './wrangler-run.mjs';
try {
  console.log('This sets up your Cloudflare Workers Free site, free D1 account/save database, encrypted static game library and private account. Keep your Cloudflare account on Workers Free; this setup never upgrades a plan.');
  const configPath=path.join(ROOT,'wrangler.jsonc');
  const config=JSON.parse(await readFile(configPath,'utf8'));
  const existing=/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id);
  const rl=createInterface({input:process.stdin,output:process.stdout});
  if(!existing){const name=(await rl.question(`Cloudflare project name [${config.name}]: `)).trim()||config.name;if(!/^[a-z0-9][a-z0-9-]{1,38}$/.test(name))throw new Error('Use 2–39 lowercase letters, digits and hyphens.');config.name=name;config.d1_databases[0].database_name=name+'-accounts';}
  const folder=(await rl.question('Path to your own installed Heroes III Complete folder: ')).trim().replace(/^"(.*)"$/,'$1');rl.close();
  // Fail before creating any resources if the game folder is incompatible.
  const {prepareLibrary}=await import('./library-files.mjs');await prepareLibrary(folder);
  await runWrangler(['login']);
  if(!existing) {
    const result=await runWrangler(['d1','create',config.d1_databases[0].database_name],{capture:true});
    console.log(result.output);
    const match=/(?:database_id["']?\s*[:=]\s*["'])([a-f0-9-]{36})/i.exec(result.output);
    if(!match)throw new Error('Cloudflare created the database, but its ID could not be read. Copy the shown database_id into wrangler.jsonc, then rerun setup. Do not create a duplicate database.');
    config.d1_databases[0].database_id=match[1];await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
  }
  await runWrangler(['d1','migrations','apply','DB','--remote']);
  await runNode('upload-game.mjs',[folder]);
  await runNode('set-account.mjs');
  console.log('Setup complete. Open the HTTPS workers.dev URL printed above. Other computers just open that address and sign in.');
}catch(error){console.error(error.message);process.exitCode=1;}
