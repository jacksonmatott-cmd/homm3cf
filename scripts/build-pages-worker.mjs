import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildWebWorker(){
  const names=(await readdir(path.join(ROOT,'migrations'))).filter(n=>/^\d.*\.sql$/.test(n)).sort(),schemas=await Promise.all(names.map(n=>readFile(path.join(ROOT,'migrations',n),'utf8')));
  const version=createHash('sha256').update(schemas.join('\n')).digest('hex'),schema=schemas.join('\n')+`\nCREATE TABLE IF NOT EXISTS h3_pages_schema(id INTEGER PRIMARY KEY,version TEXT NOT NULL);INSERT OR REPLACE INTO h3_pages_schema(id,version) VALUES (1,'${version}');`;
  const result=await build({stdin:{contents:`import {createWebWorker} from './server/web-worker.js';export default createWebWorker(${JSON.stringify(schema)},${JSON.stringify(version)});`,resolveDir:ROOT},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',plugins:[{name:'portable',setup(b){b.onResolve({filter:/^\.\/auth\.js$/},()=>({path:path.join(ROOT,'server/auth-pages.js')}));b.onResolve({filter:/^node:buffer$/},()=>({path:path.join(ROOT,'server/buffer-pages.js')}));}}]});
  return result.outputFiles[0].text;
}
export async function buildPagesWorker(config){
  const migrations=(await readdir(path.join(ROOT,'migrations'))).filter(n=>/^\d.*\.sql$/.test(n)).sort();
  const schemas=await Promise.all(migrations.map(n=>readFile(path.join(ROOT,'migrations',n),'utf8')));
  const schemaVersion=createHash('sha256').update(schemas.join('\n')).digest('hex');
  const schema=schemas.join('\n')+`\nCREATE TABLE IF NOT EXISTS h3_pages_schema(id INTEGER PRIMARY KEY,version TEXT NOT NULL);INSERT OR REPLACE INTO h3_pages_schema(id,version) VALUES (1,'${schemaVersion}');`;
  const encoded=Buffer.from(JSON.stringify(config)).toString('base64');
  const result=await build({stdin:{contents:`import {createPagesWorker} from './server/pages-worker.js';const H3_PRIVATE_CONFIG=${JSON.stringify(encoded)};export default createPagesWorker(JSON.parse(atob(H3_PRIVATE_CONFIG)),${JSON.stringify(schema)},${JSON.stringify(schemaVersion)});`,resolveDir:ROOT,sourcefile:'personal-pages-entry.js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:false,legalComments:'inline',plugins:[{name:'portable-pages',setup(b){b.onResolve({filter:/^\.\/auth\.js$/},()=>({path:path.join(ROOT,'server/auth-pages.js')}));b.onResolve({filter:/^node:buffer$/},()=>({path:path.join(ROOT,'server/buffer-pages.js')}));}}]});
  const output=result.outputFiles[0].text;
  if(/(?:from\s*|import\s*)["']node:/.test(output))throw new Error('The Pages backend still needs Node.js compatibility.');
  if(Buffer.byteLength(output)>3*1024*1024)throw new Error('The private game catalog is too large for the Free Worker script limit.');
  if(!output.includes('H3_PRIVATE_CONFIG = '+JSON.stringify(encoded)))throw new Error('Private package metadata could not be verified.');
  return output;
}
export function readPrivateConfig(source){const match=/\bH3_PRIVATE_CONFIG\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(source);if(!match)throw new Error('This ZIP is not a complete personal Cloudflare upload made by PREPARE-UPLOAD.bat.');const config=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));if(config.format!==1||!config.account||!config.secret||!config.library?.files?.length)throw new Error('This upload has no reusable personal game library. Choose your last prepared personal upload ZIP.');return config;}
