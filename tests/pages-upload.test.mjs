import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHash,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildPagesWorker,readPrivateConfig} from '../scripts/build-pages-worker.mjs';
import {preparePagesUpload} from '../scripts/prepare-pages-upload.mjs';
import {writeUploadZip,openUploadZip} from '../scripts/upload-zip.mjs';
import {derivePassword,proofVerifier,ACCOUNT_ALGORITHM,tokenHash} from '../server/auth.js';
import * as portable from '../server/auth-pages.js';
import {libraryAAD} from '../dist/library-format.js';
const password='visible-test-only-password-42';
const account={algorithm:ACCOUNT_ALGORITHM,username:'UploadOwner',salt:'ad'.repeat(16),version:randomUUID()};
const proof=await derivePassword(password,account.salt);account.hash=proofVerifier(proof);
const library={version:randomUUID(),files:[{path:'Data/H3bitmap.lod',size:4,sha256:'ab'.repeat(32),chunks:[]}]};
const config={format:1,account,library,secret:{version:library.version,key:randomBytes(32).toString('base64')}};
class Statement{constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}bind(...values){return new Statement(this.db,this.sql,values);}async first(){return this.db.sql.prepare(this.sql).get(...this.values)||null;}async all(){return {results:this.db.sql.prepare(this.sql).all(...this.values)};}async run(){return {meta:{changes:Number(this.db.sql.prepare(this.sql).run(...this.values).changes)}};}}
class DB{constructor(){this.sql=new DatabaseSync(':memory:');this.batches=0;}prepare(sql){return new Statement(this,sql);}async batch(statements){this.batches++;this.sql.exec('BEGIN');try{const result=statements.map(s=>({meta:{changes:Number(this.sql.prepare(s.sql).run(...s.values).changes)}}));this.sql.exec('COMMIT');return result;}catch(e){this.sql.exec('ROLLBACK');throw e;}}}
async function app(configuration=config){const source=await buildPagesWorker(configuration),module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const env={DB:new DB(),ASSETS:{fetch:async()=>new Response('public asset')}};return {source,worker:module.default,env,async request(path,{method='GET',cookie,body}={}){const headers={};if(cookie)headers.Cookie=cookie;if(method!=='GET')headers.Origin='https://heroes.example';if(body!==undefined)headers['Content-Type']='application/json';return module.default.fetch(new Request('https://heroes.example'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);}};}

test('portable Pages hashes and credential verification match the original backend',()=>{
  for(const bytes of ['abc','Ünicode',Buffer.alloc(128*1024,42)])assert.equal(portable.tokenHash(bytes),tokenHash(bytes));
  assert.equal(portable.verifyLogin(account.username,proof,account),true);assert.equal(portable.verifyLogin(account.username,'0'.repeat(64),account),false);assert.equal(portable.proofVerifier(proof),account.hash);
});
test('compiled Pages upload initializes an empty D1 database, keeps secrets private and supports login',async()=>{
  const a=await app();assert.doesNotMatch(a.source,/from ["']node:/);assert.equal(readPrivateConfig(a.source).secret.key,config.secret.key);
  const status=await a.request('/api/status');assert.equal((await status.json()).configured,true);assert.ok(a.env.DB.sql.prepare("SELECT name FROM sqlite_master WHERE name='free_snapshots'").get());const batches=a.env.DB.batches;await a.request('/api/status');assert.equal(a.env.DB.batches,batches);
  assert.equal((await a.request('/api/library')).status,401);assert.equal((await a.request('/_worker.js')).status,404);
  const login=await a.request('/api/login',{method:'POST',body:{username:account.username,proof}});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];const secret=await(await a.request('/api/library',{cookie})).json();assert.equal(secret.key,config.secret.key);assert.equal((await a.request('/api/session',{cookie})).status,200);
  assert.ok(!(await(await a.request('/api/status')).text()).includes(config.secret.key));
});
test('portable upload completes authenticated D1 save transfers using browser-compatible binary decoding',async()=>{
  const a=await app(),login=await a.request('/api/login',{method:'POST',body:{username:account.username,proof}}),cookie=login.headers.get('Set-Cookie').split(';')[0],bytes=randomBytes(57);
  const started=await a.request('/api/saves/start',{method:'POST',cookie,body:{baseRevision:0,size:bytes.length,parts:1,encoding:'identity',sha256:tokenHash(bytes)}});assert.equal(started.status,200);const {id}=await started.json();
  assert.equal((await a.request(`/api/saves/uploads/${id}/parts/0`,{method:'PUT',cookie,body:{data:bytes.toString('base64')}})).status,200);
  assert.equal((await a.request(`/api/saves/uploads/${id}/finish`,{method:'POST',cookie})).status,200);
  const downloaded=await(await a.request(`/api/saves/snapshots/${id}/parts/0`,{cookie})).json();assert.deepEqual(Buffer.from(downloaded.data,'base64'),bytes);
});
test('Pages setup states explain the missing preparation or DB binding without opening registration',async()=>{
  const a=await app();delete a.env.DB;assert.match((await(await a.request('/api/status')).json()).setupMessage,/binding named DB/);assert.equal((await a.request('/api/login',{method:'POST',body:{username:'x',proof}})).status,503);
  const b=await app({format:1,account:null,secret:null,library:{version:null,files:[]}});assert.match((await(await b.request('/api/status')).json()).setupMessage,/PREPARE-UPLOAD/);assert.equal(b.env.DB.batches,0);
});
test('streaming ZIP archives round trip binary data and reject incomplete files and traversal',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'h3-zip-'));t.after(()=>rm(temp,{recursive:true,force:true}));const filename=path.join(temp,'test.zip'),data=randomBytes(255);
  await writeUploadZip(filename,[{name:'folder/data.bin',bytes:data},{name:'index.html',bytes:Buffer.from('hello')}]);const z=await openUploadZip(filename);assert.deepEqual(await z.read('folder/data.bin'),data);await z.close();
  await assert.rejects(writeUploadZip(path.join(temp,'bad.zip'),[{name:'../escape',bytes:data}]),/filename/);
  const bytes=await readFile(filename);await writeFile(path.join(temp,'truncated.zip'),bytes.subarray(0,bytes.length-2));await assert.rejects(openUploadZip(path.join(temp,'truncated.zip')),/incomplete/);
});
test('complete personal uploads include the encrypted owned library, backend and current assets; later releases reuse them',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'h3-complete-upload-'));t.after(()=>rm(temp,{recursive:true,force:true}));const game=path.join(temp,'owned'),assets=path.join(temp,'assets'),output=path.join(temp,'UPLOAD-TO-CLOUDFLARE.zip');await mkdir(path.join(game,'Data'),{recursive:true});await mkdir(path.join(assets,'town-pack'),{recursive:true});
  for(const file of ['H3bitmap.lod','H3sprite.lod','Heroes3.snd'])await writeFile(path.join(game,'Data',file),Buffer.from('LOD\0synthetic-fixture-'+file));
  for(const name of ['index.html','app.js','_headers','vcmiclient.js','vcmiclient.wasm','vcmiclient.data','town-pack/manifest.json'])await writeFile(path.join(assets,name),'version-one');
  await preparePagesUpload({gameFolder:game,account,output,assetsDirectory:assets});let zip=await openUploadZip(output),original=readPrivateConfig((await zip.read('_worker.js')).toString('utf8'));assert.equal(zip.entries.has('_routes.json'),true);assert.equal(zip.entries.has('wrangler.jsonc'),false);
  for(const file of original.library.files){const chunks=[];for(let i=0;i<file.chunks.length;i++){const c=file.chunks[i],encrypted=await zip.read(c.url.slice(1)),decipher=createDecipheriv('aes-256-gcm',Buffer.from(original.secret.key,'base64'),Buffer.from(c.iv,'base64'));decipher.setAAD(libraryAAD(original.library.version,file.path,i,c.size));decipher.setAuthTag(encrypted.subarray(-16));chunks.push(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]));}assert.deepEqual(Buffer.concat(chunks),await readFile(path.join(game,file.path)));}
  const cipherName=original.library.files[0].chunks[0].url.slice(1),cipher=await zip.read(cipherName);for(const name of ['index.html','app.js','_headers'])assert.ok(!(await zip.read(name)).includes(Buffer.from(original.secret.key)));await zip.close();
  await writeFile(path.join(assets,'app.js'),'version-two');await preparePagesUpload({previousUpload:output,output,assetsDirectory:assets});zip=await openUploadZip(output);const updated=readPrivateConfig((await zip.read('_worker.js')).toString('utf8'));assert.deepEqual(updated,original);assert.deepEqual(await zip.read(cipherName),cipher);assert.equal((await zip.read('app.js')).toString(),'version-two');await zip.close();assert.ok((await stat(output.replace('.zip','.previous.zip'))).size>0);
});
