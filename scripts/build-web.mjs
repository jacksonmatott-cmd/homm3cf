import {buildCrownMod} from './build-crown-mod.mjs';
import {writeFile} from 'node:fs/promises';
import {buildWebWorker} from './build-pages-worker.mjs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({stdin:{contents:"export {sha256} from '@noble/hashes/sha256';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'file-hash-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:fileURLToPath(new URL('../dist/vendor-sha256.js',import.meta.url)),legalComments:'inline'});
await writeFile(new URL('../dist/_worker.js',import.meta.url),await buildWebWorker());
await writeFile(new URL('../dist/_routes.json',import.meta.url),JSON.stringify({version:1,include:['/api/*','/_worker.js','/_worker.js/*','/_worker.js.map'],exclude:[]},null,2)+'\n');
console.log('Built the website account/upload backend.');

await buildCrownMod();
