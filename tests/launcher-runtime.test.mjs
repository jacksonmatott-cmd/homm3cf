import test from 'node:test';
import assert from 'node:assert/strict';
import {eventKey,browserKeepsKey,isPrintableKey} from '../dist/keyboard-policy.js';
import {runWorkerTask} from '../dist/worker-task.js';
import {missingFeatures,readSetting} from '../dist/browser-support.js';
import {fetchTimed,responseJSON} from '../dist/http-client.js';
import {apiJSON,setAPIAccount} from '../dist/cloud-sync.js';

test('keyboard routing tolerates absent, empty and non-string keys on every input path',()=>{
 for(const event of [{},{key:undefined},{key:null},{key:9},{key:''}]){assert.equal(eventKey(event),'');assert.equal(browserKeepsKey(event),true);assert.equal(isPrintableKey(event),false);}
 for(const event of [{key:'r',ctrlKey:true},{key:'R',metaKey:true},{key:'I',ctrlKey:true,shiftKey:true},{code:'KeyW',ctrlKey:true},{keyCode:122},{key:'Dead'},{key:'Process'},{key:'Unidentified'},{key:'x',isComposing:true}])assert.equal(!!browserKeepsKey(event),true);
 assert.equal(eventKey({code:'ArrowLeft'}),'ArrowLeft');assert.equal(eventKey({which:9}),'Tab');assert.equal(isPrintableKey({key:'🙂'}),true);assert.equal(isPrintableKey({key:'r',ctrlKey:true}),false);assert.equal(!!browserKeepsKey({key:'ArrowLeft'}),false);
});
class FakeWorker{
 static latest;terminated=0;sent=[];
 constructor(){FakeWorker.latest=this;}
 postMessage(message){this.sent.push(message);}
 terminate(){this.terminated++;}
 emit(data){return this.onmessage?.({data});}
}
const task=options=>runWorkerTask('fake-worker.js',{type:'test'},{WorkerClass:FakeWorker,...options});
test('worker tasks contain progress and safety callback rejections and close the worker',async()=>{
 const progress=task({onProgress:async()=>{throw new Error('progress failed');}}),one=FakeWorker.latest;await one.emit({type:'progress'});await assert.rejects(progress,/progress failed/);assert.equal(one.terminated,1);
 const safety=task({onSafety:async()=>{throw new Error('backup download failed');}}),two=FakeWorker.latest;await two.emit({type:'safety',bytes:new Uint8Array([1])});await assert.rejects(safety,/backup download failed/);assert.deepEqual(two.sent,[{type:'test'}]);assert.equal(two.terminated,1);
});
test('workers time out, reject unreadable messages and contain script/postMessage failures',async()=>{
 const timed=task({idleTimeout:5}),worker=FakeWorker.latest;await assert.rejects(timed,/stopped responding/);assert.equal(worker.terminated,1);
 for(const response of [undefined,{}, {type:'unexpected'}, {type:'error',message:'file damaged'}]){const promise=task(),w=FakeWorker.latest;await w.emit(response);await assert.rejects(promise);assert.equal(w.terminated,1);}
 const badMessage=task(),w=FakeWorker.latest;w.onmessageerror();await assert.rejects(badMessage,/could not read/);
 const script=task(),s=FakeWorker.latest;s.onerror({message:'script failed',preventDefault(){}});await assert.rejects(script,/script failed/);
 class BrokenWorker extends FakeWorker{postMessage(){throw new Error('could not clone');}}
 await assert.rejects(()=>task({WorkerClass:BrokenWorker}),/could not clone/);assert.equal(FakeWorker.latest.terminated,1);
});
test('valid worker safety acknowledgements precede completion and cleanup is exactly once',async()=>{
 let backup=false;const promise=task({onSafety:async()=>{backup=true;}}),w=FakeWorker.latest;await w.emit({type:'safety',bytes:new Uint8Array([1])});assert.equal(backup,true);assert.deepEqual(w.sent.at(-1),{type:'continue'});await w.emit({type:'done',count:3});assert.equal((await promise).count,3);assert.equal(w.terminated,1);assert.equal(w.onmessage,null);
});
function supportedEnv(){const values=new Map();return {isSecureContext:true,crossOriginIsolated:true,SharedArrayBuffer,HTMLCanvasElement:{prototype:{transferControlToOffscreen(){}}},navigator:{storage:{getDirectory(){}},cookieEnabled:true},Worker:FakeWorker,crypto:globalThis.crypto,CompressionStream,DecompressionStream,WebAssembly,localStorage:{setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)}};}
test('preflight reports missing storage, compression, encryption and workers without crashing',()=>{
 assert.deepEqual(missingFeatures(supportedEnv()),[]);const env=supportedEnv();Object.defineProperty(env,'localStorage',{get(){throw new Error('Blocked');}});env.CompressionStream=undefined;env.Worker=undefined;env.crypto=undefined;env.navigator.cookieEnabled=false;const missing=missingFeatures(env);for(const item of ['Browser settings storage','Gzip compression','Browser workers','Secure browser encryption','First-party cookies'])assert.ok(missing.some(s=>s.startsWith(item)),item);assert.doesNotThrow(()=>missingFeatures({}));assert.equal(readSetting('not-present'),null);
});
test('HTTP timeouts, invalid JSON and partial bodies are recoverable and preserve account guards',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));await assert.rejects(()=>fetchTimed('/test',{},5),/timed out/);
  for(const text of ['<html>Error</html>','null','[]','bad json'])await assert.rejects(()=>responseJSON(new Response(text)),/unreadable|HTML|empty/);
  await assert.rejects(()=>responseJSON({json:()=>new Promise(()=>{})},5),/incomplete/);
  setAPIAccount('expected-account');globalThis.fetch=async(url,options)=>{assert.equal(new Headers(options.headers).get('X-H3-Account'),'expected-account');return new Response(JSON.stringify({files:[]}));};assert.deepEqual(await apiJSON('/library'),{files:[]});
 }finally{globalThis.fetch=original;setAPIAccount(null);}
});


test('upload response errors identify provider status, step and Cloudflare limits without echoing HTML',async()=>{
 const response=new Response('<html><h1>Error</h1><span class="code">1102</span><p>secret test markup</p></html>',{status:500,headers:{'Content-Type':'text/html','cf-ray':'diagnostic-reference'}});
 await assert.rejects(()=>responseJSON(response,{label:'Starting upload'}),error=>{assert.match(error.message,/Starting upload/);assert.match(error.message,/HTTP 500/);assert.match(error.message,/Cloudflare 1102/);assert.match(error.message,/processing limit/);assert.doesNotMatch(error.message,/secret test markup|<html>/);assert.equal(error.retryable,true);return true;});
 const denied=new Response('<html>Access denied</html>',{status:403,headers:{'Content-Type':'text/html'}});await assert.rejects(()=>responseJSON(denied,{label:'Uploading part 2/8'}),error=>{assert.match(error.message,/Uploading part 2/);assert.match(error.message,/HTTP 403/);assert.equal(error.retryable,false);return true;});
});
