import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildWebWorker} from '../scripts/build-pages-worker.mjs';
import {prepareLibrary} from '../dist/game-upload.js';
import {librarySummary,metadataPages} from '../dist/library-plan.js';
test('real Workers runtime stores and retrieves authenticated binary D1 parts',async()=>{
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await buildWebWorker(),compatibilityDate:'2026-10-28',d1Databases:['DB']}));
let cookie;const base='https://heroes.example';
async function request(path,method='GET',value,binary=false){const headers={};if(cookie)headers.Cookie=cookie;if(method!=='GET')headers.Origin=base;if(value!==undefined)headers['Content-Type']=binary?'application/octet-stream':'application/json';return mf.dispatchFetch(base+path,{method,headers,body:value===undefined?undefined:binary?value:JSON.stringify(value)});}
try{
 const r=await request('/api/register','POST',{username:'RuntimeCheck',salt:'ae'.repeat(16),proof:'ab'.repeat(32)});assert.equal(r.status,201,await r.clone().text());cookie=r.headers.get('Set-Cookie').split(';')[0];
 const {plan,payloads}=await prepareLibrary(['Data/H3bitmap.lod','Data/H3sprite.lod','Data/Heroes3.snd'].map(path=>({path,file:new File([path.endsWith('.lod')?Buffer.concat([Buffer.from('LOD\0'),randomBytes(220000)]):'sounds'],path.split('/').at(-1))})));
 assert.equal(Math.max(...payloads.map(p=>p.size)),65552);
 const start=await request('/api/game-library/start','POST',librarySummary(plan,0));assert.equal(start.status,200,await start.clone().text());
 for(const page of metadataPages(plan)){const result=await request(`/api/game-library/uploads/${plan.version}/files`,'POST',page);assert.equal(result.status,200,await result.clone().text());}
 for(let i=0;i<payloads.length;i++){const part=await request(`/api/game-library/uploads/${plan.version}/parts/${i}`,'PUT',new Uint8Array(await payloads[i].arrayBuffer()),true);assert.equal(part.status,200,await part.clone().text());}
 const finish=await request(`/api/game-library/uploads/${plan.version}/finish`,'POST');assert.equal(finish.status,200,await finish.clone().text());const manifest=await(await request('/api/library')).json();assert.equal(manifest.files.length,3);const bytes=await(await request(manifest.files[0].chunks[0].url)).arrayBuffer();assert.deepEqual(new Uint8Array(bytes),new Uint8Array(await payloads[0].arrayBuffer()));

}finally{await mf.dispose();}
});
