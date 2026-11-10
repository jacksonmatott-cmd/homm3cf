import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {memory,addFile,runWorker} from './helpers/storage.mjs';
import {webcrypto} from 'node:crypto';
import {createBackup, parseBackup, validPath} from '../dist/backup-format.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const encode = data => new TextEncoder().encode(JSON.stringify(data));
const sample = [{path:'Saves/test.vsgm1',bytes:Uint8Array.from([0,1,2,3,254,255])},{path:'config/settings.json',bytes:new TextEncoder().encode('{"language":"english"}')}];

test('binary saves, nested settings, and zero-length files survive a backup round trip', async () => {
  const original = [...sample,{path:'empty',bytes:new Uint8Array()}];
  const result = await parseBackup(await createBackup(original));
  assert.deepEqual(result,original);
});
test('large save files survive base64 encoding without a regexp stack overflow', async () => {
  const original = [{path:'Saves/large.vsgm1',bytes:Uint8Array.from({length:512*1024},(_,i)=>i%256)}];
  assert.deepEqual(await parseBackup(await createBackup(original)),original);
});
test('corrupted content is rejected before restoration', async () => {
  const data = JSON.parse(new TextDecoder().decode(await createBackup(sample)));
  data.files[0].base64 = 'AAECA/7+';
  await assert.rejects(parseBackup(encode(data)),/checksum/);
});
test('path traversal, absolute paths, backslashes, and duplicates are rejected', async () => {
  for (const path of ['../h3/Data/H3bitmap.lod','/Saves/game','Saves/../../file','Saves\\file','C:/file','Saves//file','Saves/./file']) {
    assert.equal(validPath(path),false);
    const data = JSON.parse(new TextDecoder().decode(await createBackup(sample)));
    data.files[0].path = path;
    await assert.rejects(parseBackup(encode(data)),/unsafe/);
  }
  const data = JSON.parse(new TextDecoder().decode(await createBackup(sample)));
  data.files.push({...data.files[0],path:'saves/TEST.vsgm1'});
  await assert.rejects(parseBackup(encode(data)),/duplicate/);
});
test('foreign, truncated, oversized, and unsupported-version backups are rejected', async () => {
  await assert.rejects(parseBackup(new TextEncoder().encode('broken')),/valid/);
  await assert.rejects(parseBackup(encode({kind:'other',version:1,files:[]})),/not supported/);
  const data = JSON.parse(new TextDecoder().decode(await createBackup(sample)));
  data.version = 99; await assert.rejects(parseBackup(encode(data)),/not supported/);
  data.version = 1; data.files[0].size = 129*1024*1024;
  await assert.rejects(parseBackup(encode(data)),/sizes/);
});

test('import worker completes partial writes, closes files, and clear keeps saves', async () => {
  const {root,state}=memory();const sentinel=await addFile(root,'user/Saves/old.vsgm1',new Uint8Array([7]));
  const contents=Uint8Array.from({length:37},(_,i)=>i);
  const messages=await runWorker('import-worker.js',{type:'import',files:[{dest:'Data/H3bitmap.lod',file:new Blob([contents])}]},root);
  assert.equal(messages.at(-1).type,'done');
  const file=await (await (await root.getDirectoryHandle('h3')).getDirectoryHandle('Data')).getFileHandle('H3bitmap.lod');
  assert.deepEqual(file.bytes,contents);assert.equal(state.open,0);
  await runWorker('import-worker.js',{type:'clear'},root);
  assert.equal(root.children.has('h3'),false);assert.deepEqual(sentinel.bytes,new Uint8Array([7]));
});
test('restore offers a safety backup before writing, keeps other saves and imported game data', async () => {
  const {root,state}=memory();const current=await addFile(root,'user/Saves/test.vsgm1',new Uint8Array([99]));
  const extra=await addFile(root,'user/Saves/extra.vsgm1',new Uint8Array([42]));
  const gameData=await addFile(root,'h3/Data/H3bitmap.lod',new Uint8Array([76,79,68,0]));
  let safety;
  const bytes=await createBackup(sample);
  const messages=await runWorker('save-worker.js',{type:'restore',file:new Blob([bytes])},root,m=>{assert.equal(state.writes,0);safety=m.bytes;});
  assert.equal(messages.at(-1).type,'done');assert.equal(messages.at(-1).count,2);
  assert.deepEqual(current.bytes,sample[0].bytes);assert.deepEqual(extra.bytes,new Uint8Array([42]));assert.deepEqual(gameData.bytes,new Uint8Array([76,79,68,0]));
  assert.equal(state.open,0);assert.ok(safety);
  const before=await parseBackup(safety);assert.ok(before.some(f=>f.path==='Saves/test.vsgm1'&&f.bytes[0]===99));
});
test('invalid backups cause no storage writes, and exports contain no game assets', async () => {
  const {root,state}=memory();await addFile(root,'user/Saves/old.vsgm1',new Uint8Array([8]));
  await addFile(root,'h3/Data/H3bitmap.lod',new Uint8Array([76,79,68,0]));
  const invalid=await runWorker('save-worker.js',{type:'restore',file:new Blob(['invalid'])},root);
  assert.equal(invalid.at(-1).type,'error');assert.equal(state.writes,0);
  const exported=await runWorker('save-worker.js',{type:'export'},root);
  assert.deepEqual((await parseBackup(exported.at(-1).bytes)).map(f=>f.path),['Saves/old.vsgm1']);
});
