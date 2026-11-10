// Extract inspectable VCMI mod files from the bundled pack. GPL-2.0-or-later
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTownManifest} from '../dist/town-mods.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function unpackTownPack(output){
  const m=validateTownManifest(JSON.parse(await readFile(path.join(ROOT,'dist/town-pack/manifest.json'),'utf8')),'https://local.example/');
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');let files=0;
  for(const c of m.chunks){const compressed=await readFile(path.join(ROOT,'dist',c.url));if(compressed.length!==c.compressedSize)throw new Error('Incomplete chunk.');const bytes=gunzipSync(compressed,{maxOutputLength:c.size});if(bytes.length!==c.size||hash(bytes)!==c.sha256)throw new Error('Corrupt chunk.');for(const f of c.files){const data=bytes.subarray(f.offset,f.offset+f.size);if(hash(data)!==f.sha256)throw new Error('Corrupt mod file.');const destination=path.join(output,f.path);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,data);files++;}}
  return files;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(!process.argv[2])throw new Error('Usage: node scripts/unpack-town-pack.mjs OUTPUT_FOLDER');console.log(`Extracted ${await unpackTownPack(path.resolve(process.argv[2]))} verified mod files.`);}
