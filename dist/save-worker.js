// Personal launcher additions, 2026-10-28. SPDX-License-Identifier: GPL-2.0-or-later
import {createBackup, parseBackup, MAX_FILES, MAX_RAW_BYTES, MAX_BACKUP_BYTES} from './backup-format.js';
let continueRestore;

async function readUserFiles() {
  const entries = [];
  let total = 0;
  const root = await navigator.storage.getDirectory();
  let user;
  try { user = await root.getDirectoryHandle('user'); }
  catch (error) { if (error.name === 'NotFoundError') return entries; throw error; }
  async function walk(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix + name;
      if (handle.kind === 'directory') await walk(handle, path + '/');
      else {
        const file = await handle.getFile();
        total += file.size;
        if (total > MAX_RAW_BYTES || entries.length >= MAX_FILES) throw new Error('Saves exceed the backup size limit.');
        entries.push({path, bytes: new Uint8Array(await file.arrayBuffer())});
      }
    }
  }
  await walk(user, '');
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function writeUserFiles(entries) {
  const root = await navigator.storage.getDirectory();
  const user = await root.getDirectoryHandle('user', {create: true});
  let count = 0;
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const name = parts.pop();
    let dir = user;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, {create: true});
    const file = await dir.getFileHandle(name, {create: true});
    const handle = await file.createSyncAccessHandle();
    try {
      handle.truncate(0);
      let offset = 0;
      while (offset < entry.bytes.length) {
        const written = handle.write(entry.bytes.subarray(offset), {at: offset});
        if (written <= 0) throw new Error('Browser storage stopped accepting data.');
        offset += written;
      }
      handle.flush();
    } finally { handle.close(); }
    postMessage({type: 'progress', message: `Restoring ${++count} of ${entries.length} files…`});
  }
}

async function inspectUserFiles() {
  let count=0;const root=await navigator.storage.getDirectory();let user;
  try {user=await root.getDirectoryHandle('user');}catch(error){if(error.name==='NotFoundError')return 0;throw error;}
  async function walk(dir){for await(const [,handle]of dir.entries()){if(handle.kind==='file')count++;else await walk(handle);}}
  await walk(user);return count;
}
async function trimUserFiles(entries) {
  const wanted=new Set(entries.map(entry=>entry.path));
  const user=await(await navigator.storage.getDirectory()).getDirectoryHandle('user');
  async function walk(dir,prefix){for await(const [name,handle]of dir.entries()){const path=prefix+name;if(handle.kind==='directory')await walk(handle,path+'/');else if(!wanted.has(path))await dir.removeEntry(name);}}
  await walk(user,'');
}
onmessage = async ({data}) => {
  if (data.type === 'continue') { continueRestore?.(); return; }
  try {
    if (data.type === 'inspect') { postMessage({type:'done',count:await inspectUserFiles()});
    } else if(data.type === 'clear-local') {
      const root=await navigator.storage.getDirectory();
      for(const name of ['user','h3']){try{await root.removeEntry(name,{recursive:true});}catch(error){if(error.name!=='NotFoundError')throw error;}}
      postMessage({type:'done'});
    } else if (data.type === 'export') {
      const bytes = await createBackup(await readUserFiles());
      postMessage({type: 'done', bytes}, [bytes.buffer]);
    } else if (data.type === 'restore') {
      if (!data.file || data.file.size > MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 192 MiB.');
      const entries = await parseBackup(new Uint8Array(await data.file.arrayBuffer()));
      const previous = await readUserFiles();
      // The page offers a safety download before any existing save is replaced.
      if (previous.length && !data.skipSafety) {
        const bytes = await createBackup(previous);
        const accepted = new Promise(resolve => { continueRestore = resolve; });
        postMessage({type: 'safety', bytes}, [bytes.buffer]);
        await accepted;
      }
      try { await writeUserFiles(entries); if(data.replace)await trimUserFiles(entries); }
      catch (error) { throw new Error(`Restore stopped: ${error.message}. Some files may have been restored. Use your safety backup to recover earlier saves.`); }
      postMessage({type: 'done', count: entries.length, safety: previous.length > 0 && !data.skipSafety});
    } else throw new Error('Unknown save operation.');
  } catch (error) { postMessage({type: 'error', message: error?.message || String(error)}); }
};
