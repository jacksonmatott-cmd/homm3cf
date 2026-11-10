// Exercise the delivered launcher in Chromium with real workers, OPFS and D1.
// Synthetic game files and an engine entry-point fixture keep commercial data out of CI.
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {readFile,mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildWebWorker} from './build-pages-worker.mjs';
import {parseBackup} from '../dist/backup-format.js';
const ROOT=fileURLToPath(new URL('..',import.meta.url)),DIST=path.join(ROOT,'dist');
const temporary=await mkdtemp(path.join(tmpdir(),'h3-browser-check-'));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'};
let browser,server,mf,base;const errors=[],interrupted=new Set();
async function screen(page,name){await page.waitForFunction(name=>document.getElementById('screen-'+name)?.hidden===false,name);}
async function idle(page){await page.waitForFunction(()=>!document.getElementById('login').disabled);}
async function ready(page){await screen(page,'launcher');await page.waitForFunction(()=>!document.getElementById('play').disabled);}
async function contextPage(init){const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true});if(init)await context.addInitScript(init);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));return {context,page};}
async function signup(page,username){await page.locator('#open-signup').click();await page.locator('#new-username').fill(username);await page.locator('#new-password').fill('Browser-Test-Password-123');await page.locator('#confirm-password').fill('Browser-Test-Password-123');await page.locator('#register').click();}
async function login(page,username){await screen(page,'login');await idle(page);await page.locator('#username').fill(username);await page.locator('#password').fill('Browser-Test-Password-123');await page.locator('#login').click();}
async function readOPFS(page,file){return page.evaluate(async file=>{let dir=await navigator.storage.getDirectory();const parts=file.split('/'),name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);return Array.from(new Uint8Array(await(await(await dir.getFileHandle(name)).getFile()).arrayBuffer()));},file);}
const saveBytes=[9,8,7,0,255,42];
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',path.join(temporary,'key.pem'),'-out',path.join(temporary,'cert.pem')],{stdio:'ignore'});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await buildWebWorker(),compatibilityDate:'2026-10-28',d1Databases:['DB']}));
 server=createServer({key:await readFile(path.join(temporary,'key.pem')),cert:await readFile(path.join(temporary,'cert.pem'))},async(req,res)=>{
  try{
   const url=new URL(req.url,base);
   if(url.pathname.startsWith('/api/')){
    const parts=[];for await(const part of req)parts.push(part);
    const response=await mf.dispatchFetch(url.href,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(parts)});
    const bytes=Buffer.from(await response.arrayBuffer()),phase=url.pathname.startsWith('/api/game-library/')?(url.pathname.endsWith('/start')?'start':url.pathname.endsWith('/files')?'metadata':url.pathname.endsWith('/parts/0')?'part':url.pathname.endsWith('/finish')?'finish':null):null;if(phase&&response.ok&&!interrupted.has(phase)){interrupted.add(phase);res.writeHead(500,{'Content-Type':'text/html'});res.end('<html><h1>Error 1102</h1></html>');return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);return;
   }
   const filename=path.resolve(DIST,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
   if(!filename.startsWith(DIST+path.sep)||/^\/_worker\.js/.test(url.pathname)){res.writeHead(404);res.end();return;}
   const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'});res.end(bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Test server could not serve this request.');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='https://localhost:'+server.address().port;
 let executablePath;for(const candidate of [process.env.H3_CHROMIUM,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean)){try{await access(candidate);executablePath=candidate;break;}catch{}}
 if(!executablePath)throw new Error('Install Chromium for developer browser checks, or set H3_CHROMIUM to its executable.');
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const first=await contextPage(),page=first.page;await page.goto(base);await screen(page,'login');await idle(page);
 await page.evaluate(()=>{for(const type of ['keydown','keyup','keypress'])for(const event of [new Event(type,{cancelable:true}),new KeyboardEvent(type,{key:'',cancelable:true})])window.dispatchEvent(event);});
 assert.deepEqual(errors,[]);console.log('PASS: empty keyboard events on the sign-in screen.');
 await signup(page,'BrowserOne');await screen(page,'library');await idle(page);
 const gameFolder=path.join(temporary,'HeroesIII'),contents={'Data/H3bitmap.lod':Buffer.from('LOD\0bitmap-fixture'),'Data/H3sprite.lod':Buffer.from('LOD\0sprite-fixture'),'Data/Heroes3.snd':Buffer.from('sound-fixture'),'Maps/Nested/Test.h3m':Buffer.from('map-fixture'),'Sounds/Effects/click.wav':Buffer.from('wav-fixture'),'config/empty.txt':Buffer.alloc(0),'Heroes3.exe':Buffer.from('ignored'),'Video/intro.smk':Buffer.from('ignored')};
 for(let i=0;i<40;i++)contents[`Maps/Nested/extra-${i}.h3m`]=Buffer.from('map fixture '+i);
 for(const [name,bytes]of Object.entries(contents)){const filename=path.join(gameFolder,name);await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,bytes);}
 await page.locator('#game-folder').setInputFiles(gameFolder);assert.match(await page.locator('#upload-selection').textContent(),/46 supported game files/);await page.locator('#upload-library').click();await ready(page);assert.match(await page.locator('#data-status').textContent(),/41 map\/campaign/);assert.deepEqual(await readOPFS(page,'h3/Maps/Nested/Test.h3m'),Array.from(contents['Maps/Nested/Test.h3m']));
 assert.equal(interrupted.size,4);console.log('PASS: registration, batched file lists, real binary upload/download and recovery from four lost server replies.');
 await first.context.route('**/vcmiclient.js',route=>route.fulfill({contentType:'application/javascript',body:"window.createVcmiModule=async module=>{module.onVcmiEvent('running');for(const type of ['keydown','keyup','keypress'])window.dispatchEvent(new Event(type));return module;};"}));
 await page.locator('#crown-authority').check();await page.locator('#play').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden);
 const keys=await page.evaluate(()=>{const result={};for(const [name,options]of Object.entries({unknown:{},left:{key:'ArrowLeft'},letter:{key:'a'},refresh:{key:'r',ctrlKey:true},fullscreen:{key:'F11'},legacy:{code:'KeyW',ctrlKey:true}})){const event=new KeyboardEvent('keydown',{...options,cancelable:true});window.dispatchEvent(event);result[name]=event.defaultPrevented;}return result;});
 assert.deepEqual(keys,{unknown:false,left:true,letter:false,refresh:false,fullscreen:false,legacy:false});assert.deepEqual(errors,[]);
 await page.evaluate(async bytes=>{let dir=await navigator.storage.getDirectory();dir=await dir.getDirectoryHandle('user',{create:true});dir=await dir.getDirectoryHandle('Saves',{create:true});const handle=await dir.getFileHandle('browser.vsgm1',{create:true}),writer=await handle.createWritable();await writer.write(new Uint8Array(bytes));await writer.close();},saveBytes);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#return-to-launcher').click();await ready(page);assert.match(await page.locator('#cloud-status').textContent(),/revision 1/);
 console.log('PASS: Crown installer, launch entry point, in-game keyboard policy, return and cloud sync.');
 const second=await contextPage();await second.page.goto(base);await login(second.page,'BrowserOne');await ready(second.page);assert.deepEqual(await readOPFS(second.page,'user/Saves/browser.vsgm1'),saveBytes);assert.deepEqual(await readOPFS(second.page,'h3/Data/H3bitmap.lod'),Array.from(contents['Data/H3bitmap.lod']));assert.equal(await second.page.locator('#crown-authority').isChecked(),true);
 await second.page.locator('#cloud-history').click();await second.page.waitForFunction(()=>!document.getElementById('cloud-history').disabled);assert.match(await second.page.locator('#history-list').textContent(),/Revision 1/);
 const downloadPromise=second.page.waitForEvent('download');await second.page.locator('#backup').click();const backup=await downloadPromise,entries=await parseBackup(new Uint8Array(await readFile(await backup.path())));assert.deepEqual(Array.from(entries.find(e=>e.path==='Saves/browser.vsgm1').bytes),saveBytes);assert.equal(entries.some(e=>e.path.startsWith('Data/')),false);
 console.log('PASS: a separate computer signs in, restores game files and saves, and exports a valid backup.');
 await page.locator('#manage-library').click();await page.evaluate(()=>{void navigator.locks.request('homm3-game',()=>new Promise(resolve=>{window.releaseTestLock=resolve;}));});await page.waitForFunction(()=>typeof window.releaseTestLock==='function');page.once('dialog',dialog=>dialog.accept());await page.locator('#remove-library').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('other Heroes III game tab'));assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/library');return(await r.json()).files.length;}),46);await page.evaluate(()=>window.releaseTestLock());await idle(page);await page.locator('#library-back').click();await ready(page);
 await first.context.route('**/save-worker.js',route=>route.abort('failed'));await page.locator('#sync-cloud').click();await page.waitForFunction(()=>!document.getElementById('retry-connection').hidden);assert.match(await page.locator('#notice').textContent(),/file worker could not start/);await first.context.unroute('**/save-worker.js');await page.locator('#retry-connection').click();await ready(page);
 console.log('PASS: a busy game lock preserves cloud files, and worker failure recovers through Retry.');
 await second.page.evaluate(async()=>{const link=JSON.parse(localStorage.getItem('h3-cloud-link-v2'));localStorage.setItem('h3-cloud-link-v2',JSON.stringify({...link,dirty:true}));await fetch('/api/logout',{method:'POST'});});await second.page.reload();await screen(second.page,'login');await idle(second.page);await signup(second.page,'BrowserTwo');await screen(second.page,'cache');await idle(second.page);assert.deepEqual(await readOPFS(second.page,'user/Saves/browser.vsgm1'),saveBytes);
 const safetyPromise=second.page.waitForEvent('download');await second.page.locator('#cache-backup').click();const safety=await safetyPromise;assert.ok((await readFile(await safety.path())).length>0);await screen(second.page,'library');await idle(second.page);assert.equal(await second.page.evaluate(async()=>{const r=await fetch('/api/saves/meta');return(await r.json()).revision;}),0);
 console.log('PASS: switching accounts exports dirty saves before clearing them and never uploads them to the new account.');
 for(const [name,init,expected]of [['storage',()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}}),'Browser settings storage'],['compression',()=>Object.defineProperty(window,'CompressionStream',{value:undefined}),'Gzip compression']]){const check=await contextPage(init);await check.page.goto(base);await screen(check.page,'unsupported');assert.ok((await check.page.locator('#unsupported-list').textContent()).includes(expected));await check.context.close();console.log('PASS: blocked '+name+' shows an actionable capability screen.');}
 const offline=await contextPage();await offline.context.route('**/api/status',route=>route.fulfill({contentType:'text/html',body:'<html>Service unavailable</html>'}));await offline.page.goto(base);await offline.page.waitForFunction(()=>!document.getElementById('retry-connection').hidden);assert.match(await offline.page.locator('#notice').textContent(),/HTML instead/);await offline.context.unroute('**/api/status');await offline.page.locator('#retry-connection').click();await screen(offline.page,'login');await idle(offline.page);await offline.context.close();assert.deepEqual(errors,[]);
 console.log('PASS: malformed API responses recover without an uncaught error or a database reset.');
 console.log('Browser checks passed with zero uncaught page errors. Engine gameplay uses fixtures in this check.');
}finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mf?.dispose();await rm(temporary,{recursive:true,force:true});
}
