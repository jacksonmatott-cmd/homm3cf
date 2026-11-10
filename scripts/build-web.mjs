import {buildCrownMod} from './build-crown-mod.mjs';
import {writeFile} from 'node:fs/promises';
import {buildWebWorker} from './build-pages-worker.mjs';
await writeFile(new URL('../dist/_worker.js',import.meta.url),await buildWebWorker());
await writeFile(new URL('../dist/_routes.json',import.meta.url),JSON.stringify({version:1,include:['/api/*','/_worker.js','/_worker.js/*','/_worker.js.map'],exclude:[]},null,2)+'\n');
console.log('Built the website account/upload backend.');

await buildCrownMod();
