import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createBackup,parseBackup} from '../../dist/backup-format.js';
import {libraryAAD,base64ToBytes} from '../../dist/library-format.js';
import {hashFile} from '../../dist/file-hash.js';
import {validGamePath,GAME_FOLDERS,MAX_GAME_FILES,MAX_GAME_FILE_BYTES,MAX_GAME_RAW_BYTES,MAX_LIBRARY_BYTES} from '../../dist/library-plan.js';
class MemoryFile {
  kind='file'; buffer=new Uint8Array(); size=0; open=false;
  get bytes(){return this.buffer.subarray(0,this.size);}
  set bytes(value){this.buffer=value;this.size=value.length;}
  reserve(size){if(size>this.buffer.length){const next=new Uint8Array(Math.max(size,Math.max(64,this.buffer.length*2)));next.set(this.bytes);this.buffer=next;}}
  constructor(name,state) {this.name=name;this.state=state;}
  async getFile() {return new Blob([this.bytes]);}
  async createSyncAccessHandle() {
    if(this.open)throw new Error('File already open');
    this.open=true;this.state.open++;
    return {
      truncate: size=>{this.reserve(size);if(size>this.size)this.buffer.fill(0,this.size,size);this.size=size;},
      // Deliberately short writes exercise the real partial-write handling.
      write: (bytes,{at})=>{const n=Math.min(3,bytes.length);this.reserve(at+n);this.buffer.set(bytes.subarray(0,n),at);this.size=Math.max(this.size,at+n);this.state.writes++;return n;},
      flush:()=>{},close:()=>{assert.equal(this.open,true);this.open=false;this.state.open--;}
    };
  }
}
class MemoryDirectory {
  kind='directory'; children=new Map();
  constructor(name,state){this.name=name;this.state=state;}
  async getDirectoryHandle(name,{create=false}={}) {
    if(!this.children.has(name)&&create)this.children.set(name,new MemoryDirectory(name,this.state));
    const entry=this.children.get(name);
    if(!entry)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    if(entry.kind!=='directory')throw new Error('Not a directory');
    return entry;
  }
  async getFileHandle(name,{create=false}={}) {
    if(!this.children.has(name)&&create)this.children.set(name,new MemoryFile(name,this.state));
    const entry=this.children.get(name);
    if(!entry)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    if(entry.kind!=='file')throw new Error('Not a file');
    return entry;
  }
  async *entries(){yield* this.children.entries();}
  async removeEntry(name){if(!this.children.delete(name))throw Object.assign(new Error('Not found'),{name:'NotFoundError'});}
}
function memory(){const state={open:0,writes:0};return {state,root:new MemoryDirectory('',state)};}
async function addFile(root,path,bytes) {
  const parts=path.split('/');const name=parts.pop();let dir=root;
  for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});
  const file=await dir.getFileHandle(name,{create:true});file.bytes=bytes;return file;
}
async function runWorker(name,data,root,onSafety,extra={}) {
  const messages=[];
  let script=await readFile(new URL(`../../dist/${name}`,import.meta.url),'utf8');
  script=script.replace(/^import .*;\n/gm,'');
  const context=vm.createContext({navigator:{storage:{getDirectory:async()=>root}},createBackup,parseBackup,MAX_FILES:5000,MAX_RAW_BYTES:128*1024*1024,MAX_BACKUP_BYTES:192*1024*1024,Blob,URL,AbortController,ReadableStream,TextEncoder,TextDecoder,atob,btoa,libraryAAD,base64ToBytes,hashFile,validGamePath,GAME_FOLDERS,MAX_GAME_FILES,MAX_GAME_FILE_BYTES,MAX_GAME_RAW_BYTES,MAX_LIBRARY_BYTES,Uint8Array,performance,setTimeout,clearTimeout,postMessage:message=>{
    messages.push(message);
    if(message.type==='safety'){onSafety?.(message);queueMicrotask(()=>context.onmessage({data:{type:'continue'}}));}
  },...extra});
  vm.runInContext(script,context);
  await context.onmessage({data});
  return messages;
}

export {memory,addFile,runWorker};
